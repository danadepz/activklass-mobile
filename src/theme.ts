import { useTheme } from './context/ThemeContext';

/**
 * The same palette as global.css, as plain hex.
 *
 * Tailwind classes cover most of the app, but a few things take a colour as a
 * JS prop and cannot: the tab bar's `screenOptions`, `ActivityIndicator`'s
 * `color`, `Switch`'s `trackColor`, `TextInput`'s `placeholderTextColor` and
 * every `stroke` on an Svg. Those were hardcoded slate hexes, which is why the
 * tab bar stayed black the first time light mode was switched on.
 *
 * Keep in step with global.css. Duplicated rather than derived because the CSS
 * variables live in the style system and are not readable from JS.
 */

export interface ThemeColors {
  canvas: string;
  surface: string;
  sunken: string;
  hairline: string;
  ink: string;
  inkSoft: string;
  inkMuted: string;
  inkFaint: string;
  accent: string;
  accentText: string;
  onAccent: string;
  success: string;
  warning: string;
  danger: string;
  /** Unfilled part of a progress ring or switch track. */
  track: string;
}

export const LIGHT: ThemeColors = {
  canvas: '#F8FAFC',
  surface: '#FFFFFF',
  sunken: '#F1F5F9',
  hairline: '#E2E8F0',
  ink: '#0F172A',
  inkSoft: '#334155',
  inkMuted: '#64748B',
  inkFaint: '#94A3B8',
  accent: '#4F46E5',
  accentText: '#4338CA',
  onAccent: '#FFFFFF',
  success: '#059669',
  warning: '#B45309',
  danger: '#DC2626',
  track: '#CBD5E1',
};

export const DARK: ThemeColors = {
  canvas: '#020617',
  surface: '#0F172A',
  sunken: '#020617',
  hairline: '#1E293B',
  ink: '#FFFFFF',
  inkSoft: '#CBD5E1',
  inkMuted: '#94A3B8',
  inkFaint: '#64748B',
  accent: '#4F46E5',
  accentText: '#818CF8',
  onAccent: '#FFFFFF',
  success: '#34D399',
  warning: '#FBBF24',
  danger: '#F87171',
  track: '#1E293B',
};

export function useThemeColors(): ThemeColors {
  const { resolved } = useTheme();
  return resolved === 'light' ? LIGHT : DARK;
}
