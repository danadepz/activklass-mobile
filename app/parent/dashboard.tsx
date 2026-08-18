import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Modal,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Svg, Circle } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import { errorMessage } from '../../src/lib/api';
import {
  DashboardChild,
  getParentDashboard,
  normaliseCode,
  redeemGuardianCode,
  studentFullName,
} from '../../src/lib/parent';

/**
 * Parent dashboard.
 *
 * Reads through the Flask API, not Firestore. The previous version listened to
 * consent_records and wrote its own approval status from the device — a parent's
 * phone deciding its own access level. guardian_links is write-denied to
 * clients now; the minor/adult decision happens server-side.
 *
 * That also means no onSnapshot: the API is not realtime, so this refreshes on
 * focus and on pull-to-refresh instead.
 */
export default function ParentDashboard() {
  const router = useRouter();

  const [children, setChildren] = useState<DashboardChild[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showSwitchSheet, setShowSwitchSheet] = useState(false);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [submittingLink, setSubmittingLink] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getParentDashboard();
      setChildren(data.children);
      setLoadError(null);
      // Keep the selection in range if a link was revoked while we were away.
      setActiveIdx((idx) => (idx < data.children.length ? idx : 0));
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not load your children.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refresh whenever the screen regains focus — this is how a parent sees that
  // their child just approved them, without a realtime listener.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handleLinkChild = async () => {
    const code = normaliseCode(inviteCodeInput);
    if (!code) return;

    setSubmittingLink(true);
    try {
      const link = await redeemGuardianCode(code);
      setShowAddChildModal(false);
      setInviteCodeInput('');
      await load();
      Alert.alert(
        'Student linked',
        link.status === 'approved'
          ? 'You can now view their records.'
          : 'Your child needs to approve the connection from their student portal before records unlock.'
      );
    } catch (err) {
      Alert.alert('Could not link', errorMessage(err, 'That code did not work.'));
    } finally {
      setSubmittingLink(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-950">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const activeChild: DashboardChild | undefined = children[activeIdx];
  const student = activeChild?.linked_student;
  const summary = activeChild?.performance_summary;
  const classes = activeChild?.classes ?? [];

  const radius = 40;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const average = summary?.overall_grade_average ?? null;
  // CHED point-scale averages land in 1.0-5.0, where a percentage ring would
  // read as a near-empty circle. Only draw the ring for percentage grades.
  const ringRatio = average != null && average > 5 ? Math.min(average / 100, 1) : null;

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />

      {/* Header and Child Switch Selector */}
      <View className="px-6 pt-6 pb-4 border-b border-slate-900 bg-slate-950 flex-row justify-between items-center">
        <View className="flex-1 pr-3">
          <Text className="text-indigo-400 text-xs font-bold uppercase tracking-wider">Parent Portal</Text>
          {activeChild ? (
            <TouchableOpacity
              onPress={() => setShowSwitchSheet(true)}
              className="flex-row items-center mt-1"
            >
              <Text className="text-white text-xl font-extrabold font-sans pr-1">
                {studentFullName(student)}
              </Text>
              {children.length > 1 && <Text className="text-indigo-400 text-sm">▼</Text>}
            </TouchableOpacity>
          ) : (
            <Text className="text-white text-xl font-extrabold font-sans mt-1">No Child Linked</Text>
          )}
        </View>

        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => setShowAddChildModal(true)}
            className="px-3 py-2 bg-indigo-650 rounded-xl"
          >
            <Text className="text-white text-xs font-bold">+ Add Child</Text>
          </TouchableOpacity>
          {/* Profile rather than Logout: the header only has room for two
              buttons, and logging out now lives inside the profile screen —
              the same place the student side keeps it. */}
          <TouchableOpacity
            onPress={() => router.push('/parent/profile')}
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl"
          >
            <Text className="text-slate-400 text-xs font-bold">Profile</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-6 py-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
        }
      >
        {loadError && (
          <View className="bg-red-950/20 border border-red-500/20 rounded-2xl p-4 mt-4">
            <Text className="text-red-300 text-xs leading-relaxed">{loadError}</Text>
          </View>
        )}

        {children.length === 0 ? (
          <View className="bg-slate-900/40 border border-slate-850 rounded-2xl p-8 items-center justify-center my-20">
            <Text className="text-slate-500 text-3xl mb-4">🛡️</Text>
            <Text className="text-white text-base font-bold text-center">No Children Linked</Text>
            <Text className="text-slate-600 text-xs text-center mt-2 leading-relaxed max-w-xs">
              Link your child&apos;s profile to view their grades and attendance. Tap &quot;+ Add
              Child&quot; above and enter the 6-character code from their student portal.
            </Text>
          </View>
        ) : activeChild.link_status !== 'approved' ? (
          /* DPA COMPLIANT ACCESS GATE / CONSENT RESTRICTION SCREEN */
          <View className="bg-slate-900 border border-slate-850 rounded-3xl p-6 mt-6 items-center">
            <View className="w-16 h-16 bg-red-950/20 border border-red-500/20 rounded-full items-center justify-center mb-4">
              <Text className="text-red-400 text-2xl font-bold">🔒</Text>
            </View>
            <Text className="text-white text-lg font-black text-center font-sans">
              Access Gate Restricted
            </Text>
            <Text className="text-slate-400 text-xs text-center mt-1">
              RA 10173 — Data Privacy Act of 2012
            </Text>

            <View className="w-full bg-slate-950 p-4 rounded-xl border border-slate-850 my-6">
              <Text className="text-slate-300 text-xs font-medium leading-relaxed">
                We need confirmation from{' '}
                <Text className="font-bold text-indigo-400">{studentFullName(student)}</Text> before
                sharing academic records. Please ask them to approve your connection from their
                student portal profile page.
              </Text>
              <Text className="text-slate-500 text-[10px] mt-2">
                Status:{' '}
                <Text className="font-semibold capitalize text-amber-400">
                  {activeChild.link_status}
                </Text>
              </Text>
            </View>

            {/* Approval is the student's action, in their own portal. This only
                re-reads the link status — the app can no longer set it. */}
            <TouchableOpacity
              onPress={onRefresh}
              disabled={refreshing}
              className="w-full bg-indigo-600 py-4 rounded-xl items-center justify-center shadow-lg shadow-indigo-600/20"
            >
              {refreshing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text className="text-white text-sm font-bold">Refresh Status</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          /* APPROVED PORTAL: METRICS & CLASSES LIST */
          <View className="pb-10">
            <View className="bg-slate-900 border border-slate-850 rounded-3xl p-6 mt-6 flex-row items-center justify-between">
              <View className="flex-1 pr-4">
                <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                  Child Grade Standing
                </Text>
                <Text className="text-white text-xl font-bold font-sans mt-2">
                  {average != null
                    ? `${average} average`
                    : activeChild.scopes.can_view_grades
                      ? 'No grades yet'
                      : 'Grades hidden'}
                </Text>
                <Text className="text-slate-500 text-[10px] mt-1">
                  Registry: {student?.grade_level ?? '—'} · ID {student?.student_number ?? '—'}
                </Text>
              </View>

              <View className="items-center justify-center relative">
                <Svg width="100" height="100" viewBox="0 0 100 100">
                  <Circle cx="50" cy="50" r={radius} stroke="#1e293b" strokeWidth={strokeWidth} fill="none" />
                  {ringRatio != null && (
                    <Circle
                      cx="50"
                      cy="50"
                      r={radius}
                      stroke="#10b981"
                      strokeWidth={strokeWidth}
                      fill="none"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference - ringRatio * circumference}
                      strokeLinecap="round"
                      transform="rotate(-90 50 50)"
                    />
                  )}
                </Svg>
                <View className="absolute items-center justify-center">
                  <Text className="text-white text-base font-black">
                    {average != null ? average : '—'}
                  </Text>
                  <Text className="text-slate-500 text-[8px] uppercase font-bold tracking-widest">
                    AVG
                  </Text>
                </View>
              </View>
            </View>

            {summary?.attendance_rate != null && (
              <View className="bg-slate-900 border border-slate-850 rounded-2xl px-5 py-4 mt-4 flex-row justify-between items-center">
                <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                  Attendance Rate
                </Text>
                <Text className="text-white text-base font-bold">{summary.attendance_rate}%</Text>
              </View>
            )}

            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-8 mb-4">
              Enrolled Course Sections ({classes.length})
            </Text>

            {classes.length === 0 ? (
              <View className="bg-slate-900/40 border border-slate-850 rounded-2xl p-8 items-center justify-center mt-2">
                <Text className="text-slate-500 text-sm">No active enrolled classes found.</Text>
              </View>
            ) : (
              <View className="space-y-4">
                {classes.map((cls) => (
                  <TouchableOpacity
                    key={cls.class_id}
                    onPress={() =>
                      router.push({
                        pathname: `/parent/class/${cls.class_id}`,
                        params: {
                          studentId: student?.id ?? '',
                          studentName: studentFullName(student),
                        },
                      })
                    }
                    activeOpacity={0.8}
                    className="bg-slate-900 border border-slate-850 p-5 rounded-2xl mt-4"
                  >
                    <View className="flex-row justify-between items-center">
                      <View className="flex-1 pr-3">
                        <Text className="text-indigo-400 text-[10px] font-bold uppercase tracking-wider">
                          {cls.section ?? '—'}
                        </Text>
                        <Text className="text-white text-base font-bold font-sans mt-1">
                          {cls.subject ?? cls.subject_code ?? 'Class'}
                        </Text>
                        <Text className="text-slate-500 text-[10px] mt-2">
                          {cls.current_grade != null
                            ? `Current grade: ${cls.current_grade}`
                            : 'No grade recorded yet'}
                        </Text>
                      </View>
                      <Text className="text-indigo-400 text-lg font-bold">→</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* MODAL: Switch Child Sliding Sheet */}
      <Modal
        visible={showSwitchSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSwitchSheet(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-slate-950 border-t border-slate-800 rounded-t-3xl p-6">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-white text-lg font-bold">Switch Linked Student</Text>
              <TouchableOpacity onPress={() => setShowSwitchSheet(false)}>
                <Text className="text-slate-400 text-sm font-semibold">Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView className="space-y-3 max-h-64">
              {children.map((child, i) => (
                <TouchableOpacity
                  key={child.link_id}
                  onPress={() => {
                    setActiveIdx(i);
                    setShowSwitchSheet(false);
                  }}
                  className={`p-4 rounded-xl border flex-row justify-between items-center mt-3 ${
                    activeIdx === i ? 'bg-indigo-600/10 border-indigo-500' : 'bg-slate-900 border-slate-850'
                  }`}
                >
                  <View>
                    <Text className="text-white text-sm font-bold">
                      {studentFullName(child.linked_student)}
                    </Text>
                    <Text className="text-slate-400 text-xs mt-1">
                      ID: {child.linked_student.student_number ?? '—'} ·{' '}
                      {child.linked_student.grade_level ?? '—'}
                    </Text>
                  </View>
                  {child.link_status !== 'approved' ? (
                    <Text className="text-amber-400 text-xs font-bold">Pending</Text>
                  ) : (
                    activeIdx === i && <Text className="text-indigo-400 text-xs font-bold">✓ Active</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL: Add Child Link */}
      <Modal
        visible={showAddChildModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddChildModal(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/65 px-6">
          <View className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-3xl p-6">
            <Text className="text-white text-xl font-bold mb-2">Link Student Record</Text>
            <Text className="text-slate-400 text-xs leading-normal mb-6">
              Enter the 6-character code from your child&apos;s student portal to connect to their
              records.
            </Text>

            <TextInput
              value={inviteCodeInput}
              onChangeText={setInviteCodeInput}
              placeholder="Enter code (e.g. FXN9SJ)"
              placeholderTextColor="#64748b"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              className="w-full bg-slate-950 border border-slate-850 p-4 rounded-xl text-white text-center text-base font-bold mb-6"
            />

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={handleLinkChild}
                disabled={submittingLink}
                className="flex-1 bg-indigo-600 py-3 rounded-xl items-center justify-center"
              >
                {submittingLink ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-white text-xs font-bold">Link Student</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowAddChildModal(false);
                  setInviteCodeInput('');
                }}
                disabled={submittingLink}
                className="flex-1 bg-slate-950 border border-slate-800 py-3 rounded-xl items-center justify-center"
              >
                <Text className="text-slate-400 text-xs font-bold">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
