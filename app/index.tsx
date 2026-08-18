import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';

export default function StarterScreen() {
  const { status, profile } = useAuth();
  const router = useRouter();

  // Handle automatic role-based redirection if user is already signed in
  useEffect(() => {
    if (status === 'signed_in' && profile) {
      if ((profile as any).is_temp_password) {
        router.replace('/parent/change-pass');
      } else if (profile.role === 'student') {
        router.replace('/student/dashboard');
      } else if (profile.role === 'parent') {
        router.replace('/parent/dashboard');
      }
    }
  }, [status, profile, router]);

  if (status === 'loading') {
    return (
      <View className="flex-1 justify-center items-center bg-slate-900">
        <ActivityIndicator size="large" color="#6366f1" />
        <Text className="text-slate-400 mt-4 text-base font-sans">Checking session...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-10 justify-between">
        
        {/* Top Header - Logo and Brand */}
        <View className="items-center mt-12">
          <View className="w-16 h-16 bg-indigo-600 rounded-2xl items-center justify-center shadow-lg shadow-indigo-500/30">
            <Text className="text-white text-3xl font-bold font-sans">AK</Text>
          </View>
          <Text className="text-white text-4xl font-extrabold mt-4 tracking-tight font-sans text-center">
            Activ<Text className="text-indigo-500">Klass</Text>
          </Text>
          <Text className="text-slate-400 text-sm mt-2 font-medium tracking-widest uppercase">
            Mobile Portal
          </Text>
        </View>

        {/* Central Card - Value Proposition (Glassmorphism design) */}
        <View className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 my-8 backdrop-blur-md">
          <Text className="text-slate-200 text-lg font-bold text-center mb-3">
            Bridging Classrooms & Homes
          </Text>
          <Text className="text-slate-400 text-sm text-center leading-relaxed mb-5">
            ActivKlass helps students master concepts through adaptive AI learning while enabling parents to stay securely informed about academic progress.
          </Text>

          <View className="space-y-4">
            {/* Value Check Item 1 */}
            <View className="flex-row items-center bg-slate-950/40 p-3 rounded-xl border border-slate-800/40">
              <View className="w-8 h-8 rounded-full bg-indigo-500/10 items-center justify-center mr-3">
                <Text className="text-indigo-400 font-bold">✨</Text>
              </View>
              <View className="flex-1">
                <Text className="text-slate-300 font-semibold text-xs">AI-Driven Remediation</Text>
                <Text className="text-slate-400 text-[10px]">Personalized study guides mapped to weak topics</Text>
              </View>
            </View>

            {/* Value Check Item 2 */}
            <View className="flex-row items-center bg-slate-950/40 p-3 rounded-xl border border-slate-800/40 mt-3">
              <View className="w-8 h-8 rounded-full bg-emerald-500/10 items-center justify-center mr-3">
                <Text className="text-emerald-400 font-bold">✓</Text>
              </View>
              <View className="flex-1">
                <Text className="text-slate-300 font-semibold text-xs">Real-Time Grades & Attendance</Text>
                <Text className="text-slate-400 text-[10px]">Instant access to class marks and attendance grids</Text>
              </View>
            </View>

            {/* Value Check Item 3 */}
            <View className="flex-row items-center bg-slate-950/40 p-3 rounded-xl border border-slate-800/40 mt-3">
              <View className="w-8 h-8 rounded-full bg-indigo-500/10 items-center justify-center mr-3">
                <Text className="text-indigo-400 font-bold">🛡️</Text>
              </View>
              <View className="flex-1">
                <Text className="text-slate-300 font-semibold text-xs">RA 10173 Compliant</Text>
                <Text className="text-slate-400 text-[10px]">Privacy-first consent gates for adult students</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Bottom CTA Block */}
        <View className="space-y-4 mb-6">
          {/* Sign In Primary Button */}
          <TouchableOpacity
            onPress={() => router.push('/login')}
            activeOpacity={0.8}
            className="w-full bg-indigo-600 py-4 rounded-2xl items-center justify-center shadow-lg shadow-indigo-600/20"
          >
            <Text className="text-white text-base font-bold font-sans">
              Sign In to Portal
            </Text>
          </TouchableOpacity>

          {/* Parent Registration Secondary Button */}
          <TouchableOpacity
            onPress={() => router.push('/parent/register')}
            activeOpacity={0.8}
            className="w-full bg-slate-900 border border-indigo-900/40 py-4 rounded-2xl items-center justify-center mt-3"
          >
            <Text className="text-slate-200 text-sm font-semibold font-sans">
              I am a Parent - Connect Child
            </Text>
          </TouchableOpacity>
        </View>
        
      </ScrollView>
    </SafeAreaView>
  );
}
