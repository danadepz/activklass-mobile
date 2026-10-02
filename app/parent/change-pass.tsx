import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { updatePassword, signOut, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../src/config/firebase';
import { useAuth } from '../../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { useRequireAuth } from '../../src/hooks/useRequireAuth';
import { useThemeColors } from '../../src/theme';
import { passwordError, PASSWORD_RULE } from '../../src/lib/validation';

export default function ParentChangePassScreen() {
  const c = useThemeColors();
  useRequireAuth({ allowTempPassword: true });
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();

  // Two ways in: forced here at sign-in on a provisioned account, or reached
  // deliberately from the profile screen. Only the first is a first-time setup,
  // and only the first should land on the dashboard afterwards.
  const isForced = Boolean(profile?.is_temp_password);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdatePassword = async () => {
    // 1. In voluntary flow, verify current password is provided before touching anything
    if (!isForced && !currentPassword.trim()) {
      setError('Please enter your current password.');
      return;
    }

    if (!newPassword.trim() || !confirmPassword.trim()) {
      setError(isForced ? 'Please fill in both password fields.' : 'Please fill in both new password fields.');
      return;
    }

    const weak = passwordError(newPassword);
    if (weak) {
      setError(weak);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setError('No active session. Please log in again.');
        setLoading(false);
        return;
      }

      // 2. Reauthenticate when changing password voluntarily
      if (!isForced) {
        const email = currentUser.email || profile?.email;
        if (!email) {
          setError('No user email found. Please sign in again.');
          setLoading(false);
          return;
        }
        const credential = EmailAuthProvider.credential(email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
      }

      // 3. Update password in Firebase Auth
      await updatePassword(currentUser, newPassword);

      // 4. Remove is_temp_password flag from Firestore user profile, and stamp
      //    when it happened. Best-effort after the fact, matching web.
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          is_temp_password: false,
          password_changed_at: serverTimestamp(),
        });
      } catch (flagErr) {
        console.warn('[ParentChangePass] password state not recorded:', flagErr);
      }

      // 5. Refresh context profile so that status updates
      if (typeof refreshProfile === 'function') {
        await refreshProfile();
      }

      // 6. Forced first-time setup ends at the dashboard; a voluntary change
      //    returns to wherever they came from.
      if (isForced) {
        router.replace('/parent/dashboard');
      } else {
        router.back();
      }

    } catch (err: any) {
      console.error('[ParentChangePass] Error updating password:', err);
      const code = err?.code || '';
      if (
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/user-mismatch'
      ) {
        setError('Current password is incorrect.');
      } else if (code === 'auth/requires-recent-login') {
        setError('Security threshold reached. Please sign out and sign back in to change your password.');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else if (code === 'auth/weak-password') {
        setError('Password is too weak. Please choose a stronger password.');
      } else if (
        typeof err?.message === 'string' &&
        !err.message.includes('auth/') &&
        !err.message.startsWith('Firebase:')
      ) {
        setError(err.message);
      } else {
        setError('Password update failed. Please try again.');
      }
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
        
        {/* Header */}
        <View className="mb-6 mt-6">
          <Text className="text-ink text-3xl font-extrabold font-sans">
            {isForced ? 'Set New Password' : 'Change Password'}
          </Text>
          <Text className="text-ink-muted text-sm mt-2 font-sans">
            {isForced
              ? 'Update your password to secure your account.'
              : 'Enter your current password to confirm your identity.'}
          </Text>
        </View>

        {/* Security Warning Notice — only true when they were sent here. */}
        {isForced && (
          <View className="bg-indigo-950/20 border border-accent/30 p-4 rounded-xl mb-6">
            <Text className="text-ink-soft text-xs leading-relaxed">
              🔒 <Text className="font-semibold text-ink-soft">First-Time Setup:</Text> You are currently logged in with a temporary password. You must configure a new, personal password to access your child&apos;s student records.
            </Text>
          </View>
        )}

        {/* Form Fields */}
        <View className="flex-1 justify-center space-y-4">
          
          {error && (
            <View className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl mb-4">
              <Text className="text-danger text-xs font-semibold">
                {error}
              </Text>
            </View>
          )}

          {/* Current Password - only for voluntary changes */}
          {!isForced && (
            <View>
              <Text className="text-ink-soft text-xs font-bold mb-2 uppercase tracking-wider">
                Current Password
              </Text>
              <View className="relative">
                <TextInput
                  testID="input-current-password"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Enter your current password"
                  placeholderTextColor={c.inkFaint}
                  secureTextEntry={!showCurrentPassword}
                  className="w-full bg-surface border border-hairline p-4 pr-16 rounded-xl text-ink text-sm focus:border-accent"
                />
                <TouchableOpacity
                  onPress={() => setShowCurrentPassword((s) => !s)}
                  accessibilityRole="button"
                  accessibilityLabel={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                  className="absolute right-4 top-4"
                >
                  <Text className="text-ink-muted text-xs font-semibold">
                    {showCurrentPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* New Password */}
          <View className={!isForced ? 'mt-4' : ''}>
            <Text className="text-ink-soft text-xs font-bold mb-2 uppercase tracking-wider">
              New Password
            </Text>
            <View className="relative">
              <TextInput
                testID="input-new-password"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="8+ chars with uppercase, lowercase, number & symbol"
                placeholderTextColor={c.inkFaint}
                secureTextEntry={!showNewPassword}
                className="w-full bg-surface border border-hairline p-4 pr-16 rounded-xl text-ink text-sm focus:border-accent"
              />
              <TouchableOpacity
                onPress={() => setShowNewPassword((s) => !s)}
                accessibilityRole="button"
                accessibilityLabel={showNewPassword ? 'Hide new password' : 'Show new password'}
                className="absolute right-4 top-4"
              >
                <Text className="text-ink-muted text-xs font-semibold">
                  {showNewPassword ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text className="text-ink-muted text-xs mt-1.5 font-sans">
              {PASSWORD_RULE}
            </Text>
          </View>

          {/* Confirm Password */}
          <View className="mt-4">
            <Text className="text-ink-soft text-xs font-bold mb-2 uppercase tracking-wider">
              Confirm Password
            </Text>
            <View className="relative">
              <TextInput
                testID="input-confirm-password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter new password"
                placeholderTextColor={c.inkFaint}
                secureTextEntry={!showConfirmPassword}
                className="w-full bg-surface border border-hairline p-4 pr-16 rounded-xl text-ink text-sm focus:border-accent"
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword((s) => !s)}
                accessibilityRole="button"
                accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                className="absolute right-4 top-4"
              >
                <Text className="text-ink-muted text-xs font-semibold">
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

        </View>

        {/* Submit */}
        <View className="mt-8">
          <TouchableOpacity
            onPress={handleUpdatePassword}
            disabled={loading}
            activeOpacity={0.8}
            className="w-full bg-accent py-4 rounded-xl items-center justify-center shadow-lg shadow-indigo-600/25"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text className="text-on-accent text-base font-bold font-sans">
                Update Password &amp; Continue
              </Text>
            )}
          </TouchableOpacity>

          {/* Signing out is the only way out of a forced setup. A guardian who
              came here by choice just wants to back out. */}
          <TouchableOpacity
            onPress={async () => {
              if (isForced) {
                await signOut(auth);
                router.replace('/login');
              } else {
                router.back();
              }
            }}
            disabled={loading}
            className="w-full items-center justify-center mt-4"
          >
            <Text className="text-ink-muted text-sm font-semibold">
              {isForced ? 'Sign Out' : 'Cancel'}
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
