import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

export interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  email: string;
  role: 'student' | 'parent' | 'teacher' | 'admin';
  /** Guardians register with one; the parent profile screen edits it. */
  contact_number?: string | null;
  /** Set on accounts an admin provisioned; forces the change-password screen. */
  is_temp_password?: boolean;
  student_number?: string;
  lrn?: string;
  birthdate?: string;
  age?: number;
  course?: string;
  year_level?: string;
  grade_level?: string;
  status: 'active' | 'pending' | 'inactive';
}

export type AuthStatus = 'loading' | 'signed_out' | 'not_registered' | 'signed_in' | 'error';

interface AuthContextType {
  firebaseUser: User | null;
  profile: UserProfile | null;
  status: AuthStatus;
  errorDetail: string | null;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setProfile(null);
        setStatus('signed_out');
        return;
      }
      
      const snap = await getDoc(doc(db, 'users', uid));
      if (!snap.exists()) {
        setProfile(null);
        setStatus('not_registered');
        return;
      }
      
      const data = snap.data();
      setProfile({ id: uid, ...data } as UserProfile);
      setStatus('signed_in');
      setErrorDetail(null);
    } catch (err: any) {
      console.error('[AuthContext] Error loading profile:', err);
      setProfile(null);
      setStatus('error');
      
      const hint = {
        'permission-denied': 'Firestore permission denied. Please deploy Firestore security rules.',
        'unavailable': 'Firestore is unreachable. Verify network connection and emulator configurations.',
      }[err.code as string] ?? 'Verify database connection and credentials.';
      
      setErrorDetail(`Failed to fetch profile (${err.code ?? err.message}). ${hint}`);
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user) {
        setStatus('loading');
        loadProfile();
      } else {
        setProfile(null);
        setStatus('signed_out');
      }
    });
  }, [loadProfile]);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('[AuthContext] Error signing out:', err);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        status,
        errorDetail,
        logout,
        refreshProfile: loadProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};
