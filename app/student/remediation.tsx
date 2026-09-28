import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  collection,
  query,
  where,
  getDocs,
  documentId,
} from 'firebase/firestore';
import { auth, db } from '../../src/config/firebase';
import { useAuth } from '../../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { loadSyllabus, Syllabus } from '../../src/lib/studentData';
import {
  BUCKETS,
  Bucket,
  MasteryQuiz,
  MasteryAttempt,
  AttemptsByQuiz,
  Resource,
  assignedToStudent,
  findTopic,
  masteryOf,
  quizTotalPoints,
  remediationQuizzes,
  resourceState,
  topicLocation,
  markdownToPlain,
  RESOURCE_META,
} from '../../src/lib/scaffolding';
import { attemptsAllowedFor, finishedAttempts, openAttempt } from '../../src/lib/quizAttempts';

interface RemediationDoc {
  id: string;
  topic?: string | null;
  topic_id?: string | null;
  title?: string | null;
  guidance?: string | null;
  recommended_quiz_id?: string | null;
  class_id: string;
  class_label?: string | null;
  created_at?: any;
  confidence_score?: number | null;
}

export default function StudentRemediationIndex() {
  const router = useRouter();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [remediations, setRemediations] = useState<RemediationDoc[]>([]);
  const [syllabusByClass, setSyllabusByClass] = useState<Record<string, Syllabus | null>>({});
  const [quizzesByClass, setQuizzesByClass] = useState<Record<string, MasteryQuiz[]>>({});
  const [attemptsByQuiz, setAttemptsByQuiz] = useState<AttemptsByQuiz>({});

  // Active study note modal state
  const [activeNote, setActiveNote] = useState<Resource | null>(null);

  const loadData = useCallback(async () => {
    const studentId = auth.currentUser?.uid || profile?.id;
    if (!studentId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      // 1. Fetch remediations for this student
      const remSnap = await getDocs(
        query(collection(db, 'remediations'), where('student_id', '==', studentId))
      );
      const remList = remSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as RemediationDoc))
        .sort((a, b) => {
          const aSec = a.created_at?.seconds ?? 0;
          const bSec = b.created_at?.seconds ?? 0;
          return bSec - aSec;
        });

      const classIds = [...new Set(remList.map((r) => r.class_id).filter(Boolean))];

      // 2. Fetch class labels in chunks of 10 (rule: chunk at 10 for Firestore security rules)
      const labels: Record<string, string> = {};
      for (let i = 0; i < classIds.length; i += 10) {
        const chunk = classIds.slice(i, i + 10);
        try {
          const cSnap = await getDocs(
            query(collection(db, 'classes'), where(documentId(), 'in', chunk))
          );
          cSnap.forEach((d) => {
            const data = d.data() as any;
            labels[d.id] = data.subject_code || data.subject || data.section || 'Class';
          });
        } catch (err) {
          console.error('[Remediation] class labels chunk error:', err);
        }
      }

      // 3. Concurrently fetch syllabus, quizzes, and quiz attempts
      const [syllabiList, quizSnaps, attemptsSnap] = await Promise.all([
        Promise.all(classIds.map((id) => loadSyllabus(id).catch(() => null))),
        Promise.all(
          classIds.map((id) =>
            getDocs(
              query(collection(db, 'quizzes'), where('class_ids', 'array-contains', id))
            ).catch(() => null)
          )
        ),
        getDocs(
          query(collection(db, 'quiz_attempts'), where('student_id', '==', studentId))
        ).catch(() => null),
      ]);

      const sylMap: Record<string, Syllabus | null> = {};
      const qzMap: Record<string, MasteryQuiz[]> = {};
      classIds.forEach((id, i) => {
        sylMap[id] = syllabiList[i] ?? null;
        qzMap[id] = (quizSnaps[i]?.docs ?? [])
          .map((d: any) => ({ id: d.id, ...d.data() } as MasteryQuiz))
          .filter(
            (q: MasteryQuiz) => (q.status === 'published' || q.status === 'closed') && assignedToStudent(q, studentId)
          );
      });

      const attByQuiz: AttemptsByQuiz = {};
      (attemptsSnap?.docs ?? []).forEach((d: any) => {
        const a = { id: d.id, ...d.data() } as MasteryAttempt & { quiz_id?: string; submitted_at?: any };
        if (a.quiz_id) {
          (attByQuiz[a.quiz_id] ??= []).push(a);
        }
      });

      for (const list of Object.values(attByQuiz)) {
        list.sort((a: any, b: any) => (b.submitted_at?.seconds ?? 0) - (a.submitted_at?.seconds ?? 0));
      }

      setRemediations(remList.map((r) => ({ ...r, class_label: labels[r.class_id] ?? null })));
      setSyllabusByClass(sylMap);
      setQuizzesByClass(qzMap);
      setAttemptsByQuiz(attByQuiz);
    } catch (err) {
      console.error('[Remediation] Error loading scaffolding data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const openExternalUrl = (url?: string | null) => {
    if (!url) return;
    Linking.openURL(url).catch((err) => console.error("Couldn't open URL:", err));
  };

  const getBucketBadgeStyle = (bucket: Bucket) => {
    switch (bucket) {
      case 'mastered':
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/30',
          text: 'text-emerald-500',
          bar: '#10b981',
        };
      case 'developing':
        return {
          bg: 'bg-amber-500/10 border-amber-500/30',
          text: 'text-amber-500',
          bar: '#f59e0b',
        };
      case 'needs':
        return {
          bg: 'bg-rose-500/10 border-rose-500/30',
          text: 'text-rose-500',
          bar: '#f43f5e',
        };
      case 'none':
      default:
        return {
          bg: 'bg-slate-500/10 border-slate-500/30',
          text: 'text-ink-muted',
          bar: '#64748b',
        };
    }
  };

  const studentUid = auth.currentUser?.uid || profile?.id || '';

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <StatusBar style="auto" />
      <View className="flex-1 px-5 pt-3 pb-2">
        {/* Header */}
        <View className="mt-4 mb-4">
          <Text className="text-ink text-2xl font-extrabold font-sans">
            Adaptive Remediation
          </Text>
          <Text className="text-ink-muted text-xs mt-1 leading-relaxed">
            Personalized study guides, curriculum topics, and practice mastery tests to close identified learning gaps.
          </Text>
        </View>

        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        ) : remediations.length === 0 ? (
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
          >
            <View className="bg-surface border border-hairline rounded-3xl p-8 items-center justify-center mx-2 my-auto shadow-sm">
              <Text className="text-4xl mb-3">🏆</Text>
              <Text className="text-ink text-base font-bold text-center">All Topics Mastered!</Text>
              <Text className="text-ink-faint text-xs text-center mt-2 leading-relaxed max-w-xs">
                Excellent work! There are currently no active remediation guides or unmastered topics flagged on your account.
              </Text>
            </View>
          </ScrollView>
        ) : (
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
          >
            <View className="space-y-6 pb-12">
              {remediations.map((rem) => {
                const classSyllabus = syllabusByClass[rem.class_id] ?? null;
                const classQuizzes = quizzesByClass[rem.class_id] ?? [];
                const loc = topicLocation(classSyllabus, rem.topic_id);
                const found = findTopic(classSyllabus, rem.topic_id);
                const resources = found?.topic?.resources ?? [];
                const objectives = found?.topic?.learning_objectives ?? found?.topic?.objectives ?? [];

                const linkedQuizzes = remediationQuizzes(rem, classQuizzes);
                const mastery = masteryOf(linkedQuizzes, attemptsByQuiz);
                const bucketConfig = BUCKETS[mastery.bucket];
                const bucketStyle = getBucketBadgeStyle(mastery.bucket);

                return (
                  <View
                    key={rem.id}
                    className="bg-surface border border-hairline p-5 rounded-3xl mt-4 shadow-sm"
                  >
                    {/* Header Tags */}
                    <View className="flex-row flex-wrap items-center gap-2 mb-3">
                      <View className="bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-full flex-row items-center">
                        <Text className="text-amber-500 text-[10px] font-bold uppercase tracking-wider">
                          📈 Remediation
                        </Text>
                      </View>
                      {rem.class_label && (
                        <View className="bg-sunken border border-hairline px-2.5 py-1 rounded-full">
                          <Text className="text-ink-muted text-[10px] font-semibold">
                            {rem.class_label}
                          </Text>
                        </View>
                      )}
                      {rem.confidence_score !== undefined && rem.confidence_score !== null && (
                        <View className="bg-sunken border border-hairline px-2 py-0.5 rounded-md">
                          <Text className="text-ink-faint text-[9px] font-medium">
                            Confidence: {rem.confidence_score}%
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Topic Title */}
                    <Text className="text-ink text-xl font-bold font-sans mb-4">
                      {rem.topic || rem.topic_id || 'Review Guide'}
                    </Text>

                    {/* Section 1: Where this fits in your modules */}
                    <View className="mb-5">
                      <Text className="text-ink-muted text-[10px] font-bold uppercase tracking-wider mb-2">
                        Where this fits in your modules
                      </Text>
                      {loc ? (
                        <View className="bg-indigo-950/10 border border-indigo-500/20 rounded-2xl p-4 flex-row items-center justify-between">
                          <View className="flex-1 pr-3">
                            <View className="flex-row items-center gap-1.5 flex-wrap">
                              <Text className="text-accent-text text-xs font-bold">
                                {loc.moduleLabel}: {loc.moduleTitle}
                              </Text>
                              <Text className="text-ink-faint text-xs">›</Text>
                              <Text className="text-ink text-xs font-semibold">
                                {loc.topicLabel}: {loc.topicTitle}
                              </Text>
                            </View>
                          </View>
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() =>
                              router.push({
                                pathname: '/student/class/[classId]',
                                params: { classId: rem.class_id, tab: 'syllabus', topic: rem.topic_id ?? '' },
                              })
                            }
                            className="bg-surface border border-hairline px-3 py-1.5 rounded-xl flex-row items-center"
                          >
                            <Text className="text-accent-text text-xs font-bold mr-1">Modules</Text>
                            <Text className="text-accent-text text-xs font-bold">→</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View className="border border-dashed border-hairline rounded-xl p-3 bg-sunken/40">
                          <Text className="text-ink-faint text-xs">
                            {!rem.topic_id
                              ? 'This review guide is not linked to a module in your class.'
                              : classSyllabus
                              ? 'The module this topic came from is not currently published.'
                              : 'The modules for this class have not been published yet.'}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Section 2: From your teacher */}
                    {rem.guidance && rem.guidance.trim().length > 0 && (
                      <View className="mb-5">
                        <Text className="text-ink-muted text-[10px] font-bold uppercase tracking-wider mb-2">
                          From your teacher
                        </Text>
                        <View className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
                          <Text className="text-ink text-xs leading-relaxed font-sans">
                            {markdownToPlain(rem.guidance)}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Section 3: Review Materials */}
                    <View className="mb-5">
                      <Text className="text-ink-muted text-[10px] font-bold uppercase tracking-wider mb-2">
                        Review Materials
                      </Text>

                      {/* Learning Objectives */}
                      {objectives.length > 0 && (
                        <View className="mb-3 space-y-1.5">
                          {objectives.map((obj, oi) => (
                            <View key={oi} className="flex-row items-start gap-2">
                              <Text className="text-emerald-500 text-xs">✓</Text>
                              <Text className="text-ink-soft text-xs flex-1 leading-normal">{obj}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {!found ? (
                        <View className="border border-dashed border-hairline rounded-xl p-3.5 bg-sunken/40">
                          <Text className="text-ink-faint text-xs">
                            {classSyllabus
                              ? 'This topic is no longer in the published syllabus modules.'
                              : 'The modules for this class have not been published yet.'}
                          </Text>
                        </View>
                      ) : resources.length === 0 ? (
                        <View className="border border-dashed border-hairline rounded-xl p-3.5 bg-sunken/40">
                          <Text className="text-ink-faint text-xs">
                            Your teacher hasn&apos;t attached any materials to{' '}
                            <Text className="font-semibold text-ink">{found.topic?.title ?? 'this topic'}</Text> yet.
                          </Text>
                        </View>
                      ) : (
                        <View className="space-y-2.5">
                          {resources.map((res, ri) => {
                            const state = resourceState(res);
                            const meta = RESOURCE_META[res.resource_type ?? 'file'] ?? RESOURCE_META.file;

                            if (!state.available) {
                              return (
                                <View
                                  key={res.id ?? res._key ?? ri}
                                  className="border border-dashed border-hairline rounded-2xl p-3.5 bg-sunken/30 flex-row items-center gap-3 opacity-60"
                                >
                                  <View className="w-9 h-9 rounded-xl bg-surface border border-hairline items-center justify-center">
                                    <Text className="text-base">{meta.icon}</Text>
                                  </View>
                                  <View className="flex-1">
                                    <Text className="text-ink-faint text-[9px] font-bold uppercase tracking-wider">
                                      {meta.label} · Unavailable
                                    </Text>
                                    <Text className="text-ink-muted text-xs font-semibold" numberOfLines={1}>
                                      {res.title || 'Untitled material'}
                                    </Text>
                                    {state.reason && (
                                      <Text className="text-ink-faint text-[10px] mt-0.5">{state.reason}</Text>
                                    )}
                                  </View>
                                </View>
                              );
                            }

                            return (
                              <TouchableOpacity
                                key={res.id ?? res._key ?? ri}
                                activeOpacity={0.8}
                                onPress={() => {
                                  if (res.resource_type === 'rich_text') {
                                    setActiveNote(res);
                                  } else {
                                    openExternalUrl(res.url);
                                  }
                                }}
                                className="bg-sunken/60 border border-hairline rounded-2xl p-3.5 flex-row items-center justify-between"
                              >
                                <View className="flex-row items-center gap-3 flex-1 pr-2">
                                  <View className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 items-center justify-center">
                                    <Text className="text-base">{meta.icon}</Text>
                                  </View>
                                  <View className="flex-1">
                                    <Text className="text-accent-text text-[9px] font-bold uppercase tracking-wider">
                                      {meta.label}
                                    </Text>
                                    <Text className="text-ink text-xs font-bold" numberOfLines={1}>
                                      {res.title || 'Learning resource'}
                                    </Text>
                                  </View>
                                </View>
                                <Text className="text-ink-faint text-xs font-bold">→</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>

                    {/* Section 4: Take Test Mastery */}
                    <View>
                      <Text className="text-ink-muted text-[10px] font-bold uppercase tracking-wider mb-2">
                        Take Test Mastery
                      </Text>

                      {linkedQuizzes.length === 0 ? (
                        <View className="border border-dashed border-hairline rounded-xl p-3.5 bg-sunken/40">
                          <Text className="text-ink-faint text-xs leading-relaxed">
                            {rem.topic_id
                              ? 'No mastery test has been published for this topic yet. Work through the review materials above.'
                              : 'This review guide is not linked to a module topic, and no practice test has been attached yet.'}
                          </Text>
                        </View>
                      ) : (
                        <View>
                          {/* Mastery Status Banner */}
                          <View className="bg-sunken/40 border border-hairline rounded-2xl p-3.5 mb-3 flex-row items-center gap-3">
                            <View className={`px-2.5 py-1 rounded-full border ${bucketStyle.bg}`}>
                              <Text className={`text-xs font-bold ${bucketStyle.text}`}>
                                {mastery.pct == null
                                  ? bucketConfig.label
                                  : `${bucketConfig.label} · ${mastery.pct}%`}
                              </Text>
                            </View>
                            <Text className="text-ink-muted text-xs flex-1 leading-snug">
                              {mastery.pct == null
                                ? 'You have not been scored on this topic yet. Take the test below to set your mastery.'
                                : `Your best of ${mastery.attempts} scored attempt${mastery.attempts === 1 ? '' : 's'}. A higher score replaces it.`}
                            </Text>
                          </View>

                          {/* Mastery Progress Bar */}
                          {mastery.pct != null && (
                            <View className="h-2 w-full bg-sunken rounded-full overflow-hidden mb-3.5">
                              <View
                                style={{
                                  height: '100%',
                                  width: `${Math.min(100, Math.max(0, mastery.pct))}%`,
                                  backgroundColor: bucketStyle.bar,
                                }}
                              />
                            </View>
                          )}

                          {/* Quizzes List */}
                          <View className="space-y-2.5">
                            {linkedQuizzes.map((quiz) => {
                              const attempts = attemptsByQuiz[quiz.id] ?? [];
                              const finished = finishedAttempts(attempts);
                              const live = openAttempt(attempts);
                              const allowed = attemptsAllowedFor(quiz, studentUid);
                              const used = finished.length;
                              const total = quizTotalPoints(quiz);
                              const scored = finished
                                .map((a) => a.total_score)
                                .filter((v): v is number => v != null);
                              const best = scored.length ? Math.max(...scored) : null;
                              const canTake = quiz.status === 'published' && (live || used < allowed);
                              const latest = finished[finished.length - 1] ?? null;

                              return (
                                <View
                                  key={quiz.id}
                                  className="bg-surface border border-hairline rounded-2xl p-3.5 flex-row items-center justify-between"
                                >
                                  <View className="flex-1 pr-3">
                                    <Text className="text-ink text-xs font-bold" numberOfLines={1}>
                                      {quiz.title || 'Mastery Quiz'}
                                    </Text>
                                    <Text className="text-ink-faint text-[10px] mt-1">
                                      {live
                                        ? 'In progress — carry on where you left off'
                                        : best == null
                                        ? `${total} point${total === 1 ? '' : 's'} · not taken`
                                        : Number.isFinite(allowed)
                                        ? `Best ${best}/${total} · ${used} of ${allowed} attempt${allowed === 1 ? '' : 's'} used`
                                        : `Best ${best}/${total} · ${used} attempt${used === 1 ? '' : 's'} so far`}
                                    </Text>
                                  </View>

                                  {canTake ? (
                                    <TouchableOpacity
                                      activeOpacity={0.8}
                                      onPress={() =>
                                        router.push({
                                          pathname: '/student/quiz-player',
                                          params: { quizId: quiz.id },
                                        })
                                      }
                                      className="bg-accent px-3.5 py-2 rounded-xl items-center justify-center shadow-sm"
                                    >
                                      <Text className="text-on-accent text-xs font-bold">
                                        {live ? 'Resume' : used > 0 ? 'Retake' : 'Take test'}
                                      </Text>
                                    </TouchableOpacity>
                                  ) : latest ? (
                                    <TouchableOpacity
                                      activeOpacity={0.8}
                                      onPress={() =>
                                        router.push({
                                          pathname: '/student/quiz-feedback',
                                          params: { attemptId: latest.id, quizId: quiz.id },
                                        })
                                      }
                                      className="bg-sunken border border-hairline px-3 py-2 rounded-xl items-center justify-center"
                                    >
                                      <Text className="text-ink-soft text-xs font-semibold">View result</Text>
                                    </TouchableOpacity>
                                  ) : (
                                    <Text className="text-ink-faint text-xs font-medium px-2">Closed</Text>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Study Note Modal */}
      <Modal
        visible={!!activeNote}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveNote(null)}
      >
        <SafeAreaView className="flex-1 bg-black/60 justify-end">
          <View className="bg-surface rounded-t-3xl max-h-[85%] border-t border-hairline px-6 pt-5 pb-8 shadow-2xl">
            <View className="flex-row items-center justify-between mb-4 border-b border-hairline pb-3">
              <View className="flex-1 pr-3">
                <Text className="text-accent-text text-[10px] font-bold uppercase tracking-wider">
                  Study Note
                </Text>
                <Text className="text-ink text-lg font-bold font-sans mt-0.5">
                  {activeNote?.title || 'Practice Note'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setActiveNote(null)}
                className="w-8 h-8 rounded-full bg-sunken items-center justify-center"
              >
                <Text className="text-ink font-bold text-sm">✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView className="mb-4">
              <Text className="text-ink-soft text-xs leading-relaxed font-sans">
                {markdownToPlain(activeNote?.content_markdown)}
              </Text>
            </ScrollView>

            <TouchableOpacity
              onPress={() => setActiveNote(null)}
              className="w-full bg-sunken border border-hairline py-3 rounded-2xl items-center justify-center mt-2"
            >
              <Text className="text-ink font-bold text-xs">Close Note</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
