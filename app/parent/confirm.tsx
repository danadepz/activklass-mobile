import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function ParentConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const { username, tempPassword } = params;

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-10 justify-between">
        
        {/* Header */}
        <View className="items-center mt-12">
          <View className="w-16 h-16 bg-emerald-600 rounded-full items-center justify-center shadow-lg shadow-emerald-500/20">
            <Text className="text-white text-3xl font-bold">✓</Text>
          </View>
          <Text className="text-white text-3xl font-extrabold mt-6 tracking-tight text-center font-sans">
            Account Created
          </Text>
          <Text className="text-slate-400 text-sm mt-2 text-center font-sans">
            Your connection credentials have been generated successfully.
          </Text>
        </View>

        {/* Credentials Card */}
        <View className="bg-slate-900 border border-slate-800 rounded-3xl p-6 my-8">
          <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider text-center mb-4">
            First Login Credentials
          </Text>
          
          {/* Username block */}
          <View className="bg-slate-950 p-4 rounded-xl border border-slate-850">
            <Text className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">
              Username
            </Text>
            <Text className="text-indigo-400 text-xl font-extrabold mt-1 tracking-wide font-mono select-all">
              {username || 'p-xxxxxxx'}
            </Text>
          </View>

          {/* Temporary Password block */}
          <View className="bg-slate-950 p-4 rounded-xl border border-slate-850 mt-4">
            <Text className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">
              Temporary Password
            </Text>
            <Text className="text-emerald-400 text-xl font-extrabold mt-1 tracking-wide font-mono select-all">
              {tempPassword || 'xxxxxxx'}
            </Text>
          </View>
        </View>

        {/* Warning Notification Card */}
        <View className="bg-amber-950/20 border border-amber-900/30 p-5 rounded-2xl mb-8">
          <Text className="text-amber-400 text-xs font-extrabold uppercase tracking-wider mb-2">
            ⚠️ Safety Notice
          </Text>
          <Text className="text-slate-300 text-xs leading-relaxed">
            Please copy or write down these credentials now. For security purposes, you will be forced to create a new, private password immediately upon your first login.
          </Text>
        </View>

        {/* Done Button */}
        <View className="mb-6">
          <TouchableOpacity
            onPress={() => router.replace('/login')}
            activeOpacity={0.8}
            className="w-full bg-indigo-600 py-4 rounded-xl items-center justify-center shadow-lg shadow-indigo-600/25"
          >
            <Text className="text-white text-base font-bold font-sans">
              Done &amp; Sign In
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
