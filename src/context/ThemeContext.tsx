import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme, useColorScheme } from 'nativewind';

/**
 * Light / dark / follow-the-system, remembered across launches.
 *
 * NativeWind owns the actual switch — `colorScheme.set` toggles the `dark`
 * class that global.css keys its second palette off. This adds the two things
 * it does not: a stored preference, and a three-way choice, since "follow the
 * phone" is a real answer and not the same as picking light.
 *
 * The preference is read before the first paint is allowed through (see
 * `ready`), because applying it afterwards shows a flash of the wrong theme on
 * every cold start.
 */

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'activklass.theme';

interface ThemeContextType {
  /** What the user chose. 'system' is a choice, not the absence of one. */
  preference: ThemePreference;
  /** What that resolves to right now — never 'system'. */
  resolved: 'light' | 'dark';
  setPreference: (next: ThemePreference) => void;
  /** Light ⇄ dark in one tap. From 'system' it flips away from whatever the
   *  phone is currently showing, which is what a single button should do. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  const [ready, setReady] = useState(false);
  const { colorScheme: active } = useColorScheme();

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        // Dark is the default rather than 'system': every screen was designed
        // dark, so it is the known-good look for anyone who has not chosen.
        const initial: ThemePreference =
          stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
        setPreferenceState(initial);
        colorScheme.set(initial);
      } catch {
        colorScheme.set('dark');
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    colorScheme.set(next);
    // Persist last: the switch should feel instant, and a storage failure is
    // not a reason to leave the user looking at the theme they just rejected.
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const resolved: 'light' | 'dark' = active === 'light' ? 'light' : 'dark';

  const toggle = useCallback(() => {
    setPreference(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setPreference]);

  // Nothing renders until the stored preference has been applied, so a user
  // who chose light never sees a dark frame first.
  if (!ready) return null;

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};
