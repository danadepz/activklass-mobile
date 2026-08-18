import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';
import ParentalAccessPanel from '../../src/components/ParentalAccessPanel';

/* Parental access moved into ParentalAccessPanel, which reads the Flask API.
   This screen used to generate its own connection code ('AK' + random digits)
   and write consent_records/{uid} with an is_minor flag derived from a
   client-side age field -- a student could edit their age to control their own
   consent gate. Both decisions now belong to the backend. */
export default function StudentProfileScreen() {
  const { profile, logout } = useAuth();

  const age = profile?.age ?? null;
  const isAdult = age != null ? age >= 18 : null;

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
              {age != null ? `${age} ${isAdult ? '(Legal Age)' : '(Minor)'}` : '—'}
            </Text>
          </View>

        </View>

        {/* Parental Access (RA 10173) */}
        <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Parental Access</Text>
        <View className="mb-10">
          <ParentalAccessPanel />

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
