import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, collection, query, where, getDocs, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../../src/config/firebase';
import { useAuth } from '../../../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { useThemeColors } from '../../../src/theme';

export default function StudentClassDetail() {
  const c = useThemeColors();
  const router = useRouter();
  const { classId } = useLocalSearchParams();
  const { profile } = useAuth();
  
  const [classInfo, setClassInfo] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'syllabus' | 'grades' | 'attendance' | 'announcements'>('syllabus');
  const [loading, setLoading] = useState(true);

  // Syllabus / Topics State
  const [syllabus, setSyllabus] = useState<any>(null);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  
  // Grades / Grade Center State
  const [gradeEntry, setGradeEntry] = useState<any>(null);
  const [showContestModal, setShowContestModal] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<any>(null);
  const [contestReason, setContestReason] = useState('');
  const [submittingContest, setSubmittingContest] = useState(false);

  // Attendance State
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [selectedAttendanceLog, setSelectedAttendanceLog] = useState<any>(null);
  const [attendanceReason, setAttendanceReason] = useState('');
  const [submittingAttendanceContest, setSubmittingAttendanceContest] = useState(false);

  // Announcements State
  const [announcements, setAnnouncements] = useState<any[]>([]);

  useEffect(() => {
    if (!classId) return;
    const user = auth.currentUser;
    if (!user) return;

    // 1. Fetch Class Header Info
    const unsubscribeClass = onSnapshot(doc(db, 'classes', classId as string), (docSnap) => {
      if (docSnap.exists()) {
        setClassInfo(docSnap.data());
      }
    });

    // 2. Fetch Syllabus Info
    const unsubscribeSyllabus = onSnapshot(doc(db, 'classes', classId as string, 'syllabus', 'current'), (docSnap) => {
      if (docSnap.exists()) {
        setSyllabus(docSnap.data());
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

    // 5. Fetch Daily Attendance Logs
    const attendanceQuery = query(
      collection(db, 'classes', classId as string, 'attendance')
    );
    const unsubscribeAttendance = onSnapshot(attendanceQuery, (snapshot) => {
      const list = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        const studentRecord = data.records?.[user.uid] || data.status?.[user.uid] || {};
        return {
          date: docSnap.id,
          status: studentRecord.status || 'absent',
          remarks: studentRecord.remarks || '',
          excuse_url: studentRecord.excuse_url || null,
        };
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
    if (!contestReason.trim() || !selectedAssessment) return;
    const user = auth.currentUser;
    if (!user) return;

    setSubmittingContest(true);
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
        reason: contestReason.trim(),
        excuse_url: null,
        // The rules check this literal on create -- a student may only ever
        // open a dispute, never pre-resolve one.
        status: 'pending',
        created_at: serverTimestamp(),
      });

      Alert.alert('Success', 'Your grade dispute has been submitted directly to your teacher\'s portal.');
      setShowContestModal(false);
      setContestReason('');
      setSelectedAssessment(null);
    } catch (e) {
      console.error('Error submitting grade contest:', e);
      Alert.alert(
        'Not submitted',
        'Your grade dispute could not be filed. Check your connection and try again.',
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
    if (!attendanceReason.trim() || !selectedAttendanceLog) return;
    const user = auth.currentUser;
    if (!user) return;

    setSubmittingAttendanceContest(true);
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
        reason: attendanceReason.trim(),
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
    } catch (e) {
      console.error('Error filing attendance contest:', e);
      Alert.alert(
        'Not submitted',
        'Your attendance contest could not be filed. Check your connection and try again.',
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
      <View className="flex-row bg-surface border-b border-hairline">
        {(['syllabus', 'grades', 'attendance', 'announcements'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            className={`flex-1 py-4 items-center ${activeTab === tab ? 'border-b-2 border-accent' : ''}`}
          >
            <Text className={`text-xs font-bold capitalize ${activeTab === tab ? 'text-accent-text' : 'text-ink-faint'}`}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
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
                  {gradeEntry?.final_grade ?? '—'}
                </Text>
              </View>
              <View className="bg-success/10 px-4 py-2 rounded-xl">
                <Text className="text-success text-xs font-bold uppercase">Passing</Text>
              </View>
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
                        setShowContestModal(true);
                      }}
                      className="bg-sunken border border-hairline px-3 py-1.5 rounded-lg"
                    >
                      <Text className="text-ink-soft text-[10px] font-bold">Contest</Text>
                    </TouchableOpacity>
                  </View>
                  
                  {/* Simple Custom Bar Visualizer */}
                  {asm.raw_score !== undefined && (
                    <View className="w-full h-2 bg-sunken rounded-full mt-3 overflow-hidden">
                      <View 
                        style={{ width: `${Math.min(100, (asm.raw_score / asm.total_points) * 100)}%` }}
                        className={`h-full ${asm.raw_score / asm.total_points >= 0.75 ? 'bg-emerald-500' : 'bg-amber-500'}`}
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
                <Text className="text-ink-muted text-xs leading-normal mb-4">
                  Provide your teacher with details regarding the score discrepancy.
                </Text>
                
                <TextInput
                  value={contestReason}
                  onChangeText={setContestReason}
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
                <Text className="text-ink-muted text-xs leading-normal mb-4">
                  Explain why this should be excused. Your teacher reviews it — the date
                  changes only once they approve.
                </Text>

                <TextInput
                  value={attendanceReason}
                  onChangeText={setAttendanceReason}
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
