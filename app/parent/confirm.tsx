import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

/**
 * Sign-up outcome.
 *
 * No longer shows generated credentials: guardians choose their own email and
 * password, so there is nothing to write down. What matters now is whether the
 * link is live or waiting on the student — a minor's guardian is approved on
 * redeem, an adult student's guardian is not.
 */
export default function ParentConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const email = String(params.email ?? '');
  const linkStatus = String(params.linkStatus ?? 'pending');
  const approved = linkStatus === 'approved';

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-10 justify-between">
        <View className="items-center mt-12">
          <View
            className={`w-16 h-16 rounded-full items-center justify-center shadow-lg ${
              approved
                ? 'bg-emerald-600 shadow-emerald-500/20'
                : 'bg-amber-600 shadow-amber-500/20'
            }`}
          >
            <Text className="text-white text-3xl font-bold">{approved ? '✓' : '⏳'}</Text>
          </View>
          <Text className="text-white text-3xl font-extrabold mt-6 tracking-tight text-center font-sans">
            {approved ? 'You’re All Set' : 'Almost There'}
          </Text>
          <Text className="text-slate-400 text-sm mt-2 text-center font-sans">
            {approved
              ? 'Your account is ready and your child’s records are available.'
              : 'Your account is ready. Your child needs to approve the connection.'}
          </Text>
        </View>

        <View className="bg-slate-900 border border-slate-800 rounded-3xl p-6 my-8">
          <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider text-center mb-4">
            Sign in with
          </Text>
          <View className="bg-slate-950 p-4 rounded-xl border border-slate-850">
            <Text className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">
              Email
            </Text>
            <Text className="text-indigo-400 text-base font-extrabold mt-1 font-mono">
              {email || 'your email'}
            </Text>
          </View>
          <Text className="text-slate-500 text-[11px] mt-4 leading-relaxed text-center">
            Use the password you just chose. There is no temporary password to write down.
          </Text>
        </View>

        {!approved && (
          <View className="bg-amber-950/20 border border-amber-900/30 p-5 rounded-2xl mb-8">
            <Text className="text-amber-400 text-xs font-extrabold uppercase tracking-wider mb-2">
              Waiting for approval
            </Text>
            <Text className="text-slate-300 text-xs leading-relaxed">
              Under the Data Privacy Act (RA 10173), a student aged 18 or over decides who sees
              their records. Ask your child to open their student portal profile and approve your
              connection. You can check again from your dashboard at any time.
            </Text>
          </View>
        )}

        <View className="mb-6">
          <TouchableOpacity
            onPress={() => router.replace('/parent/dashboard')}
            activeOpacity={0.8}
            className="w-full bg-indigo-600 py-4 rounded-xl items-center justify-center shadow-lg shadow-indigo-600/25"
          >
            <Text className="text-white text-base font-bold font-sans">Go to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
