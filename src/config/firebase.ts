import { initializeApp } from 'firebase/app';
// @ts-ignore
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { connectAuthEmulator } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Firebase configuration targeting the local emulator suite or production.
// When using the emulator, these values can be dummy variables.
const firebaseConfig = {
  apiKey: "demo-api-key",
  authDomain: "demo-activklass.firebaseapp.com",
  projectId: "demo-activklass",
  storageBucket: "demo-activklass.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000",
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth with AsyncStorage persistence for React Native
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Initialize Firestore & Storage
const db = getFirestore(app);
const storage = getStorage(app);

// Dynamic Host IP detection for Emulator Testing
// On physical devices or simulators, localhost is not reachable.
// expo-constants lets us discover the IP address of the development machine running Metro.
const hostUri = Constants.expoConfig?.hostUri;
const hostIp = hostUri ? hostUri.split(':')[0] : 'localhost';

const USING_EMULATOR = true; // Set to false to point to a production Firebase instance

if (USING_EMULATOR) {
  console.log(`[FirebaseConfig] Connecting to Firebase Emulators at ${hostIp}`);
  
  // Connect Auth Emulator
  connectAuthEmulator(auth, `http://${hostIp}:9099`, { disableWarnings: true });
  
  // Connect Firestore Emulator
  connectFirestoreEmulator(db, hostIp, 8080);
  
  // Connect Storage Emulator
  connectStorageEmulator(storage, hostIp, 9199);
}

export { app, auth, db, storage, hostIp };
