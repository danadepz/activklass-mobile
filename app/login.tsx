import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../src/config/firebase';
import { useAuth } from '../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';

const FRIENDLY_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect identifier or password.',
  'auth/user-not-found': 'No account found with that identifier.',
  'auth/wrong-password': 'Incorrect identifier or password.',
  'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'auth/invalid-email': 'That username format is not valid.',
};

export default function LoginScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  
  const [identifier, setIdentifier] = useState(''); // Can be email or p-<student_number>
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    setError(null);

    // Dynamic translation for parent username:
    // If the input is p-<student_number> (e.g. p-20231015) and not a full email,
    // translate it to the standard firebase auth email p-<student_number>@activklass.com
    let loginEmail = identifier.trim();
    if (!loginEmail.includes('@')) {
      if (loginEmail.startsWith('p-')) {
        loginEmail = `${loginEmail}@activklass.com`;
      } else {
        // Assume student is using their email or they typed their student ID.
        // If they just typed a username/student ID without @, we might notify them,
        // or for testing assume student email format. Let's just keep it as is.
      }
    }

    try {
      // 1. Sign in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, loginEmail, password);
      const user = userCredential.user;

      // 2. Fetch the Firestore user profile to enforce roles
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        await auth.signOut();
        setError('No profile found. Please register or contact support.');
        setLoading(false);
        return;
      }

      const profileData = userDoc.data();
      const role = profileData.role;

      if (role === 'teacher' || role === 'admin') {
        // Enforce mobile restrictions for staff
        await auth.signOut();
        setError('Teachers and Administrators must sign in using the Web Portal.');
        setLoading(false);
        return;
      }

      // 3. Refresh our context profile
      await refreshProfile();

      // 4. Redirect based on role
      if (profileData.is_temp_password) {
        router.replace('/parent/change-pass');
      } else if (role === 'student') {
        router.replace('/student/dashboard');
      } else if (role === 'parent') {
        router.replace('/parent/dashboard');
      } else {
        await auth.signOut();
        setError('Unauthorized access role.');
      }
    } catch (err: any) {
      console.error('[Login] Auth error:', err);
      const code = err.code || '';
      setError(FRIENDLY_ERRORS[code] ?? 'Sign in failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-10 justify-between">
        
        {/* Back Button */}
        <TouchableOpacity 
          onPress={() => router.back()} 
          className="self-start w-10 h-10 items-center justify-center bg-slate-900 border border-slate-800 rounded-xl"
        >
          <Text className="text-white text-lg font-bold">←</Text>
        </TouchableOpacity>

        {/* Central Auth Container */}
        <View className="my-auto">
          {/* Header */}
          <View className="mb-8">
            <Text className="text-white text-3xl font-extrabold font-sans">
              Welcome Back
            </Text>
            <Text className="text-slate-400 text-sm mt-2 font-sans">
              Sign in to your Student or Parent account to continue.
            </Text>
          </View>

          {/* Form */}
          <View className="space-y-4">
            
            {/* Error Message */}
            {error && (
              <View className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl mb-4">
                <Text className="text-red-400 text-xs font-semibold leading-relaxed">
                  {error}
                </Text>
              </View>
            )}

            {/* Email/Username input */}
            <View>
              <Text className="text-slate-300 text-xs font-bold mb-2 uppercase tracking-wider">
                Email or Username
              </Text>
              <TextInput
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="student@school.edu.ph or p-20231015"
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                keyboardType="email-address"
                className="w-full bg-slate-900 border border-slate-850 p-4 rounded-xl text-white text-sm focus:border-indigo-500"
              />
            </View>

            {/* Password input */}
            <View className="mt-4">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-slate-300 text-xs font-bold uppercase tracking-wider">
                  Password
                </Text>
                <TouchableOpacity onPress={() => {
                  Alert.alert("Password Reset", "Please contact your school administrator or teacher to reset your system credentials.");
                }}>
                  <Text className="text-indigo-400 text-xs font-semibold">Forgot?</Text>
                </TouchableOpacity>
              </View>
              <View className="relative">
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor="#64748b"
                  secureTextEntry={!showPassword}
                  className="w-full bg-slate-900 border border-slate-850 p-4 rounded-xl text-white text-sm focus:border-indigo-500"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-4"
                >
                  <Text className="text-slate-400 text-xs font-semibold">
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
              className="w-full bg-indigo-600 py-4 rounded-xl items-center justify-center mt-6 shadow-lg shadow-indigo-600/25"
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text className="text-white text-base font-bold font-sans">
                  Sign In
                </Text>
              )}
            </TouchableOpacity>

          </View>
        </View>

        {/* Footer */}
        <View className="items-center mt-8">
          <Text className="text-slate-500 text-xs font-medium">
            ActivKlass Class Record System · Pilot Cebu
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
