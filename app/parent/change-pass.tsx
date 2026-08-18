import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { updatePassword, signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../src/config/firebase';
import { useAuth } from '../../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';

export default function ParentChangePassScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdatePassword = async () => {
    if (!newPassword.trim() || !confirmPassword.trim()) {
      setError('Please fill in both password fields.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
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

      // 2. Remove is_temp_password flag from Firestore user profile
      await updateDoc(doc(db, 'users', currentUser.uid), {
        is_temp_password: false,
      });

      // 3. Refresh context profile so that status updates
      await refreshProfile();

      // 4. Navigate to Parent Dashboard
      router.replace('/parent/dashboard');

    } catch (err: any) {
      console.error('[ParentChangePass] Error updating password:', err);
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
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-10 justify-between">
        
        {/* Header */}
        <View className="mb-6 mt-6">
          <Text className="text-white text-3xl font-extrabold font-sans">
            Set New Password
          </Text>
          <Text className="text-slate-400 text-sm mt-2 font-sans">
            Update your password to secure your account.
          </Text>
        </View>

        {/* Security Warning Notice */}
        <View className="bg-indigo-950/20 border border-indigo-900/30 p-4 rounded-xl mb-6">
          <Text className="text-slate-300 text-xs leading-relaxed">
            🔒 <Text className="font-semibold text-slate-200">First-Time Setup:</Text> You are currently logged in with a temporary password. You must configure a new, personal password to access your child's student records.
          </Text>
        </View>

        {/* Form Fields */}
        <View className="flex-1 justify-center space-y-4">
          
          {error && (
            <View className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl mb-4">
              <Text className="text-red-400 text-xs font-semibold">
                {error}
              </Text>
            </View>
          )}

          {/* New Password */}
          <View>
            <Text className="text-slate-300 text-xs font-bold mb-2 uppercase tracking-wider">
              New Password
            </Text>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Minimum 6 characters"
              placeholderTextColor="#64748b"
              secureTextEntry
              className="w-full bg-slate-900 border border-slate-850 p-4 rounded-xl text-white text-sm focus:border-indigo-500"
            />
          </View>

          {/* Confirm Password */}
          <View className="mt-4">
            <Text className="text-slate-300 text-xs font-bold mb-2 uppercase tracking-wider">
              Confirm Password
            </Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Re-enter new password"
              placeholderTextColor="#64748b"
              secureTextEntry
              className="w-full bg-slate-900 border border-slate-850 p-4 rounded-xl text-white text-sm focus:border-indigo-500"
            />
          </View>

        </View>

        {/* Submit */}
        <View className="mt-8">
          <TouchableOpacity
            onPress={handleUpdatePassword}
            disabled={loading}
            activeOpacity={0.8}
            className="w-full bg-indigo-600 py-4 rounded-xl items-center justify-center shadow-lg shadow-indigo-600/25"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text className="text-white text-base font-bold font-sans">
                Update Password &amp; Continue
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={async () => {
              await signOut(auth);
              router.replace('/login');
            }}
            disabled={loading}
            className="w-full items-center justify-center mt-4"
          >
            <Text className="text-slate-400 text-sm font-semibold">Sign Out</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
