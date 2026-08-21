import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ThemePreference, useTheme } from '../context/ThemeContext';

/**
 * The theme control.
 *
 * Two shapes from one component, because the two places it appears want
 * different things:
 *
 *   <ThemeToggle compact />  a single icon button for a screen header — one tap,
 *                            light ⇄ dark, no menu to open.
 *   <ThemeToggle />          the full three-way choice for a settings screen,
 *                            where "follow my phone" is worth offering and
 *                            worth showing as the current state.
 *
 * A lone icon button cannot express 'system', which is why the settings screen
 * gets the segmented control rather than the same button twice.
 */

const OPTIONS: { key: ThemePreference; label: string; icon: string }[] = [
  { key: 'light', label: 'Light', icon: '☀️' },
  { key: 'dark', label: 'Dark', icon: '🌙' },
  { key: 'system', label: 'System', icon: '📱' },
];

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { preference, resolved, setPreference, toggle } = useTheme();

  if (compact) {
    return (
      <TouchableOpacity
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
        className="w-11 h-11 items-center justify-center bg-surface border border-hairline rounded-xl"
      >
        {/* The icon shows what tapping GETS you, not what you are in — a moon
            while already dark reads as "you are here", and people tap it
            expecting nothing to change. */}
        <Text className="text-lg">{resolved === 'dark' ? '☀️' : '🌙'}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View>
      <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider mb-3">
        Appearance
      </Text>
      <View className="flex-row bg-sunken border border-hairline rounded-2xl p-1">
        {OPTIONS.map((opt) => {
          const selected = preference === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setPreference(opt.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              className={`flex-1 flex-row items-center justify-center py-3 rounded-xl ${
                selected ? 'bg-accent' : ''
              }`}
            >
              <Text className="text-sm mr-1.5">{opt.icon}</Text>
              <Text
                className={`text-xs font-bold ${
                  selected ? 'text-on-accent' : 'text-ink-muted'
                }`}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text className="text-ink-faint text-[11px] mt-2 leading-relaxed">
        {preference === 'system'
          ? `Following your phone, which is currently ${resolved}.`
          : `Always ${preference}, whatever your phone is set to.`}
      </Text>
    </View>
  );
}
