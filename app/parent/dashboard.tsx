import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Svg, Circle } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../src/context/AuthContext';
import { useRequireAuth } from '../../src/hooks/useRequireAuth';
import { ChildRecords, classLabel, loadChildRecords } from '../../src/lib/parentData';
import {
  CODE_LENGTH,
  GuardianCodeError,
  GuardianLinkDoc,
  createGuardianLink,
  fetchStudentProfiles,
  listMyChildren,
  lookupGuardianCode,
  normaliseCode,
} from '../../src/lib/guardianCodes';
import { useThemeColors } from '../../src/theme';

/**
 * Parent dashboard.
 *
 * The children list, the link status and the visibility scopes come from
 * Firestore, which is the system of record — so a guardian who has just
 * registered lands on a working dashboard with no server running.
 *
 * Grades and quiz scores come from Firestore too (src/lib/parentData.ts). They
 * used to come from Flask, which resolves the guardian link from its own
 * Postgres table -- so a link created in this app was invisible to it and every
 * one of those calls answered `not_linked` for a connection that was live.
 *
 * ATTENDANCE is the one thing that cannot move. A day's attendance is a single
 * document holding the records map for the whole class, and a Firestore rule
 * can only allow or deny an entire document, so narrowing it to one child has
 * to happen somewhere that can filter. It stays on the class screen, which
 * still goes through the backend. See src/lib/api.ts.
 */

interface ChildCard {
  link: GuardianLinkDoc;
  /** users/{uid}, readable only once the link is approved. */
  profile: Record<string, any> | null;
  /** Grades and quiz scores, read from Firestore. Null while pending. */
  records: ChildRecords | null;
}

function childName(card: ChildCard | undefined): string {
  if (!card) return 'Your child';
  const p = card.profile;
  const fromProfile = p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() : '';
  // The link document carries a denormalised name precisely because a pending
  // guardian is denied the student's profile.
  return fromProfile || card.link.student_name || 'Your child';
}

