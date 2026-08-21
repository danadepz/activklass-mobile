import React from 'react'
import { render } from '@testing-library/react-native'
import { ThemeProvider } from '../context/ThemeContext'

/**
 * Render a screen inside the providers the real app gives it.
 *
 * app/_layout.tsx wraps everything in AppThemeProvider > SafeAreaProvider >
 * AuthProvider. A screen rendered bare throws "useTheme must be used within a
 * ThemeProvider" -- which is a fact about the test, not about the screen, and
 * mocking useTheme away to silence it would throw out the thing worth
 * checking: that a screen mounts in the tree it will actually live in.
 *
 * SafeAreaProvider and AuthProvider are already stubbed in jest.setup.js --
 * one because it is a native module, the other because signing in is not what
 * these tests are about. ThemeProvider is real: it is plain React state over a
 * mocked AsyncStorage, so it costs nothing and its absence is exactly the kind
 * of provider-tree mistake these tests should catch rather than paper over.
 */
export function renderScreen(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}
