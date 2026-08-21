import React from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useRequireAuth } from '../../src/hooks/useRequireAuth';
import { useThemeColors } from '../../src/theme';

export default function StudentLayout() {
  // Every screen under /student needs a session; signing out from any of them
  // returns to the landing screen instead of leaving the tabs mounted.
  useRequireAuth();
  // The bar takes colours as props, so it cannot follow the class-based
  // palette and stayed black the first time light mode was switched on.
  const c = useThemeColors();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.hairline,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: c.accentText,
        tabBarInactiveTintColor: c.inkMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>🏠</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="classes"
        options={{
          title: 'My Classes',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>📚</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="remediation"
        options={{
          title: 'Remediation',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>✨</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>👤</Text>
          ),
        }}
      />

      {/* Reached from inside a tab, never from the bar itself. Without
          href: null expo-router gives every route under this directory its own
          tab, which is why the bar was showing "quiz-pla...", "quiz-fee..." and
          "class/[c..." squeezed in beside the four real ones. */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="quiz-player" options={{ href: null }} />
      <Tabs.Screen name="quiz-feedback" options={{ href: null }} />
      <Tabs.Screen name="class/[classId]" options={{ href: null }} />
    </Tabs>
  );
}
