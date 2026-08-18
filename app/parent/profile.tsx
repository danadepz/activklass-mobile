import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { useAuth } from '../../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';

/**
 * Guardian profile — the parent side of "Update Profile".
 *
 * Writes users/{uid} directly, the same way the web teacher account screen does
 * (activklass-web src/routes/teacher/account.jsx → ProfileCard). No API hop:
 * firestore.rules lets a signed-in user update their own document as long as
 * `role` is unchanged, and updateDoc leaves untouched fields alone.
 *
 * Email is deliberately read-only. It is the Firebase Auth sign-in identity, so
 * changing it here would only desynchronise the profile from the credential the
 * guardian actually logs in with — and the backend mirrors this document into
 * Postgres keyed on that identity (middleware/auth.py).
 */
export default function ParentProfileScreen() {
  const router = useRouter();
  const { profile, refreshProfile, logout } = useAuth();

  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');
  const [middleName, setMiddleName] = useState(profile?.middle_name ?? '');
  const [contactNumber, setContactNumber] = useState(profile?.contact_number ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const dirty =
    firstName !== (profile?.first_name ?? '') ||
    lastName !== (profile?.last_name ?? '') ||
    middleName !== (profile?.middle_name ?? '') ||
    contactNumber !== (profile?.contact_number ?? '');

  const handleSave = async () => {
    if (!profile) return;

    if (!firstName.trim() || !lastName.trim()) {
      setSuccess(null);
      setError('First and last name are required.');
      return;
    }
    if (!contactNumber.trim()) {
      setSuccess(null);
      setError('A contact number is required — the school uses it to reach you.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateDoc(doc(db, 'users', profile.id), {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        // Blank clears the field rather than storing an empty string, matching
        // what the sign-up screen writes.
        middle_name: middleName.trim() || null,
        contact_number: contactNumber.trim(),
        updated_at: serverTimestamp(),
      });

      // The signed-in profile is cached in AuthContext; without this the
      // dashboard header keeps showing the old name until a restart.
      await refreshProfile();
      setSuccess('Profile updated.');
    } catch (err: any) {
      console.error('[ParentProfile] Error updating profile:', err);
      setError(
        err?.code === 'permission-denied'
          ? 'You are not allowed to edit this profile. Please sign in again.'
          : err?.message || 'Could not save your profile. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-950">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />
      <ScrollView className="flex-1 px-6 py-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="self-start w-10 h-10 items-center justify-center bg-slate-900 border border-slate-800 rounded-xl mt-4 mb-4"
        >
          <Text className="text-white text-lg font-bold">←</Text>
        </TouchableOpacity>

        {/* Header */}
        <View className="mb-6">
          <Text className="text-white text-3xl font-extrabold font-sans">Profile &amp; Settings</Text>
          <Text className="text-slate-400 text-sm mt-2 font-sans">
            Your details as the school and your child&apos;s teachers see them.
          </Text>
        </View>

        {/* Identity card */}
        <View className="bg-slate-900 border border-slate-850 rounded-3xl p-6 mb-6">
          <View className="flex-row items-center">
            <View className="w-14 h-14 bg-indigo-600 rounded-full items-center justify-center">
              <Text className="text-white text-xl font-bold font-sans">
                {profile.first_name?.[0]}
                {profile.last_name?.[0]}
              </Text>
            </View>
            <View className="flex-1 pl-4">
              <Text className="text-white text-lg font-bold font-sans">
                {profile.first_name} {profile.last_name}
              </Text>
              <Text className="text-slate-400 text-xs mt-1">{profile.email}</Text>
              <Text className="text-indigo-400 text-[10px] font-bold uppercase tracking-wider mt-1">
                Guardian Account
              </Text>
            </View>
          </View>
        </View>

        {error && (
          <View className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl mb-4">
            <Text className="text-red-400 text-xs font-semibold leading-relaxed">{error}</Text>
          </View>
        )}

        {success && (
          <View className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl mb-4">
            <Text className="text-emerald-400 text-xs font-semibold">{success}</Text>
          </View>
        )}

        {/* Editable details */}
        <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">
          Your Details
        </Text>
        <View className="bg-slate-900 border border-slate-850 rounded-2xl p-5 mb-6">
          <Field label="First name *" value={firstName} onChangeText={setFirstName} />
          <Field label="Last name *" value={lastName} onChangeText={setLastName} />
          <Field label="Middle name" value={middleName} onChangeText={setMiddleName} />
          <Field
            label="Contact number *"
            value={contactNumber}
            onChangeText={setContactNumber}
            keyboardType="phone-pad"
          />

          {/* Read-only: this is the sign-in identity. */}
          <View className="mb-1">
            <Text className="text-slate-300 text-xs font-bold mb-2 uppercase tracking-wider">
              Email
            </Text>
            <View className="w-full bg-slate-950 border border-slate-850 p-4 rounded-xl">
              <Text className="text-slate-500 text-base">{profile.email}</Text>
            </View>
            <Text className="text-slate-600 text-[10px] mt-2 leading-relaxed">
              You sign in with this address, so it cannot be changed here. Ask your school
              administrator if it needs to be corrected.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || !dirty}
          activeOpacity={0.8}
          className={`w-full py-4 rounded-xl items-center justify-center ${
            saving || !dirty ? 'bg-indigo-600/40' : 'bg-indigo-600'
          }`}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text className="text-white text-base font-bold font-sans">
              {dirty ? 'Save Changes' : 'No Changes to Save'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Security */}
        <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-8 mb-3">
          Security
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/parent/change-pass')}
          className="w-full bg-slate-900 border border-slate-850 py-4 px-5 rounded-xl flex-row justify-between items-center"
        >
          <Text className="text-slate-200 text-sm font-semibold">Change Password</Text>
          <Text className="text-slate-500 text-base">›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={logout}
          className="w-full bg-slate-950 border border-red-500/20 py-4 rounded-xl items-center mt-4 mb-12"
        >
          <Text className="text-red-400 text-sm font-bold">Log Out of Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  ...inputProps
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View className="mb-4">
      <Text className="text-slate-300 text-xs font-bold mb-2 uppercase tracking-wider">{label}</Text>
      <TextInput
        placeholderTextColor="#64748b"
        className="w-full bg-slate-950 border border-slate-850 p-4 rounded-xl text-white text-base"
        {...inputProps}
      />
    </View>
  );
}
