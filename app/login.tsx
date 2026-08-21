import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../src/config/firebase';
import { useAuth } from '../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { useThemeColors } from '../src/theme';

const FRIENDLY_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect identifier or password.',
  'auth/user-not-found': 'No account found with that identifier.',
  'auth/wrong-password': 'Incorrect identifier or password.',
  'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'auth/invalid-email': 'That email address is not valid.',
};

export default function LoginScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const { refreshProfile } = useAuth();
  
  const [identifier, setIdentifier] = useState('');
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

    /* Everyone signs in with a real email address.
       The old p-<student_number> -> p-<student_number>@activklass.com
       translation is gone: that scheme encoded exactly one parent per student,
       and guardians now register with their own email and link by redeeming a
       6-character code (see app/parent/details.tsx). Accounts created under the
       old scheme still sign in — their p-...@activklass.com address is a real
       address — they just have to type it in full. */
    const loginEmail = identifier.trim().toLowerCase();
    if (!loginEmail.includes('@')) {
      setError('Please enter your full email address.');
      setLoading(false);
      return;
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
    <SafeAreaView className="flex-1 bg-canvas">
      <StatusBar style="auto" />
      {/* Padding and justify-between belong to the CONTENT container, not the
          ScrollView. React Native throws a render error for child layout props
          set on the scroll view itself, and NativeWind was compiling the
          className straight onto it. flex-grow replaces the old
          contentContainerStyle={{ flexGrow: 1 }}, which did the same job. */}
      <ScrollView contentContainerClassName="flex-grow px-6 py-10 justify-between">
        
        {/* Back Button */}
        <TouchableOpacity 
          onPress={() => router.back()} 
          className="self-start w-10 h-10 items-center justify-center bg-surface border border-hairline rounded-xl"
        >
          <Text className="text-ink text-lg font-bold">←</Text>
        </TouchableOpacity>

        {/* Central Auth Container */}
        <View className="my-auto">
          {/* Header */}
          <View className="mb-8">
            <Text className="text-ink text-3xl font-extrabold font-sans">
              Welcome Back
            </Text>
            <Text className="text-ink-muted text-sm mt-2 font-sans">
              Sign in to your Student or Parent account to continue.
            </Text>
          </View>

          {/* Form */}
          <View className="space-y-4">
            
            {/* Error Message */}
            {error && (
              <View className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl mb-4">
                <Text className="text-danger text-xs font-semibold leading-relaxed">
                  {error}
                </Text>
              </View>
            )}

            {/* Email/Username input */}
            <View>
              <Text className="text-ink-soft text-xs font-bold mb-2 uppercase tracking-wider">
                Email
              </Text>
              <TextInput
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="you@example.com"
                placeholderTextColor={c.inkFaint}
                autoCapitalize="none"
                keyboardType="email-address"
                className="w-full bg-surface border border-hairline p-4 rounded-xl text-ink text-sm focus:border-accent"
              />
            </View>

            {/* Password input */}
            <View className="mt-4">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-ink-soft text-xs font-bold uppercase tracking-wider">
                  Password
                </Text>
                <TouchableOpacity onPress={() => {
                  Alert.alert("Password Reset", "Please contact your school administrator or teacher to reset your system credentials.");
                }}>
                  <Text className="text-accent-text text-xs font-semibold">Forgot?</Text>
                </TouchableOpacity>
              </View>
              <View className="relative">
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor={c.inkFaint}
                  secureTextEntry={!showPassword}
                  className="w-full bg-surface border border-hairline p-4 rounded-xl text-ink text-sm focus:border-accent"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-4"
                >
                  <Text className="text-ink-muted text-xs font-semibold">
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
              className="w-full bg-accent py-4 rounded-xl items-center justify-center mt-6 shadow-lg shadow-indigo-600/25"
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text className="text-on-accent text-base font-bold font-sans">
                  Sign In
                </Text>
              )}
            </TouchableOpacity>

          </View>
        </View>

        {/* Footer */}
        <View className="items-center mt-8">
          <Text className="text-ink-faint text-xs font-medium">
            ActivKlass Class Record System · Pilot Cebu
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
