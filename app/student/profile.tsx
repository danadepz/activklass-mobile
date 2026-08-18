import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView, Alert } from 'react-native';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../src/config/firebase';
import { useAuth } from '../../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';

export default function StudentProfileScreen() {
  const { profile, refreshProfile, logout } = useAuth();
  
  const [consent, setConsent] = useState<any>(null);
  const [loadingConsent, setLoadingConsent] = useState(true);
  const [updating, setUpdating] = useState(false);

  const birthdate = profile?.birthdate || '';
  const age = profile?.age || 0;
  const isAdult = age >= 18;

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    // Listen to changes in the consent record for this student
    const unsubscribe = onSnapshot(doc(db, 'consent_records', user.uid), async (docSnap) => {
      if (docSnap.exists()) {
        setConsent(docSnap.data());
        setLoadingConsent(false);
      } else {
        // Automatically provision a consent record if it doesn't exist yet
        try {
          const generatedCode = 'AK' + Math.floor(100000 + Math.random() * 900000);
          const initialRecord = {
            student_id: user.uid,
            invitation_code: generatedCode,
            is_minor: !isAdult,
            status: isAdult ? 'pending' : 'approved',
            student_birthdate: birthdate,
            created_at: serverTimestamp(),
          };
          await setDoc(doc(db, 'consent_records', user.uid), initialRecord);
          setConsent(initialRecord);
        } catch (e) {
          console.error('Error creating initial consent record:', e);
        } finally {
          setLoadingConsent(false);
        }
      }
    }, (err) => {
      console.error('Error reading consent:', err);
      setLoadingConsent(false);
    });

    return () => unsubscribe();
  }, [isAdult, birthdate]);

  const handleConsentToggle = async (newStatus: 'approved' | 'declined') => {
    const user = auth.currentUser;
    if (!user) return;

    setUpdating(true);
    try {
      await updateDoc(doc(db, 'consent_records', user.uid), {
        status: newStatus,
        signed_at: serverTimestamp()
      });
      Alert.alert('Privacy Updated', `Guardian access has been successfully set to ${newStatus}.`);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to update consent status.');
    } finally {
      setUpdating(false);
    }
  };

  const handleGenerateNewCode = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setUpdating(true);
    try {
      const generatedCode = 'AK' + Math.floor(100000 + Math.random() * 900000);
      await updateDoc(doc(db, 'consent_records', user.uid), {
        invitation_code: generatedCode
      });
      Alert.alert('New Code Generated', 'A new invitation code has been successfully configured.');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to regenerate code.');
    } finally {
      setUpdating(false);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    if (status === 'approved') return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
    if (status === 'pending') return 'bg-amber-500/10 border-amber-500/30 text-amber-400';
    return 'bg-red-500/10 border-red-500/30 text-red-400';
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />
      <ScrollView className="flex-1 px-6 py-4">
        
        {/* Header */}
        <View className="mt-6 mb-6">
          <Text className="text-white text-3xl font-extrabold font-sans">
            Profile &amp; Settings
          </Text>
          <Text className="text-slate-400 text-sm mt-2 font-sans">
            Manage your personal data credentials and parent consent policies.
          </Text>
        </View>

        {/* Profile Card */}
        <View className="bg-slate-900 border border-slate-850 rounded-3xl p-6 mb-6">
          <View className="flex-row items-center space-x-4">
            <View className="w-14 h-14 bg-indigo-600 rounded-full items-center justify-center">
              <Text className="text-white text-xl font-bold font-sans">
                {profile?.first_name?.[0]}{profile?.last_name?.[0]}
              </Text>
            </View>
            <View className="flex-1 pl-3">
              <Text className="text-white text-lg font-bold font-sans">
                {profile?.first_name} {profile?.last_name}
              </Text>
              <Text className="text-slate-400 text-xs mt-1">{profile?.email}</Text>
            </View>
          </View>
        </View>

        {/* Details Grid */}
        <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Academic Registry</Text>
        <View className="bg-slate-900 border border-slate-850 rounded-2xl p-5 space-y-4 mb-6">
          
          <View className="flex-row justify-between border-b border-slate-800 pb-3">
            <Text className="text-slate-500 text-xs">Student Number</Text>
            <Text className="text-white text-xs font-semibold">{profile?.student_number || '—'}</Text>
          </View>

          <View className="flex-row justify-between border-b border-slate-800 pb-3">
            <Text className="text-slate-500 text-xs">DepEd LRN</Text>
            <Text className="text-white text-xs font-semibold">{profile?.lrn || '—'}</Text>
          </View>

          <View className="flex-row justify-between border-b border-slate-800 pb-3">
            <Text className="text-slate-500 text-xs">Course / Strand</Text>
            <Text className="text-white text-xs font-semibold">{profile?.course || '—'}</Text>
          </View>

          <View className="flex-row justify-between border-b border-slate-800 pb-3">
            <Text className="text-slate-500 text-xs">Grade Level</Text>
            <Text className="text-white text-xs font-semibold">{profile?.year_level || profile?.grade_level || '—'}</Text>
          </View>

          <View className="flex-row justify-between border-b border-slate-800 pb-3">
            <Text className="text-slate-500 text-xs">Birthdate</Text>
            <Text className="text-white text-xs font-semibold">{profile?.birthdate || '—'}</Text>
          </View>

          <View className="flex-row justify-between">
            <Text className="text-slate-500 text-xs">Age</Text>
            <Text className="text-white text-xs font-semibold">
              {age} {isAdult ? '(Legal Age)' : '(Minor)'}
            </Text>
          </View>

        </View>

        {/* Consent Section (RA 10173 compliance) */}
        <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Parental Consent Lock</Text>
        <View className="bg-slate-900 border border-slate-850 rounded-2xl p-5 mb-10">
          <View className="flex-row justify-between items-center mb-4">
            <View>
              <Text className="text-white text-xs font-bold font-sans">RA 10173 Compliance Policy</Text>
              <Text className="text-slate-500 text-[10px] mt-0.5">Privacy Lock status on academic marks</Text>
            </View>
            {loadingConsent ? (
              <ActivityIndicator size="small" color="#6366f1" />
            ) : consent ? (
              <View className={`px-3 py-1 rounded-full border ${getStatusBadgeColor(consent.status)}`}>
                <Text className="text-[10px] font-bold uppercase">{consent.status}</Text>
              </View>
            ) : null}
          </View>

          {/* If the student is a minor, parental consent is hardcoded to approved (legal requirement) */}
          {!isAdult ? (
            <Text className="text-slate-400 text-xs leading-normal bg-slate-950 p-4 rounded-xl border border-slate-850">
              ℹ️ Under the Philippine Data Privacy Act, because you are classified as a minor (under 18), your parent or guardian retains natural legal access rights to monitor your academic class records. This cannot be revoked.
            </Text>
          ) : (
            <View className="space-y-4">
              <Text className="text-slate-400 text-xs leading-normal bg-slate-950 p-4 rounded-xl border border-slate-850">
                🔒 You have reached the legal age (18+). You have the right to approve or revoke your parent or guardian's access to view your grade sheets, attendance charts, and learning remediation analytics.
              </Text>
              
              {/* Linked Guardian card details */}
              {consent?.parent_id ? (
                <View className="bg-slate-950 border border-slate-850 p-4 rounded-xl">
                  <Text className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Linked Guardian</Text>
                  <Text className="text-white text-sm font-semibold mt-1">
                    {consent.parent_first_name} {consent.parent_last_name}
                  </Text>
                  
                  {/* Action buttons */}
                  <View className="flex-row gap-3 mt-4">
                    <TouchableOpacity
                      onPress={() => handleConsentToggle('approved')}
                      disabled={updating || consent.status === 'approved'}
                      className={`flex-1 py-3 rounded-xl items-center ${
                        consent.status === 'approved' ? 'bg-emerald-700/20' : 'bg-emerald-600'
                      }`}
                    >
                      <Text className="text-white text-xs font-bold">Approve Access</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleConsentToggle('declined')}
                      disabled={updating || consent.status === 'declined'}
                      className={`flex-1 py-3 rounded-xl items-center border ${
                        consent.status === 'declined' ? 'border-red-900/40 bg-red-950/10' : 'bg-slate-900 border-red-500/30'
                      }`}
                    >
                      <Text className="text-red-400 text-xs font-bold">Revoke Access</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View className="bg-slate-950 border border-slate-850 p-4 rounded-xl items-center">
                  <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">Connection Code</Text>
                  <Text className="text-indigo-400 text-2xl font-black font-mono tracking-widest mt-2">
                    {consent?.invitation_code || '—'}
                  </Text>
                  <Text className="text-slate-500 text-[10px] text-center mt-2 leading-relaxed px-4">
                    Give this alphanumeric code to your guardian. They must enter it on their registration screen to connect accounts.
                  </Text>
                  <TouchableOpacity
                    onPress={handleGenerateNewCode}
                    disabled={updating}
                    className="mt-4 px-4 py-2 border border-slate-850 bg-slate-900 rounded-xl"
                  >
                    <Text className="text-slate-400 text-xs font-semibold">Regenerate Code</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Logout Button */}
          <TouchableOpacity
            onPress={logout}
            className="w-full bg-slate-950 border border-red-500/20 py-4 rounded-xl items-center mt-6"
          >
            <Text className="text-red-400 text-sm font-bold">Log Out of Account</Text>
          </TouchableOpacity>

        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
