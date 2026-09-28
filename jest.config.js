/**
 * Screen tests. The second of two runners, and they must not fight.
 *
 *   vitest  src/lib/**.test.ts       pure logic, no React, milliseconds
 *   jest    **.screen.test.tsx       renders a real screen through jest-expo
 *
 * Two runners because they answer different questions. vitest tells us the
 * exam clock computes the right number; it cannot tell us the screen showing
 * that number mounts without throwing. A white screen on a student's phone is
 * invisible to `tsc` and to every test we had before this file.
 *
 * The split is by FILENAME, not directory, so neither runner has to guess:
 * jest takes `.screen.test.tsx` and nothing else, and vitest.config.ts
 * excludes that suffix explicitly. A test picked up by both runners fails in
 * confusing ways -- vitest has no jest-expo transform, jest has no vitest
 * globals -- so the boundary is worth being blunt about.
 */
module.exports = {
  preset: 'jest-expo',
  maxWorkers: 1,
  testMatch: ['**/*.screen.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // The Expo/RN dependency tree ships untranspiled ESM; jest-expo's preset
  // handles its own packages but not everything reachable from them.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@firebase/.*|firebase/.*|nativewind|react-native-css-interop)',
  ],
}
