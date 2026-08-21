import { Platform } from 'react-native';
import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  browserLocalPersistence,
  // @ts-ignore — getReactNativePersistence is not in the published types yet,
  // and it does not exist at all in the web build (see the Platform check below)
  getReactNativePersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Config comes from .env (EXPO_PUBLIC_* is inlined into the bundle at build
// time). These values are not secrets — they ship in every client build, and
// Firestore security rules are what actually protect the data.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

if (!firebaseConfig.projectId) {
  throw new Error(
    'Firebase is not configured. Copy .env.example to .env and fill in the ' +
      'values from Firebase Console > Project settings > General > Your apps.'
  );
}

const app = initializeApp(firebaseConfig);

// Persistence keeps the user signed in across app restarts. The helper differs
// per platform: firebase/auth resolves to a browser build on web, which does
// not export getReactNativePersistence at all, so calling it there throws
// "getReactNativePersistence is not a function" during the expo-router render.
const auth = initializeAuth(app, {
  persistence:
    Platform.OS === 'web'
      ? browserLocalPersistence
      : getReactNativePersistence(AsyncStorage),
});

const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
