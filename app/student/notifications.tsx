import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  AppNotification,
  listMyNotifications,
  markAllRead,
  markRead,
} from '../../src/lib/notifications';

/**
 * Everything a teacher has sent this student.
 *
 * Reached from the bell in the dashboard header, not from the tab bar — four
 * tabs is the whole navigation, and notifications are something you check
 * rather than somewhere you live.
 */

const ICON: Record<string, string> = {
  score: '📊',
  attendance_contest: '🗓️',
  grade_contest: '📝',
};

function timeAgo(millis: number | null): string {
  if (millis == null) return 'just now';
  const mins = Math.floor((Date.now() - millis) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 7 ? `${days}d ago` : new Date(millis).toLocaleDateString();
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listMyNotifications());
      setError(null);
    } catch {
      setError('Could not load your notifications. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unread = items.filter((n) => !n.read).length;

  const handleMarkAll = async () => {
    // Optimistic: the badge should clear on the tap, not on the round trip.
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    try {
      await markAllRead(items);
    } catch {
      load();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <StatusBar style="auto" />

      <View className="px-6 pt-6 pb-4 border-b border-hairline flex-row justify-between items-center">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 items-center justify-center bg-surface border border-hairline rounded-xl mr-3"
          >
            <Text className="text-ink text-lg font-bold">←</Text>
          </TouchableOpacity>
          <View>
            <Text className="text-accent-text text-xs font-bold uppercase tracking-wider">
              Notifications
            </Text>
            <Text className="text-ink text-xl font-extrabold font-sans">
              {unread > 0 ? `${unread} unread` : 'All caught up'}
            </Text>
          </View>
        </View>

        {unread > 0 && (
          <TouchableOpacity
            onPress={handleMarkAll}
            className="px-3 py-2 bg-surface border border-hairline rounded-xl"
          >
            <Text className="text-ink-soft text-xs font-bold">Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-6 py-4"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor="#6366f1"
            />
          }
        >
          {error && (
            <View className="bg-red-950/20 border border-red-500/20 rounded-2xl p-4 mb-4">
              <Text className="text-danger text-xs leading-relaxed">{error}</Text>
            </View>
          )}

          {items.length === 0 ? (
            <View className="bg-surface/40 border border-hairline rounded-2xl p-8 items-center my-16">
              <Text className="text-ink-faint text-3xl mb-3">🔔</Text>
              <Text className="text-ink text-base font-bold">Nothing yet</Text>
              <Text className="text-ink-faint text-xs text-center mt-2 leading-relaxed">
                Your teacher will send you a note here when a score is posted or a request is
                resolved.
              </Text>
            </View>
          ) : (
            items.map((n) => (
              <TouchableOpacity
                key={n.id}
                activeOpacity={0.8}
                onPress={() => {
                  if (n.read) return;
                  setItems((list) =>
                    list.map((x) => (x.id === n.id ? { ...x, read: true } : x))
                  );
                  markRead(n.id).catch(() => load());
                }}
                className={`border rounded-2xl p-4 mb-3 ${
                  n.read ? 'bg-surface/40 border-hairline' : 'bg-surface border-accent/30'
                }`}
              >
                <View className="flex-row items-start">
                  <Text className="text-lg mr-3">{ICON[n.type ?? ''] ?? '🔔'}</Text>
                  <View className="flex-1">
                    <Text
                      className={`text-sm leading-relaxed ${
                        n.read ? 'text-ink-muted' : 'text-ink font-semibold'
                      }`}
                    >
                      {n.message}
                    </Text>
                    <Text className="text-ink-faint text-[10px] mt-2">
                      {timeAgo(n.created_at)}
                    </Text>
                  </View>
                  {!n.read && <View className="w-2 h-2 rounded-full bg-accent mt-1.5 ml-2" />}
                </View>
              </TouchableOpacity>
            ))
          )}
          <View className="h-10" />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
