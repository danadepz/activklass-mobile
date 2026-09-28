import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { useAuth } from '../../src/context/AuthContext';
import { useConfirmLogout } from '../../src/hooks/useConfirmLogout';
import { StatusBar } from 'expo-status-bar';
import ParentalAccessPanel from '../../src/components/ParentalAccessPanel';
import ThemeToggle from '../../src/components/ThemeToggle';
import { AvatarError, pickAvatarFromGallery } from '../../src/lib/avatar';

/* Parental access lives in ParentalAccessPanel, which reads and writes
   Firestore (guardian_codes and guardian_links).
   This screen used to generate its own connection code ('AK' + random digits)
   and write consent_records/{uid} with an is_minor flag derived from a
   client-side age field -- and nothing checked either, so a student could edit
   their age to control their own consent gate. What enforces both now is
   firestore.rules, not any screen. */
export default function StudentProfileScreen() {
  const router = useRouter();
  /* The photo is the ONE field a student may write on their own profile
     (firestore.rules restricts them to photo_url); everything else is
     registrar data. It comes from the device gallery and is stored inline,
     because this project has no Storage bucket — see src/lib/avatar.ts. */
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const changePhoto = async () => {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const dataUri = await pickAvatarFromGallery();
      if (!dataUri) return; // dismissed the picker
      await updateDoc(doc(db, 'users', profile!.id), { photo_url: dataUri });
      await refreshProfile();
    } catch (err) {
      setPhotoError(
        err instanceof AvatarError ? err.message : 'Could not save that photo. Please try again.'
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      await updateDoc(doc(db, 'users', profile!.id), { photo_url: null });
      await refreshProfile();
    } catch {
      setPhotoError('Could not remove the photo.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const { profile, refreshProfile } = useAuth();
  const confirmLogout = useConfirmLogout();

  const age = profile?.age ?? null;
  const isAdult = age != null ? age >= 18 : null;

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <StatusBar style="auto" />
      <ScrollView className="flex-1 px-6 py-4">
        
        {/* Header */}
        <View className="mt-6 mb-6">
          <Text className="text-ink text-3xl font-extrabold font-sans">
            Profile &amp; Settings
          </Text>
          <Text className="text-ink-muted text-sm mt-2 font-sans">
            Manage your personal data credentials and parent consent policies.
          </Text>
        </View>

        {/* Profile Card */}
        <View className="bg-surface border border-hairline rounded-3xl p-6 mb-6">
          <View className="flex-row items-center space-x-4">
            <TouchableOpacity
              onPress={changePhoto}
              disabled={photoBusy}
              accessibilityRole="button"
              accessibilityLabel={profile?.photo_url ? 'Change your photo' : 'Add a photo'}
              className="w-14 h-14 rounded-full items-center justify-center relative"
            >
              {profile?.photo_url ? (
                <Image
                  source={{ uri: profile.photo_url }}
                  className="w-14 h-14 rounded-full"
                  resizeMode="cover"
                />
              ) : (
                <View className="w-14 h-14 bg-accent rounded-full items-center justify-center">
                  <Text className="text-on-accent text-xl font-bold font-sans">
                    {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                  </Text>
                </View>
              )}
              {/* The badge says the avatar is a control; a bare initials circle
                  reads as decoration and nobody taps it. */}
              <View className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-surface border border-hairline items-center justify-center">
                {photoBusy ? (
                  <ActivityIndicator size="small" color="#6366f1" />
                ) : (
                  <Text className="text-[10px]">📷</Text>
                )}
              </View>
            </TouchableOpacity>
            <View className="flex-1 pl-3">
              <Text className="text-ink text-lg font-bold font-sans">
                {profile?.first_name} {profile?.last_name}
              </Text>
              <Text className="text-ink-muted text-xs mt-1">{profile?.email}</Text>
              {profile?.photo_url ? (
                <TouchableOpacity onPress={removePhoto} disabled={photoBusy} className="mt-1.5">
                  <Text className="text-ink-faint text-[11px] underline">Remove photo</Text>
                </TouchableOpacity>
              ) : (
                <Text className="text-ink-faint text-[11px] mt-1.5">
                  Tap the circle to add a photo
                </Text>
              )}
            </View>
          </View>

          {photoError && (
            <Text className="text-danger text-xs leading-relaxed mt-4">{photoError}</Text>
          )}
        </View>

        {/* Details Grid */}
        <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider mb-3">Academic Registry</Text>
        <View className="bg-surface border border-hairline rounded-2xl p-5 space-y-4 mb-6">
          
          <View className="flex-row justify-between border-b border-hairline pb-3">
            <Text className="text-ink-faint text-xs">Student Number</Text>
            <Text className="text-ink text-xs font-semibold">{profile?.student_number || '—'}</Text>
          </View>

          <View className="flex-row justify-between border-b border-hairline pb-3">
            <Text className="text-ink-faint text-xs">DepEd LRN</Text>
            <Text className="text-ink text-xs font-semibold">{profile?.lrn || '—'}</Text>
          </View>

          <View className="flex-row justify-between border-b border-hairline pb-3">
            <Text className="text-ink-faint text-xs">Course / Strand</Text>
            <Text className="text-ink text-xs font-semibold">{profile?.course || '—'}</Text>
          </View>

          <View className="flex-row justify-between border-b border-hairline pb-3">
            <Text className="text-ink-faint text-xs">Grade Level</Text>
            <Text className="text-ink text-xs font-semibold">{profile?.year_level || profile?.grade_level || '—'}</Text>
          </View>

          <View className="flex-row justify-between border-b border-hairline pb-3">
            <Text className="text-ink-faint text-xs">Birthdate</Text>
            <Text className="text-ink text-xs font-semibold">{profile?.birthdate || '—'}</Text>
          </View>

          <View className="flex-row justify-between">
            <Text className="text-ink-faint text-xs">Age</Text>
            <Text className="text-ink text-xs font-semibold">
              {age != null ? `${age} ${isAdult ? '(Legal Age)' : '(Minor)'}` : '—'}
            </Text>
          </View>

        </View>

        {/* Parental Access (RA 10173) */}
        <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider mb-3">Parental Access</Text>
        <View className="mb-10">
          <ParentalAccessPanel />

        {/* Security */}
        <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider mt-8 mb-3">
          Security
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/student/change-pass')}
          className="w-full bg-surface border border-hairline py-4 px-5 rounded-xl flex-row justify-between items-center"
        >
          <Text className="text-ink-soft text-sm font-semibold">Change Password</Text>
          <Text className="text-ink-faint text-base">›</Text>
        </TouchableOpacity>

        {/* Appearance sits with the other account settings rather than in a
            header: it is a preference you set once, not a control you reach
            for on every screen. */}
        <View className="mt-8">
          <ThemeToggle />
        </View>

          {/* Logout Button */}
          <TouchableOpacity
            onPress={confirmLogout}
            className="w-full bg-sunken border border-red-500/20 py-4 rounded-xl items-center mt-6"
          >
            <Text className="text-danger text-sm font-bold">Log Out of Account</Text>
          </TouchableOpacity>

        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
