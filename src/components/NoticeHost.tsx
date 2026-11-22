import { useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getNotice, subscribeNotice } from '../lib/notice';
import { useThemeColors } from '../theme';

export function NoticeHost() {
  const message = useSyncExternalStore(subscribeNotice, getNotice, getNotice);
  const { bottom } = useSafeAreaInsets();
  const colors = useThemeColors();
  if (!message) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', bottom: bottom + 16, left: 16, right: 16 }}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
        style={{ backgroundColor: colors.ink, color: colors.canvas, borderRadius: 12, padding: 14 }}>
        {message}
      </Text>
    </View>
  );
}
