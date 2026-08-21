import React from 'react';
import { Stack } from 'expo-router';

/**
 * Guardian stack. The first three screens are the sign-up flow, in order:
 * enter the child's code, fill in your details, see the outcome. They are
 * listed here so that order is readable in one place — expo-router resolves
 * the files either way, and every screen draws its own header.
 */
export default function ParentLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="register" />
      <Stack.Screen name="details" />
      <Stack.Screen name="confirm" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="change-pass" />
      <Stack.Screen name="class/[classId]" />
    </Stack>
  );
}
