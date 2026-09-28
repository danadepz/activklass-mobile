import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { updatePassword, signOut } from 'firebase/auth';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../src/config/firebase';
import { useAuth } from '../../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { useRequireAuth } from '../../src/hooks/useRequireAuth';
import { useThemeColors } from '../../src/theme';
import { passwordError } from '../../src/lib/validation';

export default function StudentChangePassScreen() {
  const c = useThemeColors();
  useRequireAuth({ allowTempPassword: true });
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();

  // Two ways in: forced at sign-in on an issued student account, or reached
  // deliberately from the student profile screen. Only the first is a first-time setup,
  // and only the first should land on the student dashboard afterwards.
  const isForced = Boolean(profile?.is_temp_password);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdatePassword = async () => {
    if (!newPassword.trim() || !confirmPassword.trim()) {
      setError('Please fill in both password fields.');
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

      // 1. Update password in Firebase Auth
      await updatePassword(currentUser, newPassword);

      // 2. Remove is_temp_password flag from Firestore user profile, and stamp
      //    when it happened. Best-effort after Auth update, matching web.
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          is_temp_password: false,
          password_changed_at: serverTimestamp(),
        });
      } catch (flagErr) {
        console.warn('[StudentChangePass] password state not recorded:', flagErr);
      }

      // 3. Refresh context profile so that status updates
      await refreshProfile();

      // 4. Forced first-time setup ends at the student dashboard; a voluntary change
      //    returns to wherever they came from (e.g. profile).
      if (isForced) {
        router.replace('/student/dashboard');
      } else {
        router.back();
      }

    } catch (err: any) {
      console.error('[StudentChangePass] Error updating password:', err);
      if (err.code === 'auth/requires-recent-login') {
        setError('Security threshold reached. Please sign out and sign back in to change your password.');
      } else {
        setError(err.message || 'Password update failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <StatusBar style="auto" />
      <ScrollView contentContainerClassName="flex-grow px-6 py-10 justify-between">
        
        {/* Header */}
        <View className="mb-6 mt-6">
          <Text className="text-ink text-3xl font-extrabold font-sans">
            Set New Password
          </Text>
          <Text className="text-ink-muted text-sm mt-2 font-sans">
            Update your password to secure your student account.
          </Text>
        </View>

        {/* Security Warning Notice — shown when held on forced setup. */}
        {isForced && (
          <View className="bg-indigo-950/20 border border-accent/30 p-4 rounded-xl mb-6">
            <Text className="text-ink-soft text-xs leading-relaxed">
              🔒 <Text className="font-semibold text-ink-soft">First-Time Setup:</Text> Your account was set up for you with a temporary school password. You must configure a new, personal password before accessing your student dashboard.
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

          {/* New Password */}
          <View>
            <Text className="text-ink-soft text-xs font-bold mb-2 uppercase tracking-wider">
              New Password
            </Text>
            <View className="relative">
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Minimum 8 characters"
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
          </View>

          {/* Confirm Password */}
          <View className="mt-4">
            <Text className="text-ink-soft text-xs font-bold mb-2 uppercase tracking-wider">
              Confirm Password
            </Text>
            <View className="relative">
              <TextInput
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

          {/* Signing out is the only way out of a forced setup. A student who
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
