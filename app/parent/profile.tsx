import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { useAuth } from '../../src/context/AuthContext';
import { useConfirmLogout } from '../../src/hooks/useConfirmLogout';
import { StatusBar } from 'expo-status-bar';
import { useRequireAuth } from '../../src/hooks/useRequireAuth';
import ThemeToggle from '../../src/components/ThemeToggle';
import { nameError, phoneError, normalizePhone } from '../../src/lib/validation';
import { useThemeColors } from '../../src/theme';

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
  useRequireAuth();
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const confirmLogout = useConfirmLogout();

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

    const fnErr = nameError(firstName, { label: 'First name' });
    if (fnErr) {
      setSuccess(null);
      setError(fnErr);
      return;
    }
    const lnErr = nameError(lastName, { label: 'Last name' });
    if (lnErr) {
      setSuccess(null);
      setError(lnErr);
      return;
    }
    if (middleName.trim()) {
      const mnErr = nameError(middleName, { label: 'Middle name', required: false });
      if (mnErr) {
        setSuccess(null);
        setError(mnErr);
        return;
      }
    }
    const phErr = phoneError(contactNumber);
    if (phErr) {
      setSuccess(null);
      setError(phErr);
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
        contact_number: normalizePhone(contactNumber),
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
      <View className="flex-1 justify-center items-center bg-sunken">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <StatusBar style="auto" />
      <ScrollView className="flex-1 px-6 py-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="self-start w-10 h-10 items-center justify-center bg-surface border border-hairline rounded-xl mt-4 mb-4"
        >
          <Text className="text-ink text-lg font-bold">←</Text>
        </TouchableOpacity>

        {/* Header */}
        <View className="mb-6">
          <Text className="text-ink text-3xl font-extrabold font-sans">Profile &amp; Settings</Text>
          <Text className="text-ink-muted text-sm mt-2 font-sans">
            Your details as the school and your child&apos;s teachers see them.
          </Text>
        </View>

        {/* Identity card */}
        <View className="bg-surface border border-hairline rounded-3xl p-6 mb-6">
          <View className="flex-row items-center">
            <View className="w-14 h-14 bg-accent rounded-full items-center justify-center">
              <Text className="text-on-accent text-xl font-bold font-sans">
                {profile.first_name?.[0]}
                {profile.last_name?.[0]}
              </Text>
            </View>
            <View className="flex-1 pl-4">
              <Text className="text-ink text-lg font-bold font-sans">
                {profile.first_name} {profile.last_name}
              </Text>
              <Text className="text-ink-muted text-xs mt-1">{profile.email}</Text>
              <Text className="text-accent-text text-[10px] font-bold uppercase tracking-wider mt-1">
                Guardian Account
              </Text>
            </View>
          </View>
        </View>

        {error && (
          <View className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl mb-4">
            <Text className="text-danger text-xs font-semibold leading-relaxed">{error}</Text>
          </View>
        )}

        {success && (
          <View className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl mb-4">
            <Text className="text-success text-xs font-semibold">{success}</Text>
          </View>
        )}

        {/* Editable details */}
        <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider mb-3">
          Your Details
        </Text>
        <View className="bg-surface border border-hairline rounded-2xl p-5 mb-6">
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
            <Text className="text-ink-soft text-xs font-bold mb-2 uppercase tracking-wider">
              Email
            </Text>
            <View className="w-full bg-sunken border border-hairline p-4 rounded-xl">
              <Text className="text-ink-faint text-base">{profile.email}</Text>
            </View>
            <Text className="text-ink-faint text-[10px] mt-2 leading-relaxed">
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
            saving || !dirty ? 'bg-accent/40' : 'bg-accent'
          }`}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text className="text-ink text-base font-bold font-sans">
              {dirty ? 'Save Changes' : 'No Changes to Save'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Security */}
        <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider mt-8 mb-3">
          Security
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/parent/change-pass')}
          className="w-full bg-surface border border-hairline py-4 px-5 rounded-xl flex-row justify-between items-center"
        >
          <Text className="text-ink-soft text-sm font-semibold">Change Password</Text>
          <Text className="text-ink-faint text-base">›</Text>
        </TouchableOpacity>

        <View className="mb-8">

          <ThemeToggle />

        </View>

        <TouchableOpacity
          onPress={confirmLogout}
          className="w-full bg-sunken border border-red-500/20 py-4 rounded-xl items-center mt-4 mb-12"
        >
          <Text className="text-danger text-sm font-bold">Log Out of Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  ...inputProps
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  // Its own call: this Field lives outside the screen component, so the
  // palette is not in scope from there.
  const c = useThemeColors();
  return (
    <View className="mb-4">
      <Text className="text-ink-soft text-xs font-bold mb-2 uppercase tracking-wider">{label}</Text>
      <TextInput
        placeholderTextColor={c.inkFaint}
        className="w-full bg-sunken border border-hairline p-4 rounded-xl text-ink text-base"
        {...inputProps}
      />
    </View>
  );
}
