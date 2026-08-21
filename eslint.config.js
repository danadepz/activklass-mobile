/**
 * ESLint for the mobile app. https://docs.expo.dev/guides/using-eslint/
 *
 * This repo had no lint config at all, which left `tsc --noEmit` as the only
 * automated check over the whole app -- and typechecking proves the shapes
 * line up, not that the code is right. The web repo has eslint plus 408 tests
 * and the backend has 18 suites; this closes the most obvious half of that gap.
 *
 * Expo's own ruleset rather than a copy of the web config: it understands
 * React Native globals, the expo-router file conventions and TSX, none of
 * which the browser-targeted config in activklass-web knows about. It is also
 * the pairing `npx expo lint` sets up, so this stays in step with the SDK.
 */
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Build output and the native projects: generated or vendored, not ours.
    ignores: ['dist/*', '.expo/*', 'android/*', 'ios/*', 'expo-env.d.ts'],
  },
  {
    /* Test globals, declared here rather than with `/* eslint-env jest *​/`.
       Flat config stopped honouring that comment and warns that it becomes an
       error in ESLint 10 -- and while it was being ignored, jest.setup.js was
       reporting 30 no-undef errors for `jest`, `require` and friends. The
       warning is printed above the errors it causes, so a `tail` on the output
       hides exactly the thing that explains it. */
    files: ['**/*.screen.test.tsx', 'jest.setup.js', 'src/test/**'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        require: 'readonly',
        module: 'writable',
        console: 'readonly',
        globalThis: 'writable',
      },
    },
  },
]);
