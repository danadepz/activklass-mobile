import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';

/** Sampled from assets/images/logo.png so the wordmark matches the mark
 *  exactly, rather than approximating it with the nearest Tailwind amber. */
const BRAND_GOLD = '#FDC20E';

export default function StarterScreen() {
  const { status, profile } = useAuth();
  const router = useRouter();

  // Handle automatic role-based redirection if user is already signed in
  useEffect(() => {
    if (status === 'signed_in' && profile) {
      if ((profile as any).is_temp_password) {
        if (profile.role === 'student') {
          router.replace('/student/change-pass');
        } else {
          router.replace('/parent/change-pass');
        }
      } else if (profile.role === 'student') {
        router.replace('/student/dashboard');
      } else if (profile.role === 'parent') {
        router.replace('/parent/dashboard');
      }
    }
  }, [status, profile, router]);

  if (status === 'loading') {
    return (
      <View className="flex-1 justify-center items-center bg-surface">
        <ActivityIndicator size="large" color="#6366f1" />
        <Text className="text-ink-muted mt-4 text-base font-sans">Checking session...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <StatusBar style="auto" />
      {/* Padding and justify-between belong to the CONTENT container, not the
          ScrollView. React Native throws a render error for child layout props
          set on the scroll view itself, and NativeWind was compiling the
          className straight onto it. flex-grow replaces the old
          contentContainerStyle={{ flexGrow: 1 }}, which did the same job. */}
      <ScrollView contentContainerClassName="flex-grow px-6 py-10 justify-between">
        
        {/* Top Header - Logo and Brand */}
        <View className="items-center mt-12">
          {/* The mark is transparent PNG with ~20% of its own padding, so it
              needs no tile behind it and sits straight on the dark ground.
              contain, not cover: the source is square and cover would crop the
              tassel, which is the half that reads as a graduation cap. */}
          <Image
            source={require('../assets/images/logo.png')}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="ActivKlass"
            className="w-28 h-28"
          />
          <Text className="text-ink text-4xl font-extrabold mt-4 tracking-tight font-sans text-center">
            Activ<Text style={{ color: BRAND_GOLD }}>Klass</Text>
          </Text>
          <Text className="text-ink-muted text-sm mt-2 font-medium tracking-widest uppercase">
            Mobile Portal
          </Text>
        </View>

        {/* Central Card - Value Proposition (Glassmorphism design) */}
        <View className="bg-surface/60 border border-hairline rounded-3xl p-6 my-8 backdrop-blur-md">
          <Text className="text-ink-soft text-lg font-bold text-center mb-3">
            Bridging Classrooms & Homes
          </Text>
          <Text className="text-ink-muted text-sm text-center leading-relaxed mb-5">
            ActivKlass helps students master concepts through adaptive AI learning while enabling parents to stay securely informed about academic progress.
          </Text>

          <View className="space-y-4">
            {/* Value Check Item 1 */}
            <View className="flex-row items-center bg-sunken/40 p-3 rounded-xl border border-hairline/40">
              <View className="w-8 h-8 rounded-full bg-accent/10 items-center justify-center mr-3">
                <Text className="text-accent-text font-bold">✨</Text>
              </View>
              <View className="flex-1">
                <Text className="text-ink-soft font-semibold text-xs">AI-Driven Remediation</Text>
                <Text className="text-ink-muted text-[10px]">Personalized study guides mapped to weak topics</Text>
              </View>
            </View>

            {/* Value Check Item 2 */}
            <View className="flex-row items-center bg-sunken/40 p-3 rounded-xl border border-hairline/40 mt-3">
              <View className="w-8 h-8 rounded-full bg-emerald-500/10 items-center justify-center mr-3">
                <Text className="text-success font-bold">✓</Text>
              </View>
              <View className="flex-1">
                <Text className="text-ink-soft font-semibold text-xs">Real-Time Grades & Attendance</Text>
                <Text className="text-ink-muted text-[10px]">Instant access to class marks and attendance grids</Text>
              </View>
            </View>

            {/* Value Check Item 3 */}
            <View className="flex-row items-center bg-sunken/40 p-3 rounded-xl border border-hairline/40 mt-3">
              <View className="w-8 h-8 rounded-full bg-accent/10 items-center justify-center mr-3">
                <Text className="text-accent-text font-bold">🛡️</Text>
              </View>
              <View className="flex-1">
                <Text className="text-ink-soft font-semibold text-xs">RA 10173 Compliant</Text>
                <Text className="text-ink-muted text-[10px]">Privacy-first consent gates for adult students</Text>
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
            className="w-full bg-accent py-4 rounded-2xl items-center justify-center shadow-lg shadow-indigo-600/20"
          >
            <Text className="text-on-accent text-base font-bold font-sans">
              Sign In to Portal
            </Text>
          </TouchableOpacity>

          {/* Parent Registration Secondary Button */}
          <TouchableOpacity
            onPress={() => router.push('/parent/register')}
            activeOpacity={0.8}
            className="w-full bg-surface border border-accent/40 py-4 rounded-2xl items-center justify-center mt-3"
          >
            <Text className="text-ink-soft text-sm font-semibold font-sans">
              I am a Parent - Connect Child
            </Text>
          </TouchableOpacity>
        </View>
        
      </ScrollView>
    </SafeAreaView>
  );
}
