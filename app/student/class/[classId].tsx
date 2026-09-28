import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, collection, query, where, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { Svg, Line, Circle, Text as SvgText, Polygon, Polyline, Defs, LinearGradient, Stop, G } from 'react-native-svg';
import { auth, db } from '../../../src/config/firebase';
import { useAuth } from '../../../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { useThemeColors } from '../../../src/theme';
import { formatGrade, gradeTone, gradePolicy, itemPasses, passNote } from '../../../src/lib/gradeDisplay';
import { loadSyllabus } from '../../../src/lib/studentData';

export default function StudentClassDetail() {
  const c = useThemeColors();
  const router = useRouter();
  const { classId, tab } = useLocalSearchParams<{ classId: string; tab?: string; topic?: string }>();
  const { profile } = useAuth();
  
  const [classInfo, setClassInfo] = useState<any>(null);
  const initialTab = tab === 'topics' || tab === 'syllabus' ? 'syllabus' : tab === 'analytics' ? 'analytics' : tab === 'grades' ? 'grades' : tab === 'attendance' ? 'attendance' : tab === 'announcements' ? 'announcements' : 'syllabus';
  const [activeTab, setActiveTab] = useState<'syllabus' | 'grades' | 'analytics' | 'attendance' | 'announcements'>(initialTab);
  const [loading, setLoading] = useState(true);

  // Syllabus / Topics State
  const [syllabus, setSyllabus] = useState<any>(null);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  
  // Grades / Grade Center State
  const [gradeEntry, setGradeEntry] = useState<any>(null);
  const [showContestModal, setShowContestModal] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<any>(null);
  const [contestReason, setContestReason] = useState('');
  const [contestError, setContestError] = useState<string | null>(null);
  const [submittingContest, setSubmittingContest] = useState(false);

  // Attendance State
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [selectedAttendanceLog, setSelectedAttendanceLog] = useState<any>(null);
  const [attendanceReason, setAttendanceReason] = useState('');
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [submittingAttendanceContest, setSubmittingAttendanceContest] = useState(false);

  // Announcements State
  const [announcements, setAnnouncements] = useState<any[]>([]);

  // Analytics Selection State
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);

  // Analytics calculations
  const analyticsData = useMemo(() => {
    const assessments = (gradeEntry?.assessments ?? []) as any[];
    const components = (gradeEntry?.components ?? []) as any[];
    const graded = assessments
      .filter((a) => a.status === 'graded' && a.raw_score != null && Number(a.total_points) > 0)
      .sort((a, b) => (a.date_given ?? '').localeCompare(b.date_given ?? '') || String(a.title ?? '').localeCompare(String(b.title ?? '')));

    const points = graded.map((a) => ({
      title: a.title || 'Untitled Assessment',
      date: a.date_given || null,
      you: Math.round((Number(a.raw_score) / Number(a.total_points)) * 100),
      avg: a.class_average != null ? Math.round((Number(a.class_average) / Number(a.total_points)) * 100) : null,
      raw: a.raw_score,
      total: a.total_points,
    }));

    const youAvg = points.length ? Math.round(points.reduce((s, p) => s + p.you, 0) / points.length) : null;
    const withAvg = points.filter((p) => p.avg != null);
    const classAvg = withAvg.length ? Math.round(withAvg.reduce((s, p) => s + p.avg!, 0) / withAvg.length) : null;
    const diff = youAvg != null && classAvg != null ? youAvg - classAvg : null;

    // Attendance rate
    const countedAttendance = attendanceLogs.length;
    const presentAttendance = attendanceLogs.filter((l) => l.status === 'present').length;
    const attRate = countedAttendance > 0 ? Math.round((presentAttendance / countedAttendance) * 100) : null;

    // Component performance
    const compRows = components
      .map((comp) => {
        const compAsmts = assessments.filter((a) => a.component_id === comp.id || a.component === comp.name);
        let earned = 0;
        let possible = 0;
        for (const a of compAsmts) {
          if (a.status === 'graded' && a.raw_score != null) {
            earned += Number(a.raw_score);
            possible += Number(a.total_points);
          } else if (a.status === 'missing') {
            possible += Number(a.total_points);
          }
        }
        const pct = possible > 0 ? Math.round((earned / possible) * 1000) / 10 : null;
        return { name: comp.name, weight: comp.weight_percent, pct };
      })
      .filter((r) => r.pct != null);

    return {
      graded,
      points,
      youAvg,
      classAvg,
      diff,
      attRate,
      compRows,
    };
  }, [gradeEntry, attendanceLogs]);

  useEffect(() => {
    if (!classId) return;
    const user = auth.currentUser;
    if (!user) return;

    // 1. Fetch Class Header Info
    const unsubscribeClass = onSnapshot(doc(db, 'classes', classId as string), async (docSnap) => {
      if (docSnap.exists()) {
        setClassInfo(docSnap.data());
        const syl = await loadSyllabus(classId as string);
        if (syl) setSyllabus(syl);
      }
    });

    // 2. Fetch Syllabus Info (per-class fallback)
    const unsubscribeSyllabus = onSnapshot(doc(db, 'classes', classId as string, 'syllabus', 'current'), (docSnap) => {
      if (docSnap.exists()) {
        setSyllabus((prev: any) => prev || docSnap.data());
      }
    });

    // 3. Fetch Quizzes for this Class.
    //
    // class_ids (array) is the canonical link -- a quiz can be assigned to
    // several classes, and every web read path queries it with array-contains
    // (student/classes/$classId/index.jsx, useClassRisk, scaffolds). Mobile
    // queried the legacy scalar class_id, which array-contains cannot match
    // and vice versa, so no web-created quiz ever reached this screen. Both
    // are watched until the backfill is confirmed everywhere, merged by id so
    // a doc carrying both fields is not listed twice.
    //
    // status is filtered client-side rather than in the query: array-contains
    // plus an equality filter needs a composite index that is not deployed,
    // and the web page filters the same way.
    const quizPages: Record<string, any[]> = { array: [], scalar: [] };
    const publishQuizzes = () => {
      const byId = new Map<string, any>();
      [...quizPages.array, ...quizPages.scalar].forEach((q) => byId.set(q.id, q));
      setQuizzes([...byId.values()]);
    };
    const watchQuizzes = (key: 'array' | 'scalar', constraint: any) =>
      onSnapshot(
        query(collection(db, 'quizzes'), constraint),
        (snapshot) => {
          quizPages[key] = snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }) as any)
            // Students never see drafts, and 'closed' stays readable so a
            // finished quiz keeps its feedback link. assigned_to targets a
            // subset of the class; absent or 'all' means everyone.
            .filter((q) => q.status === 'published' || q.status === 'closed')
            .filter((q) => {
              const a = q.assigned_to;
              return !a || a === 'all' || (Array.isArray(a) && a.includes(user.uid));
            });
          publishQuizzes();
        },
        (err) => console.error('quiz listener failed', err),
      );
    const unsubscribeQuizzesArray = watchQuizzes(
      'array',
      where('class_ids', 'array-contains', classId),
    );
    const unsubscribeQuizzesScalar = watchQuizzes('scalar', where('class_id', '==', classId));

    // 4. Fetch Gradebook Entry for this specific Student
    const unsubscribeGrades = onSnapshot(doc(db, 'gradebooks', classId as string, 'entries', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setGradeEntry(docSnap.data());
      }
    });

    // 5. Fetch Daily Attendance Logs (only recorded dates)
    const attendanceQuery = query(
      collection(db, 'classes', classId as string, 'attendance')
    );
    const unsubscribeAttendance = onSnapshot(attendanceQuery, (snapshot) => {
      const list: any[] = [];
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const studentRecord = data.records?.[user.uid] || data.status?.[user.uid];
        if (!studentRecord?.status) return;
        list.push({
          date: docSnap.id,
          status: studentRecord.status,
          remarks: studentRecord.remarks || '',
          excuse_url: studentRecord.excuse_url || null,
        });
      });
      // Sort chronologically in descending order
      list.sort((a, b) => b.date.localeCompare(a.date));
      setAttendanceLogs(list);
    });

    // 6. Fetch Class Announcements
    const announcementsQuery = query(
      collection(db, 'announcements'),
      where('class_id', '==', classId)
    );
    const unsubscribeAnnouncements = onSnapshot(announcementsQuery, (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      list.sort((a: any, b: any) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
      setAnnouncements(list);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => {
      unsubscribeClass();
      unsubscribeSyllabus();
      unsubscribeQuizzesArray();
      unsubscribeQuizzesScalar();
      unsubscribeGrades();
      unsubscribeAttendance();
      unsubscribeAnnouncements();
    };
  }, [classId]);

  // Handle grade dispute submission
  const handleSubmitContest = async () => {
    if (!selectedAssessment) return;
    const trimmed = contestReason.trim();
    if (!trimmed) {
      setContestError('Please explain why you are contesting this score.');
      return;
    }
    if (trimmed.length < 5) {
      setContestError('Please provide a more detailed explanation (at least 5 characters).');
      return;
    }
    if (trimmed.length > 500) {
      setContestError('Explanation is too long (at most 500 characters).');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setContestError('No active user session found. Please sign in again.');
      return;
    }

    setSubmittingContest(true);
    setContestError(null);
    try {
      /* grade_contests, NOT 'disputes'. firestore.rules grants no path called
         'disputes', so every write here used to hit the default deny -- and the
         catch below still showed a success alert first, so a student believed
         the dispute had been filed while the teacher's portal never saw one.
         The document id and field names match what activklass-web writes in
         routes/student/classes/$classId/index.jsx, because the teacher screen
         (routes/teacher/classes/$classId/record.jsx) reads exactly those keys:
         one dispute per score, keyed by class + assessment + student. */
      const contestId = `${classId}_${selectedAssessment.id}_${user.uid}`;
      await setDoc(doc(db, 'grade_contests', contestId), {
        class_id: classId as string,
        student_id: user.uid,
        student_name: `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || null,
        assessment_id: selectedAssessment.id,
        assessment_title: selectedAssessment.title,
        period_id: selectedAssessment.period_id ?? null,
        component_id: selectedAssessment.component_id ?? null,
        // Only a graded score is worth quoting back; 'missing' and 'excused'
        // carry no raw_score, and web sends null for the same reason.
        current_score: selectedAssessment.status === 'graded'
          ? selectedAssessment.raw_score ?? null
          : null,
        total_points: selectedAssessment.total_points ?? null,
        reason: trimmed,
        excuse_url: null,
        // The rules check this literal on create -- a student may only ever
        // open a dispute, never pre-resolve one.
        status: 'pending',
        created_at: serverTimestamp(),
      });

      Alert.alert('Success', 'Your grade dispute has been submitted directly to your teacher\'s portal.');
      setShowContestModal(false);
      setContestReason('');
      setContestError(null);
      setSelectedAssessment(null);
    } catch (e: any) {
      console.error('Error submitting grade contest:', e);
      setContestError(
        e?.message || 'Your grade dispute could not be filed. Check your connection and try again.',
      );
    } finally {
      setSubmittingContest(false);
    }
  };

  /* Attendance is CONTESTED, never self-served.

     The previous flow wrote classes/{classId}/attendance/{date} straight from
     the student and set their own record to 'excused'. Several things were
     wrong with it: firestore.rules lets only the owning teacher write that
     document, so every attempt was denied; the read-modify-write of the whole
     `records` map would have clobbered a concurrent teacher save even had it
     been permitted, because that one document holds the entire class; and a
     student marking their own absence excused is not something the system
     should allow at all. It also used Alert.prompt, which exists only on iOS --
     on Android the button did nothing whatsoever.

     A student files an attendance_contests document instead. Approving it is
     what flips the day to excused, and the teacher's web attendance screen
     already does exactly that. */
  const handleSubmitAttendanceContest = async () => {
    if (!selectedAttendanceLog) return;
    const trimmed = attendanceReason.trim();
    if (!trimmed) {
      setAttendanceError('Please explain why you are contesting this record.');
      return;
    }
    if (trimmed.length < 5) {
      setAttendanceError('Please provide a more detailed explanation (at least 5 characters).');
      return;
    }
    if (trimmed.length > 500) {
      setAttendanceError('Explanation is too long (at most 500 characters).');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setAttendanceError('No active user session found. Please sign in again.');
      return;
    }

    setSubmittingAttendanceContest(true);
    setAttendanceError(null);
    try {
      // Same id convention as activklass-web: one contest per student per day,
      // so re-filing replaces the earlier one rather than queueing a duplicate.
      const contestId = `${classId}_${selectedAttendanceLog.date}_${user.uid}`;
      await setDoc(doc(db, 'attendance_contests', contestId), {
        class_id: classId as string,
        student_id: user.uid,
        student_name: `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || null,
        date: selectedAttendanceLog.date,
        current_status: selectedAttendanceLog.status ?? null,
        reason: trimmed,
        // Web attaches an uploaded file here; this screen has no file picker
        // yet, so the reason text carries the justification on its own.
        excuse_url: null,
        // Checked literally by the create rule -- a student may only open a
        // contest, never resolve one.
        status: 'pending',
        created_at: serverTimestamp(),
      });

      Alert.alert(
        'Contest filed',
        'Your teacher will review it. This date stays as it is until they approve the contest.',
      );
      setSelectedAttendanceLog(null);
      setAttendanceReason('');
      setAttendanceError(null);
    } catch (e: any) {
      console.error('Error filing attendance contest:', e);
      setAttendanceError(
        e?.message || 'Your attendance contest could not be filed. Check your connection and try again.',
      );
    } finally {
      setSubmittingAttendanceContest(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-sunken">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const openQuiz = (quizId: string) =>
    router.push({ pathname: '/student/quiz-player', params: { quizId } });

  // A quiz is only drawn inside its module, so anything whose module_id is
  // null or points at a module this syllabus does not have had nowhere to
  // appear -- which is every remediation quiz (scaffolds.jsx writes no
  // module_id) and every AI quiz generated without picking a syllabus topic.
  // Those go in their own section below, and the no-syllabus branch lists all
  // of them rather than claiming the class has no work.
  const moduleIds = new Set((syllabus?.modules ?? []).map((m: any) => String(m.id)));
  const unalignedQuizzes = quizzes.filter(
    (q) => !q.module_id || !moduleIds.has(String(q.module_id)),
  );

  const QuizLink = ({ quiz }: { quiz: any }) => (
    <TouchableOpacity
      onPress={() => openQuiz(quiz.id)}
      className="bg-accent/10 border border-accent/25 p-3 rounded-xl flex-row justify-between items-center mt-4"
    >
      <View className="flex-1 pr-3">
        <Text className="text-accent-text text-[10px] font-black uppercase">
          {quiz.status === 'closed' ? '✓ Closed Assessment' : '✏️ Published Assessment'}
        </Text>
        <Text className="text-on-accent text-xs font-bold mt-0.5">{quiz.title}</Text>
        <Text className="text-ink-faint text-[9px] mt-1">
          {/* The draw, not the pool: a pooled quiz stores 30 questions and
              hands each student 10, and promising 30 would be a lie the player
              immediately contradicts. */}
          {quiz.pool_enabled ? Number(quiz.pool_draw_count) || 0 : quiz.questions?.length || 0} items
          {(quiz.time_limit_minutes || quiz.time_limit)
            ? ` · ${quiz.time_limit_minutes || quiz.time_limit} mins`
            : ' · No time limit'}
        </Text>
      </View>
      <Text className="text-accent-text text-base font-bold">→</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <StatusBar style="auto" />
      
      {/* Dynamic Header */}
      <View className="px-6 pt-6 pb-4 border-b border-hairline bg-sunken">
        <TouchableOpacity onPress={() => router.back()} className="self-start mb-4">
          <Text className="text-ink-muted text-sm font-semibold">← Back to Dashboard</Text>
        </TouchableOpacity>
        <Text className="text-accent-text text-xs font-bold uppercase tracking-wider">
          {classInfo?.section || 'Section'}
        </Text>
        <Text className="text-ink text-2xl font-black font-sans mt-1">
          {classInfo?.subject || 'Course Detail'}
        </Text>
      </View>

      {/* Segmented Controls tab bar */}
      <View className="bg-surface border-b border-hairline">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          {([
            { id: 'syllabus', label: 'Modules' },
            { id: 'grades', label: 'Grades' },
            { id: 'analytics', label: 'Analytics' },
            { id: 'attendance', label: 'Attendance' },
            { id: 'announcements', label: 'Bulletins' },
          ] as const).map((tabItem) => (
            <TouchableOpacity
              key={tabItem.id}
              onPress={() => setActiveTab(tabItem.id)}
              className={`px-4 py-3.5 items-center ${activeTab === tabItem.id ? 'border-b-2 border-accent' : ''}`}
            >
              <Text className={`text-xs font-bold ${activeTab === tabItem.id ? 'text-accent-text' : 'text-ink-faint'}`}>
                {tabItem.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView className="flex-1 px-6 py-4">
        
        {/* SYLLABUS TAB CONTENT */}
        {activeTab === 'syllabus' && (
          <View className="pb-10">
            {syllabus?.modules ? (
              syllabus.modules.map((mod: any) => (
                <View key={mod.id} className="bg-surface border border-hairline rounded-2xl p-5 mb-5 mt-3">
                  <Text className="text-accent-text text-[10px] font-bold uppercase tracking-wider">Module {mod.id}</Text>
                  <Text className="text-ink text-base font-bold font-sans mt-1">{mod.title}</Text>
                  <Text className="text-ink-muted text-xs mt-2 leading-relaxed">{mod.description}</Text>
                  
                  {/* Topics feed inside modules */}
                  <View className="mt-4 pt-4 border-t border-hairline space-y-3">
                    {mod.topics?.map((topic: any) => (
                      <View key={topic.id} className="bg-sunken/40 p-3 rounded-xl border border-hairline">
                        <Text className="text-ink-soft text-xs font-semibold">📍 {topic.title}</Text>
                        <View className="mt-2 pl-4">
                          {topic.learning_objectives?.map((obj: string, i: number) => (
                            <Text key={i} className="text-ink-faint text-[10px] mt-1 leading-normal">• {obj}</Text>
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* Quizzes aligned to this module */}
                  {quizzes
                    .filter((q) => String(q.module_id) === String(mod.id))
                    .map((quiz) => (
                      <QuizLink key={quiz.id} quiz={quiz} />
                    ))}

                </View>
              ))
            ) : (
              <View className="items-center py-10">
                <Text className="text-ink-faint text-sm">No syllabus structure uploaded by teacher yet.</Text>
              </View>
            )}

            {unalignedQuizzes.length > 0 && (
              <View className="bg-surface border border-hairline rounded-2xl p-5 mb-5 mt-3">
                <Text className="text-accent-text text-[10px] font-bold uppercase tracking-wider">
                  Assessments
                </Text>
                <Text className="text-ink-muted text-xs mt-2 leading-relaxed">
                  Not tied to a syllabus module.
                </Text>
                {unalignedQuizzes.map((quiz) => (
                  <QuizLink key={quiz.id} quiz={quiz} />
                ))}
              </View>
            )}
          </View>
        )}

        {/* GRADE CENTER TAB CONTENT */}
        {activeTab === 'grades' && (
          <View className="pb-10">
            {/* Summary GPA card */}
            <View className="bg-surface border border-hairline p-5 rounded-2xl flex-row justify-between items-center mt-3 mb-6">
              <View>
                <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider">Computed Term Grade</Text>
                <Text className="text-ink text-3xl font-extrabold mt-1 font-sans">
                  {formatGrade(gradeEntry?.final_grade, gradeEntry?.mode)}
                </Text>
                <Text className="text-ink-faint text-[10px] mt-1">
                  {passNote(gradeEntry?.mode, gradeEntry)}
                </Text>
              </View>
              {gradeEntry?.final_grade != null && (
                <View className={`px-4 py-2 rounded-xl border ${
                  gradeTone(gradeEntry.final_grade, gradeEntry.mode, gradeEntry).tone === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : gradeTone(gradeEntry.final_grade, gradeEntry.mode, gradeEntry).tone === 'accent'
                    ? 'bg-indigo-500/10 border-indigo-500/30'
                    : gradeTone(gradeEntry.final_grade, gradeEntry.mode, gradeEntry).tone === 'warning'
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-red-500/10 border-red-500/30'
                }`}>
                  <Text className={`text-xs font-bold uppercase ${
                    gradeTone(gradeEntry.final_grade, gradeEntry.mode, gradeEntry).tone === 'success'
                      ? 'text-emerald-500'
                      : gradeTone(gradeEntry.final_grade, gradeEntry.mode, gradeEntry).tone === 'accent'
                      ? 'text-indigo-500'
                      : gradeTone(gradeEntry.final_grade, gradeEntry.mode, gradeEntry).tone === 'warning'
                      ? 'text-amber-500'
                      : 'text-rose-500'
                  }`}>
                    {gradeTone(gradeEntry.final_grade, gradeEntry.mode, gradeEntry).label}
                  </Text>
                </View>
              )}
            </View>

            {/* List of Assessments */}
            <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider mb-4">Graded Assessments</Text>
            
            {gradeEntry?.assessments ? (
              gradeEntry.assessments.map((asm: any) => (
                <View key={asm.id} className="bg-surface border border-hairline p-4 rounded-xl mb-4 mt-2">
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1 pr-3">
                      <Text className="text-ink-faint text-[9px] font-bold uppercase tracking-wider">{asm.component_id || asm.component}</Text>
                      <Text className="text-ink text-sm font-bold mt-1 font-sans">{asm.title}</Text>
                      <Text className="text-ink-muted text-xs mt-2 font-mono">
                        Score: <Text className="text-ink font-bold">{asm.raw_score ?? '—'}</Text> / {asm.total_points}
                      </Text>
                      <Text className="text-ink-faint text-[10px] mt-1">Class Average: {asm.class_average ?? '—'}</Text>
                    </View>

                    {/* Dispute Button */}
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedAssessment(asm);
                        setContestReason('');
                        setContestError(null);
                        setShowContestModal(true);
                      }}
                      className="bg-sunken border border-hairline px-3 py-1.5 rounded-lg"
                    >
                      <Text className="text-ink-soft text-[10px] font-bold">Contest</Text>
                    </TouchableOpacity>
                  </View>
                  
                  {/* Score Bar Visualizer */}
                  {asm.raw_score !== undefined && asm.total_points > 0 && (
                    <View className="w-full h-2 bg-sunken rounded-full mt-3 overflow-hidden">
                      <View 
                        style={{ width: `${Math.min(100, (asm.raw_score / asm.total_points) * 100)}%` }}
                        className={`h-full ${itemPasses(asm.raw_score, asm.total_points, gradeEntry) ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      />
                    </View>
                  )}
                </View>
              ))
            ) : (
              <View className="items-center py-10">
                <Text className="text-ink-faint text-sm">No graded entries found in class record.</Text>
              </View>
            )}

            {/* Score dispute input modal (Overlay layout in tabs) */}
            {showContestModal && selectedAssessment && (
              <View className="bg-surface border border-accent/40 p-5 rounded-2xl mt-4 shadow-xl">
                <Text className="text-accent-text text-xs font-bold uppercase tracking-wider mb-1">Score Dispute Form</Text>
                <Text className="text-ink text-sm font-bold mt-1 mb-2 font-sans">
                  Contesting: {selectedAssessment.title}
                </Text>
                <Text className="text-ink-muted text-xs leading-normal mb-3">
                  Provide your teacher with details regarding the score discrepancy.
                </Text>

                {contestError && (
                  <View className="bg-red-500/10 border border-red-500/30 p-3 rounded-xl mb-3">
                    <Text className="text-danger text-xs font-semibold leading-relaxed">
                      {contestError}
                    </Text>
                  </View>
                )}
                
                <TextInput
                  value={contestReason}
                  onChangeText={(text) => {
                    setContestReason(text);
                    if (contestError) setContestError(null);
                  }}
                  placeholder="Justification details here..."
                  placeholderTextColor={c.inkFaint}
                  multiline
                  numberOfLines={4}
                  className="w-full bg-sunken border border-hairline p-3 rounded-xl text-ink text-xs mb-4"
                />

                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={handleSubmitContest}
                    disabled={submittingContest}
                    className="flex-1 bg-accent py-3 rounded-xl items-center"
                  >
                    {submittingContest ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text className="text-on-accent text-xs font-bold">Submit Contest</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setShowContestModal(false);
                      setSelectedAssessment(null);
                      setContestReason('');
                      setContestError(null);
                    }}
                    className="flex-1 bg-canvas border border-hairline py-3 rounded-xl items-center"
                  >
                    <Text className="text-ink-soft text-xs font-bold">Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

          </View>
        )}

        {/* SUBJECT ANALYTICS TAB CONTENT */}
        {activeTab === 'analytics' && (
          <View className="pb-10">
            {/* Metric Summary Cards */}
            <View className="mt-3 mb-4">
              <View className="flex-row gap-3">
                {/* Current Grade */}
                <View className="flex-1 bg-surface border border-hairline p-4 rounded-2xl">
                  <Text className="text-ink-muted text-[10px] font-bold uppercase tracking-wider">Current Grade</Text>
                  <Text className="text-ink text-2xl font-extrabold mt-1 font-sans">
                    {formatGrade(gradeEntry?.final_grade, gradeEntry?.mode)}
                  </Text>
                  <Text className="text-ink-faint text-[9px] mt-0.5" numberOfLines={1}>
                    {passNote(gradeEntry?.mode, gradeEntry)}
                  </Text>
                </View>

                {/* Your Average */}
                <View className="flex-1 bg-surface border border-hairline p-4 rounded-2xl">
                  <Text className="text-ink-muted text-[10px] font-bold uppercase tracking-wider">Your Average</Text>
                  <Text className="text-ink text-2xl font-extrabold mt-1 font-sans">
                    {analyticsData.youAvg != null ? `${analyticsData.youAvg}%` : '—'}
                  </Text>
                  <Text className="text-ink-faint text-[9px] mt-0.5">Across graded items</Text>
                </View>
              </View>

              <View className="flex-row gap-3 mt-3">
                {/* vs Class */}
                <View className="flex-1 bg-surface border border-hairline p-4 rounded-2xl">
                  <Text className="text-ink-muted text-[10px] font-bold uppercase tracking-wider">vs Class Avg</Text>
                  <Text className={`text-2xl font-extrabold mt-1 font-sans ${
                    analyticsData.diff == null ? 'text-ink-faint' : analyticsData.diff >= 0 ? 'text-emerald-500' : 'text-rose-500'
                  }`}>
                    {analyticsData.diff == null
                      ? '—'
                      : `${analyticsData.diff >= 0 ? '+' : ''}${analyticsData.diff}%`}
                  </Text>
                  <Text className="text-ink-faint text-[9px] mt-0.5">
                    {analyticsData.classAvg != null ? `Class avg ${analyticsData.classAvg}%` : 'No class avg yet'}
                  </Text>
                </View>

                {/* Attendance Rate */}
                <View className="flex-1 bg-surface border border-hairline p-4 rounded-2xl">
                  <Text className="text-ink-muted text-[10px] font-bold uppercase tracking-wider">Attendance</Text>
                  <Text className="text-ink text-2xl font-extrabold mt-1 font-sans">
                    {analyticsData.attRate != null ? `${analyticsData.attRate}%` : '—'}
                  </Text>
                  <Text className="text-ink-faint text-[9px] mt-0.5">
                    {attendanceLogs.length} {attendanceLogs.length === 1 ? 'day recorded' : 'days recorded'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Empty state when no graded assessments exist */}
            {analyticsData.points.length === 0 ? (
              <View className="bg-surface border border-hairline rounded-2xl p-8 items-center justify-center my-4">
                <Text className="text-3xl mb-3">📊</Text>
                <Text className="text-ink text-sm font-bold text-center">No Analytics Recorded Yet</Text>
                <Text className="text-ink-faint text-xs text-center mt-1.5 leading-relaxed max-w-xs">
                  Once your instructor grades and returns assessments, your comparative trends and mastery charts will appear here.
                </Text>
              </View>
            ) : (
              <>
                {/* SVG Performance Line Chart */}
                <View className="bg-surface border border-hairline rounded-2xl p-4 mb-4 shadow-sm">
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-ink text-xs font-bold uppercase tracking-wider">Performance Trend</Text>
                    <View className="flex-row items-center gap-3">
                      <View className="flex-row items-center gap-1">
                        <View className="w-2.5 h-2.5 rounded-full bg-[#1C5CAB]" />
                        <Text className="text-ink-muted text-[10px]">You</Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <View className="w-2.5 h-2.5 rounded-full bg-[#8C8C86]" />
                        <Text className="text-ink-muted text-[10px]">Class</Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <View className="w-3 h-0 border-t border-dashed border-amber-600" />
                        <Text className="text-amber-600 text-[10px] font-bold">
                          Pass {gradePolicy(gradeEntry).passing_percent}%
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* SVG Chart */}
                  {(() => {
                    const points = analyticsData.points;
                    const W = 320;
                    const H = 140;
                    const padL = 26;
                    const padR = 12;
                    const padT = 12;
                    const padB = 22;
                    const innerW = W - padL - padR;
                    const innerH = H - padT - padB;
                    const passMark = gradePolicy(gradeEntry).passing_percent;

                    const x = (i: number) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
                    const y = (v: number) => padT + (1 - Math.max(0, Math.min(100, v)) / 100) * innerH;

                    const youLine = points.map((p, i) => `${x(i)},${y(p.you)}`).join(' ');
                    const youArea = `${padL},${y(0)} ${youLine} ${x(points.length - 1)},${y(0)}`;
                    const avgPoints = points
                      .map((p, i) => (p.avg != null ? `${x(i)},${y(p.avg)}` : null))
                      .filter(Boolean)
                      .join(' ');

                    const activeIndex = selectedPointIndex ?? points.length - 1;
                    const activePoint = points[activeIndex];

                    return (
                      <View>
                        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
                          <Defs>
                            <LinearGradient id="youGradient" x1="0" y1="0" x2="0" y2="1">
                              <Stop offset="0" stopColor="#1C5CAB" stopOpacity="0.25" />
                              <Stop offset="1" stopColor="#1C5CAB" stopOpacity="0.0" />
                            </LinearGradient>
                          </Defs>

                          {/* Grid lines */}
                          {[0, 50, 100].map((g) => (
                            <G key={g}>
                              <Line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
                              <SvgText x={padL - 4} y={y(g) + 3} textAnchor="end" fontSize="8" fill="#94A3B8" fontWeight="600">
                                {g}
                              </SvgText>
                            </G>
                          ))}

                          {/* Passing threshold line */}
                          <Line
                            x1={padL}
                            y1={y(passMark)}
                            x2={W - padR}
                            y2={y(passMark)}
                            stroke="#D97706"
                            strokeWidth="1.2"
                            strokeDasharray="4,3"
                          />

                          {/* Gradient fill under student line */}
                          {points.length >= 2 && <Polygon points={youArea} fill="url(#youGradient)" />}

                          {/* Class average polyline */}
                          {avgPoints ? (
                            <Polyline points={avgPoints} fill="none" stroke="#8C8C86" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          ) : null}

                          {/* Student polyline */}
                          {points.length >= 2 ? (
                            <Polyline points={youLine} fill="none" stroke="#1C5CAB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          ) : null}

                          {/* Point dots */}
                          {points.map((p, i) => (
                            <G key={i}>
                              {p.avg != null && (
                                <Circle cx={x(i)} cy={y(p.avg)} r="3" fill="#FFFFFF" stroke="#8C8C86" strokeWidth="1.5" />
                              )}
                              <Circle
                                cx={x(i)}
                                cy={y(p.you)}
                                r={activeIndex === i ? 5 : 3.5}
                                fill={activeIndex === i ? "#4F46E5" : "#1C5CAB"}
                                stroke="#FFFFFF"
                                strokeWidth="1.5"
                              />
                              <SvgText
                                x={x(i)}
                                y={H - 6}
                                textAnchor="middle"
                                fontSize="8"
                                fill={activeIndex === i ? "#4F46E5" : "#94A3B8"}
                                fontWeight={activeIndex === i ? "bold" : "normal"}
                              >
                                {i + 1}
                              </SvgText>
                            </G>
                          ))}
                        </Svg>

                        {/* Selected Point Info Banner */}
                        {activePoint && (
                          <View className="bg-sunken/70 border border-hairline rounded-xl p-2.5 mt-2 flex-row justify-between items-center">
                            <View className="flex-1 pr-2">
                              <Text className="text-ink text-xs font-bold" numberOfLines={1}>
                                {activeIndex + 1}. {activePoint.title}
                              </Text>
                              {activePoint.date && (
                                <Text className="text-ink-faint text-[9px]">{activePoint.date}</Text>
                              )}
                            </View>
                            <View className="flex-row items-center gap-3">
                              <Text className="text-indigo-600 text-xs font-bold">You: {activePoint.you}%</Text>
                              <Text className="text-ink-muted text-xs">
                                Class: {activePoint.avg != null ? `${activePoint.avg}%` : '—'}
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })()}
                </View>

                {/* Item Scores Breakdown */}
                <View className="bg-surface border border-hairline rounded-2xl p-4 mb-4">
                  <Text className="text-ink text-xs font-bold uppercase tracking-wider mb-3">Item Scores</Text>
                  <View className="space-y-2">
                    {analyticsData.points.map((p, i) => (
                      <TouchableOpacity
                        key={i}
                        activeOpacity={0.8}
                        onPress={() => setSelectedPointIndex(i)}
                        className={`p-3 rounded-xl border flex-row items-center justify-between ${
                          selectedPointIndex === i
                            ? 'bg-indigo-500/10 border-indigo-500/30'
                            : 'bg-sunken/40 border-hairline'
                        }`}
                      >
                        <View className="flex-1 pr-3">
                          <View className="flex-row items-center gap-2">
                            <Text className="text-ink-faint text-[10px] font-mono font-bold">#{i + 1}</Text>
                            <Text className="text-ink text-xs font-bold" numberOfLines={1}>
                              {p.title}
                            </Text>
                          </View>
                          <Text className="text-ink-faint text-[9px] mt-0.5">
                            Raw score: {p.raw} / {p.total} pts
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text className={`text-xs font-bold ${
                            itemPasses(p.raw, p.total, gradeEntry) ? 'text-emerald-500' : 'text-amber-500'
                          }`}>
                            {p.you}%
                          </Text>
                          <Text className="text-ink-faint text-[9px]">
                            Avg: {p.avg != null ? `${p.avg}%` : '—'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Component Breakdown */}
                {analyticsData.compRows.length > 0 && (
                  <View className="bg-surface border border-hairline rounded-2xl p-4 mb-4">
                    <Text className="text-ink text-xs font-bold uppercase tracking-wider mb-3">
                      Component Breakdown
                    </Text>
                    <View className="space-y-3">
                      {analyticsData.compRows.map((comp, ci) => (
                        <View key={ci} className="bg-sunken/40 border border-hairline p-3 rounded-xl">
                          <View className="flex-row justify-between items-center mb-1.5">
                            <Text className="text-ink text-xs font-bold">{comp.name}</Text>
                            <View className="flex-row items-center gap-2">
                              {comp.weight != null && (
                                <Text className="text-ink-faint text-[10px]">
                                  {comp.weight}% weight
                                </Text>
                              )}
                              <Text className={`text-xs font-bold ${
                                (comp.pct ?? 0) >= (gradePolicy(gradeEntry).passing_percent)
                                  ? 'text-emerald-500'
                                  : 'text-amber-500'
                              }`}>
                                {comp.pct}%
                              </Text>
                            </View>
                          </View>
                          <View className="w-full h-2 bg-sunken rounded-full overflow-hidden">
                            <View
                              style={{ width: `${Math.min(100, Math.max(0, comp.pct ?? 0))}%` }}
                              className={`h-full ${
                                (comp.pct ?? 0) >= (gradePolicy(gradeEntry).passing_percent)
                                  ? 'bg-emerald-500'
                                  : 'bg-amber-500'
                              }`}
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* ATTENDANCE TAB CONTENT */}
        {activeTab === 'attendance' && (
          <View className="pb-10">
            <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider mt-3 mb-4">Attendance Logs</Text>
            
            {attendanceLogs.length === 0 ? (
              <View className="items-center py-10">
                <Text className="text-ink-faint text-sm">No attendance dates recorded for this class section.</Text>
              </View>
            ) : (
              attendanceLogs.map((log) => (
                <View key={log.date} className="bg-surface border border-hairline p-4 rounded-xl mb-4 mt-2 flex-row justify-between items-center">
                  <View className="flex-1 pr-3">
                    <Text className="text-ink text-sm font-semibold font-sans">{log.date}</Text>
                    {log.remarks ? (
                      <Text className="text-ink-faint text-[10px] mt-1 leading-normal">Remarks: {log.remarks}</Text>
                    ) : null}
                    {log.excuse_url ? (
                      <Text className="text-accent-text text-[10px] mt-1">📄 Excuse document attached</Text>
                    ) : null}
                  </View>

                  <View className="flex-row items-center gap-3">
                    {/* Status Badge */}
                    <View className={`px-3 py-1 rounded-full ${
                      log.status === 'present' ? 'bg-emerald-500/10 border border-emerald-500/30' :
                      log.status === 'late' ? 'bg-amber-500/10 border border-amber-500/30' :
                      log.status === 'excused' ? 'bg-accent/10 border border-accent/30' :
                      'bg-red-500/10 border border-red-500/30'
                    }`}>
                      <Text className={`text-[10px] font-bold capitalize ${
                        log.status === 'present' ? 'text-success' :
                        log.status === 'late' ? 'text-warning' :
                        log.status === 'excused' ? 'text-accent-text' :
                        'text-danger'
                      }`}>
                        {log.status}
                      </Text>
                    </View>

                    {/* Upload excuse button for absent/late logs without attached documents */}
                    {(log.status === 'absent' || log.status === 'late') && !log.excuse_url ? (
                      <TouchableOpacity
                        onPress={() => {
                          setSelectedAttendanceLog(log);
                          setAttendanceReason('');
                          setAttendanceError(null);
                        }}
                        className="bg-accent/15 border border-accent/30 px-3 py-1.5 rounded-lg"
                      >
                        <Text className="text-accent-text text-[9px] font-bold">Contest</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                </View>
              ))
            )}

            {/* Attendance contest form -- same shape as the score dispute form */}
            {selectedAttendanceLog && (
              <View className="bg-surface border border-accent/40 p-5 rounded-2xl mt-2 shadow-xl">
                <Text className="text-accent-text text-xs font-bold uppercase tracking-wider mb-1">Attendance Contest</Text>
                <Text className="text-ink text-sm font-bold mt-1 mb-2 font-sans">
                  {selectedAttendanceLog.date} · marked {selectedAttendanceLog.status}
                </Text>
                <Text className="text-ink-muted text-xs leading-normal mb-3">
                  Explain why this should be excused. Your teacher reviews it — the date
                  changes only once they approve.
                </Text>

                {attendanceError && (
                  <View className="bg-red-500/10 border border-red-500/30 p-3 rounded-xl mb-3">
                    <Text className="text-danger text-xs font-semibold leading-relaxed">
                      {attendanceError}
                    </Text>
                  </View>
                )}

                <TextInput
                  value={attendanceReason}
                  onChangeText={(text) => {
                    setAttendanceReason(text);
                    if (attendanceError) setAttendanceError(null);
                  }}
                  placeholder="Reason and any supporting detail..."
                  placeholderTextColor={c.inkFaint}
                  multiline
                  numberOfLines={4}
                  className="w-full bg-sunken border border-hairline p-3 rounded-xl text-ink text-xs mb-4"
                />

                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={handleSubmitAttendanceContest}
                    disabled={submittingAttendanceContest}
                    className="flex-1 bg-accent py-3 rounded-xl items-center"
                  >
                    {submittingAttendanceContest ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text className="text-on-accent text-xs font-bold">File Contest</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedAttendanceLog(null);
                      setAttendanceReason('');
                      setAttendanceError(null);
                    }}
                    className="flex-1 bg-canvas border border-hairline py-3 rounded-xl items-center"
                  >
                    <Text className="text-ink-soft text-xs font-bold">Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ANNOUNCEMENTS TAB CONTENT */}
        {activeTab === 'announcements' && (
          <View className="pb-10">
            <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider mt-3 mb-4">Class Bulletins</Text>
            
            {announcements.length === 0 ? (
              <View className="items-center py-10">
                <Text className="text-ink-faint text-sm">No announcements published in this class yet.</Text>
              </View>
            ) : (
              announcements.map((ann) => (
                <View key={ann.id} className="bg-surface border border-hairline p-5 rounded-2xl mb-4 mt-2">
                  <Text className="text-ink text-base font-bold font-sans">{ann.title}</Text>
                  <Text className="text-ink-muted text-xs mt-3 leading-relaxed">{ann.body}</Text>
                  
                  <View className="mt-4 pt-3 border-t border-hairline flex-row justify-between items-center">
                    <Text className="text-ink-faint text-[10px]">Math Adviser Faculty</Text>
                    <Text className="text-ink-faint text-[9px]">
                      {ann.created_at?.seconds ? new Date(ann.created_at.seconds * 1000).toLocaleDateString() : 'Active'}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