export default function ParentDashboard() {
  const c = useThemeColors();
  useRequireAuth();
  const router = useRouter();
  const { profile } = useAuth();

  const [cards, setCards] = useState<ChildCard[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailOffline, setDetailOffline] = useState(false);

  const [showSwitchSheet, setShowSwitchSheet] = useState(false);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [addChildError, setAddChildError] = useState<string | null>(null);
  const [submittingLink, setSubmittingLink] = useState(false);

  const load = useCallback(async () => {
    try {
      const links = await listMyChildren();
      const profiles = await fetchStudentProfiles(
        links.filter((l) => l.status === 'approved').map((l) => l.student_uid)
      );

      /* Records come from Firestore now, one read set per approved child.
         A pending link is skipped rather than attempted: its scopes are all
         false, so every read would be denied by design. */
      const records = await Promise.all(
        links.map((link) =>
          link.status === 'approved'
            ? loadChildRecords(link.student_uid, link.scopes)
            : Promise.resolve(null)
        )
      );

      setCards(
        links
          .map<ChildCard>((link, i) => ({
            link,
            profile: profiles[link.student_uid] ?? null,
            records: records[i],
          }))
          // Approved children first, then alphabetically — a parent opening the
          // app wants the child whose records they can actually read.
          .sort((a, b) => {
            const rank = (c: ChildCard) => (c.link.status === 'approved' ? 0 : 1);
            return rank(a) - rank(b) || childName(a).localeCompare(childName(b));
          })
      );
      // Only a partial read is worth a banner now; a total failure surfaces
      // through loadError below.
      setDetailOffline(records.some((r) => r?.partial));
      setLoadError(null);
      // Keep the selection in range if a link was revoked while we were away.
      setActiveIdx((idx) => (idx < links.length ? idx : 0));
    } catch (err: any) {
      setLoadError(
        err?.code === 'permission-denied'
          ? 'Your account does not have guardian access yet. Try signing out and back in.'
          : 'Could not load your children. Check your connection and pull down to retry.'
      );
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

  const openAddChild = () => {
    setInviteCodeInput('');
    setAddChildError(null);
    setShowAddChildModal(true);
  };

  /**
   * Add another child. Same two checks as sign-up — the code must resolve to a
   * student, and the link write is what the rules gate — only here the guardian
   * already has an account, so there is no registration step in between.
   */
  const handleLinkChild = async () => {
    const code = normaliseCode(inviteCodeInput);
    if (code.length < CODE_LENGTH) {
      setAddChildError(`An invitation code is ${CODE_LENGTH} characters.`);
      return;
    }

    const uid = profile?.id;
    if (!uid) {
      setAddChildError('You are signed out. Please sign in again.');
      return;
    }

    setSubmittingLink(true);
    setAddChildError(null);
    try {
      const codeDoc = await lookupGuardianCode(code);
      const link = await createGuardianLink(
        codeDoc,
        {
          uid,
          name: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim(),
          email: profile.email ?? '',
        },
        undefined
      );

      setShowAddChildModal(false);
      setInviteCodeInput('');
      await load();
      Alert.alert(
        `${codeDoc.student_name} linked`,
        link.status === 'approved'
          ? 'You can now view their records.'
          : 'They need to approve the connection from their student portal before records unlock.'
      );
    } catch (err: any) {
      setAddChildError(
        err instanceof GuardianCodeError
          ? err.message
          : 'That code could not be redeemed. Check your connection and try again.'
      );
    } finally {
      setSubmittingLink(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-sunken">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const activeChild = cards[activeIdx];
  const records = activeChild?.records ?? null;
  const classes = records?.classes ?? [];
  const studentUid = activeChild?.link.student_uid ?? '';

  const radius = 40;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const average = records?.overallAverage ?? null;
  // CHED point-scale averages land in 1.0-5.0, where a percentage ring would
  // read as a near-empty circle. Only draw the ring for percentage grades.
  const ringRatio = average != null && average > 5 ? Math.min(average / 100, 1) : null;

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <StatusBar style="auto" />

      {/* Header and Child Switch Selector */}
      <View className="px-6 pt-6 pb-4 border-b border-hairline bg-sunken flex-row justify-between items-center">
        <View className="flex-1 pr-3">
          <Text className="text-accent-text text-xs font-bold uppercase tracking-wider">
            Parent Portal
          </Text>
          {activeChild ? (
            <TouchableOpacity
              onPress={() => setShowSwitchSheet(true)}
              disabled={cards.length < 2}
              className="flex-row items-center mt-1"
            >
              <Text className="text-ink text-xl font-extrabold font-sans pr-1">
                {childName(activeChild)}
              </Text>
              {cards.length > 1 && <Text className="text-accent-text text-sm">▼</Text>}
            </TouchableOpacity>
          ) : (
            <Text className="text-ink text-xl font-extrabold font-sans mt-1">No Child Linked</Text>
          )}
        </View>

        <View className="flex-row gap-2">
          {/* Always present, not only when the list is empty: a guardian with
              one child still needs somewhere to enter a second code. */}
          <TouchableOpacity onPress={openAddChild} className="px-3 py-2 bg-accent rounded-xl">
            <Text className="text-on-accent text-xs font-bold">+ Add Child</Text>
          </TouchableOpacity>
          {/* Profile rather than Logout: the header only has room for two
              buttons, and logging out now lives inside the profile screen —
              the same place the student side keeps it. */}
          <TouchableOpacity
            onPress={() => router.push('/parent/profile')}
            className="px-3 py-2 bg-surface border border-hairline rounded-xl"
          >
            <Text className="text-ink-muted text-xs font-bold">Profile</Text>
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
            <Text className="text-danger text-xs leading-relaxed">{loadError}</Text>
          </View>
        )}

        {cards.length === 0 ? (
          <View className="bg-surface/40 border border-hairline rounded-2xl p-8 items-center justify-center my-16">
            <Text className="text-ink-faint text-3xl mb-4">🛡️</Text>
            <Text className="text-ink text-base font-bold text-center">No Children Linked</Text>
            <Text className="text-ink-faint text-xs text-center mt-2 leading-relaxed max-w-xs">
              Link your child&apos;s profile to view their grades and attendance. Enter the
              {` ${CODE_LENGTH}`}-character code from their student portal below.
            </Text>
            <TouchableOpacity
              onPress={openAddChild}
              activeOpacity={0.8}
              className="w-full bg-accent py-4 rounded-xl items-center justify-center mt-6"
            >
              <Text className="text-on-accent text-sm font-bold">Enter Invitation Code</Text>
            </TouchableOpacity>
          </View>
        ) : activeChild.link.status !== 'approved' ? (
          /* DPA COMPLIANT ACCESS GATE / CONSENT RESTRICTION SCREEN */
          <View className="bg-surface border border-hairline rounded-3xl p-6 mt-6 items-center">
            <View className="w-16 h-16 bg-red-950/20 border border-red-500/20 rounded-full items-center justify-center mb-4">
              <Text className="text-danger text-2xl font-bold">🔒</Text>
            </View>
            <Text className="text-ink text-lg font-black text-center font-sans">
              Access Gate Restricted
            </Text>
            <Text className="text-ink-muted text-xs text-center mt-1">
              RA 10173 — Data Privacy Act of 2012
            </Text>

            <View className="w-full bg-sunken p-4 rounded-xl border border-hairline my-6">
              <Text className="text-ink-soft text-xs font-medium leading-relaxed">
                We need confirmation from{' '}
                <Text className="font-bold text-accent-text">{childName(activeChild)}</Text> before
                sharing academic records. Please ask them to approve your connection from their
                student portal profile page.
              </Text>
              <Text className="text-ink-faint text-[10px] mt-2">
                Status:{' '}
                <Text className="font-semibold capitalize text-warning">
                  {activeChild.link.status}
                </Text>
              </Text>
            </View>

            {/* Approval is the student's action, in their own portal. This only
                re-reads the link status — the app can no longer set it. */}
            <TouchableOpacity
              onPress={onRefresh}
              disabled={refreshing}
              className="w-full bg-accent py-4 rounded-xl items-center justify-center shadow-lg shadow-indigo-600/20"
            >
              {refreshing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text className="text-on-accent text-sm font-bold">Refresh Status</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          /* APPROVED PORTAL: METRICS & CLASSES LIST */
          <View className="pb-10">
            {detailOffline && (
              <View className="bg-amber-950/20 border border-amber-900/30 rounded-2xl p-4 mt-4">
                <Text className="text-warning text-[10px] font-extrabold uppercase tracking-wider mb-1">
                  Some records could not be loaded
                </Text>
                <Text className="text-ink-soft text-xs leading-relaxed">
                  The connection to {childName(activeChild)} is active, but part of their record
                  did not load. Pull down to retry.
                </Text>
              </View>
            )}

            <View className="bg-surface border border-hairline rounded-3xl p-6 mt-6 flex-row items-center justify-between">
              <View className="flex-1 pr-4">
                <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider">
                  Child Grade Standing
                </Text>
                <Text className="text-ink text-xl font-bold font-sans mt-2">
                  {average != null
                    ? `${average} average`
                    : !activeChild.link.scopes.can_view_grades
                      ? 'Grades hidden'
                      : detailOffline
                        ? 'Unavailable'
                        : 'No grades yet'}
                </Text>
                <Text className="text-ink-faint text-[10px] mt-1">
                  Registry: {activeChild.profile?.grade_level ?? activeChild.link.grade_level ?? '—'}{' '}
                  · ID{' '}
                  {activeChild.profile?.student_number ?? activeChild.link.student_number ?? '—'}
                </Text>
              </View>

              <View className="items-center justify-center relative">
                <Svg width="100" height="100" viewBox="0 0 100 100">
                  <Circle
                    cx="50"
                    cy="50"
                    r={radius}
                    stroke={c.track}
                    strokeWidth={strokeWidth}
                    fill="none"
                  />
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
                  <Text className="text-ink text-base font-black">
                    {average != null ? average : '—'}
                  </Text>
                  <Text className="text-ink-faint text-[8px] uppercase font-bold tracking-widest">
                    AVG
                  </Text>
                </View>
              </View>
            </View>

            {/* Attendance reads a per-student projection of the class sheet
                (attendance_summaries), because the sheet itself is one document
                for the whole class and a rule cannot hand over part of one. */}
            {activeChild.link.scopes.can_view_attendance && (
              <View className="bg-surface border border-hairline rounded-2xl px-5 py-4 mt-4 flex-row justify-between items-center">
                <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider">
                  Attendance Rate
                </Text>
                <Text className="text-ink text-base font-bold">
                  {records?.attendanceRate != null
                    ? `${records.attendanceRate}%`
                    : 'Not recorded yet'}
                </Text>
              </View>
            )}

            {activeChild.link.scopes.can_view_quiz_scores && (
              <View className="bg-surface border border-hairline rounded-2xl px-5 py-4 mt-4 flex-row justify-between items-center">
                <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider">
                  Quizzes Taken
                </Text>
                <Text className="text-ink text-base font-bold">
                  {records?.attempts.length ?? 0}
                </Text>
              </View>
            )}

            <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider mt-8 mb-4">
              Enrolled Course Sections ({classes.length})
            </Text>

            {classes.length === 0 ? (
              <View className="bg-surface/40 border border-hairline rounded-2xl p-8 items-center justify-center mt-2">
                <Text className="text-ink-faint text-sm text-center">
                  {!activeChild.link.scopes.can_view_grades
                    ? 'Grades are switched off for you.'
                    : detailOffline
                      ? 'Class list could not be loaded.'
                      : 'No grades have been recorded yet.'}
                </Text>
              </View>
            ) : (
              <View className="space-y-4">
                {classes.map((cls) => (
                  <TouchableOpacity
                    key={cls.class_id}
                    onPress={() =>
                      /* Typed routes want the ROUTE, with the segment passed as
                         a param -- an interpolated path is just a string and
                         does not typecheck against the generated route union. */
                      router.push({
                        pathname: '/parent/class/[classId]',
                        params: {
                          classId: cls.class_id,
                          studentId: studentUid,
                          studentName: childName(activeChild),
                        },
                      })
                    }
                    activeOpacity={0.8}
                    className="bg-surface border border-hairline p-5 rounded-2xl mt-4"
                  >
                    <View className="flex-row justify-between items-center">
                      <View className="flex-1 pr-3">
                        <Text className="text-accent-text text-[10px] font-bold uppercase tracking-wider">
                          {cls.section ?? ''}
                        </Text>
                        <Text className="text-ink text-base font-bold font-sans mt-1">
                          {classLabel(cls)}
                        </Text>
                        <Text className="text-ink-faint text-[10px] mt-2">
                          {cls.final_grade != null
                            ? `Current grade: ${cls.final_grade}`
                            : 'No grade recorded yet'}
                        </Text>
                      </View>
                      <Text className="text-accent-text text-lg font-bold">→</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* A second entry point to the same code box, reachable without going
            back to the header once the parent has scrolled. */}
        {cards.length > 0 && (
          <TouchableOpacity
            onPress={openAddChild}
            activeOpacity={0.8}
            className="bg-surface/40 border border-hairline/60 border-dashed rounded-2xl p-5 mb-10 items-center"
          >
            <Text className="text-ink-soft text-sm font-bold">+ Add another child</Text>
            <Text className="text-ink-faint text-[10px] mt-1 text-center">
              Enter the invitation code from another child&apos;s student portal
            </Text>
          </TouchableOpacity>
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
          <View className="bg-sunken border-t border-hairline rounded-t-3xl p-6">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-ink text-lg font-bold">Switch Linked Student</Text>
              <TouchableOpacity onPress={() => setShowSwitchSheet(false)}>
                <Text className="text-ink-muted text-sm font-semibold">Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView className="space-y-3 max-h-64">
              {cards.map((card, i) => (
                <TouchableOpacity
                  key={card.link.link_id}
                  onPress={() => {
                    setActiveIdx(i);
                    setShowSwitchSheet(false);
                  }}
                  className={`p-4 rounded-xl border flex-row justify-between items-center mt-3 ${
                    activeIdx === i
                      ? 'bg-accent/10 border-accent'
                      : 'bg-surface border-hairline'
                  }`}
                >
                  <View className="flex-1 pr-3">
                    <Text className="text-on-accent text-sm font-bold">{childName(card)}</Text>
                    <Text className="text-ink-muted text-xs mt-1">
                      ID: {card.profile?.student_number ?? card.link.student_number ?? '—'} ·{' '}
                      {card.profile?.grade_level ?? card.link.grade_level ?? '—'}
                    </Text>
                  </View>
                  {card.link.status !== 'approved' ? (
                    <Text className="text-warning text-xs font-bold">Pending</Text>
                  ) : (
                    activeIdx === i && (
                      <Text className="text-accent-text text-xs font-bold">✓ Active</Text>
                    )
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              onPress={() => {
                setShowSwitchSheet(false);
                openAddChild();
              }}
              className="border border-dashed border-hairline-strong rounded-xl p-4 mt-4 items-center"
            >
              <Text className="text-accent-text text-sm font-bold">+ Add another child</Text>
            </TouchableOpacity>
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
          <View className="bg-surface border border-hairline w-full max-w-sm rounded-3xl p-6">
            <Text className="text-ink text-xl font-bold mb-2">Link Student Record</Text>
            <Text className="text-ink-muted text-xs leading-normal mb-6">
              Enter the {CODE_LENGTH}-character invitation code from your child&apos;s student
              portal to connect to their records.
            </Text>

            {addChildError && (
              <View className="bg-red-500/10 border border-red-500/30 p-3 rounded-xl mb-4">
                <Text className="text-danger text-xs font-semibold leading-relaxed">
                  {addChildError}
                </Text>
              </View>
            )}

            <TextInput
              value={inviteCodeInput}
              onChangeText={(text) => {
                setInviteCodeInput(normaliseCode(text).slice(0, CODE_LENGTH));
                if (addChildError) setAddChildError(null);
              }}
              placeholder="e.g. XY89Z2"
              placeholderTextColor={c.inkFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={CODE_LENGTH * 2}
              editable={!submittingLink}
              returnKeyType="go"
              onSubmitEditing={handleLinkChild}
              className="w-full bg-sunken border border-hairline p-4 rounded-xl text-ink text-center text-xl font-bold tracking-[8px]"
            />
            <Text className="text-ink-faint text-[10px] text-center mt-2">
              {CODE_LENGTH} characters · no O, 0, I or 1
            </Text>

            <View className="flex-row gap-3 mt-6">
              <TouchableOpacity
                onPress={() => setShowAddChildModal(false)}
                disabled={submittingLink}
                className="flex-1 py-4 rounded-xl items-center justify-center bg-sunken border border-hairline"
              >
                <Text className="text-ink-muted text-sm font-bold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleLinkChild}
                disabled={submittingLink || inviteCodeInput.length < CODE_LENGTH}
                activeOpacity={0.8}
                className={`flex-1 py-4 rounded-xl items-center justify-center ${
                  inviteCodeInput.length < CODE_LENGTH ? 'bg-accent/30' : 'bg-accent'
                }`}
              >
                {submittingLink ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-ink text-sm font-bold">Link Child</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
