import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../src/config/firebase';
import { StatusBar } from 'expo-status-bar';
import { errorMessage } from '../../../src/lib/api';
import { AttendancePayload, PerformancePayload } from '../../../src/lib/parent';
import {
  StudyGuide,
  loadClassAttendance,
  loadClassPerformance,
  loadClassStudyGuides,
} from '../../../src/lib/parentRecords';

/**
 * One class, from the guardian's side.
 *
 * Every tab now reads Firestore directly; this screen makes no API call. What
 * the endpoints added was a second computation of the grade and a guardian link
 * resolved from the backend's own records, which is the pair of bugs the
 * migration removed. Announcements were always read here.
 *
 * Attendance is the one that looks impossible: the class sheet is ONE document
 * holding every student's record, and a rule cannot filter inside a document.
 * It reads a per-student projection the teacher's save writes beside the sheet
 * — see src/lib/parentRecords.ts and activklass-web src/lib/attendanceMirror.js.
 *
 * The syllabus tab is gone. Parents have no read access to
 * classes/{id}/syllabus/current, so it could only ever have shown an error.
 * docs/07 §2.D specifies Grades / Attendance / AI Recommendations anyway.
 */

type Tab = 'grades' | 'attendance' | 'insights' | 'announcements';

/** Rendered when the student has switched a section off for this guardian. */
function ScopeNotice({ label }: { label: string }) {
  return (
    <View className="bg-surface border border-hairline rounded-2xl p-8 items-center mt-3">
      <Text className="text-ink-faint text-2xl mb-3">🔒</Text>
      <Text className="text-ink text-sm font-bold text-center">{label} are hidden</Text>
      <Text className="text-ink-faint text-xs text-center mt-2 leading-relaxed max-w-xs">
        Your child has turned off sharing for this section in their student portal.
      </Text>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View className="items-center py-10">
      <Text className="text-ink-faint text-sm">{text}</Text>
    </View>
  );
}

export default function ParentClassDetail() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const classId = String(params.classId ?? '');
  const studentId = String(params.studentId ?? '');
  const studentName = String(params.studentName ?? 'your child');

  const [activeTab, setActiveTab] = useState<Tab>('grades');

  const [performance, setPerformance] = useState<PerformancePayload | null>(null);
  const [attendance, setAttendance] = useState<AttendancePayload | null>(null);
  const [studyGuides, setStudyGuides] = useState<StudyGuide[]>([]);
  const [expandedGuides, setExpandedGuides] = useState<Record<string, boolean>>({});
  const [announcements, setAnnouncements] = useState<any[]>([]);

  const toggleGuide = useCallback((id: string) => {
    setExpandedGuides((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const [loading, setLoading] = useState(true);
  // Per-tab denial, so one switched-off section does not blank the whole screen.
  const [denied, setDenied] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  /* A switched-off toggle now arrives as a rules refusal rather than the API's
     scope_denied, because the scope is checked where the data is. Same notice:
     the student turned this section off, which is not an error to report. */
  const capture = useCallback((key: Tab, err: any) => {
    if (err?.code === 'permission-denied') {
      setDenied((d) => ({ ...d, [key]: true }));
      return;
    }
    setErrors((e) => ({ ...e, [key]: errorMessage(err) }));
  }, []);

  useEffect(() => {
    if (!classId || !studentId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      const results = await Promise.allSettled([
        // All three come straight from Firestore. The Flask endpoints
        // recomputed the grade from raw scores on every request, which is the
        // second implementation that drifted from the teacher's and showed a
        // passing learner as failing; and they resolved the guardian link from
        // records that never saw a link made in this app. The stored entry is
        // the one the Class Record wrote.
        loadClassPerformance(studentId, classId),
        loadClassAttendance(studentId, classId),
        loadClassStudyGuides(studentId, classId),
      ]);
      if (cancelled) return;

      const [perf, att, guides] = results;
      if (perf.status === 'fulfilled') setPerformance(perf.value);
      else capture('grades', perf.reason);

      if (att.status === 'fulfilled') setAttendance(att.value);
      else capture('attendance', att.reason);

      if (guides.status === 'fulfilled') setStudyGuides(guides.value);
      else capture('insights', guides.reason);

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [classId, studentId, capture]);

  // Announcements are low-sensitivity and readable by any signed-in user.
  useEffect(() => {
    if (!classId) return;
    const q = query(collection(db, 'announcements'), where('class_id', '==', classId));
    return onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
        setAnnouncements(list);
      },
      (err) => console.error('[ParentClassDetail] announcements:', err)
    );
  }, [classId]);

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-sunken">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <StatusBar style="auto" />

      <View className="px-6 pt-6 pb-4 border-b border-hairline bg-sunken">
        <TouchableOpacity onPress={() => router.back()} className="self-start mb-4">
          <Text className="text-ink-muted text-sm font-semibold">← Back to Dashboard</Text>
        </TouchableOpacity>

        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-accent-text text-xs font-bold uppercase tracking-wider">
              Monitoring: {studentName}
            </Text>
            <Text className="text-ink text-2xl font-black font-sans mt-1">
              {performance?.subject || 'Course Overview'}
            </Text>
            <Text className="text-ink-faint text-xs mt-1">
              Section: {performance?.section || '—'}
            </Text>
          </View>

          <View className="bg-surface border border-hairline px-3 py-1.5 rounded-xl">
            <Text className="text-accent-text text-[10px] font-bold uppercase">Read-Only Access</Text>
          </View>
        </View>
      </View>

      <View className="flex-row bg-surface border-b border-hairline">
        {(['grades', 'attendance', 'insights', 'announcements'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            className={`flex-1 py-4 items-center ${activeTab === tab ? 'border-b-2 border-accent' : ''}`}
          >
            <Text
              className={`text-xs font-bold capitalize ${activeTab === tab ? 'text-accent-text' : 'text-ink-faint'}`}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView className="flex-1 px-6 py-4">
        {/* GRADES */}
        {activeTab === 'grades' &&
          (denied.grades ? (
            <ScopeNotice label="Grades" />
          ) : errors.grades ? (
            <Empty text={errors.grades} />
          ) : (
            <View className="pb-10">
              <View className="bg-surface border border-hairline p-5 rounded-2xl flex-row justify-between items-center mt-3 mb-6">
                <View>
                  <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider">
                    Term Mark Average
                  </Text>
                  <Text className="text-ink text-3xl font-extrabold mt-1 font-sans">
                    {performance?.final_grade ?? '—'}
                  </Text>
                </View>
                {performance?.final_grade != null && (
                  <View
                    className={`px-4 py-2 rounded-xl ${
                      performance.grading_mode === 'ched_point'
                        ? performance.final_grade <= 3.0
                          ? 'bg-success/10'
                          : 'bg-red-600/10'
                        : performance.final_grade >= 75
                          ? 'bg-success/10'
                          : 'bg-red-600/10'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold uppercase ${
                        performance.grading_mode === 'ched_point'
                          ? performance.final_grade <= 3.0
                            ? 'text-success'
                            : 'text-danger'
                          : performance.final_grade >= 75
                            ? 'text-success'
                            : 'text-danger'
                      }`}
                    >
                      {performance.grading_mode === 'ched_point'
                        ? performance.final_grade <= 3.0
                          ? 'Passing'
                          : 'Failing'
                        : performance.final_grade >= 75
                          ? 'Passing'
                          : 'Failing'}
                    </Text>
                  </View>
                )}
              </View>

              {(performance?.periods?.length ?? 0) > 0 && (
                <View className="mb-6">
                  <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider mb-3">
                    Grading Periods
                  </Text>
                  {performance!.periods.map((p) => (
                    <View
                      key={p.id}
                      className="bg-surface border border-hairline px-4 py-3 rounded-xl mb-2 flex-row justify-between items-center"
                    >
                      <Text className="text-ink-soft text-xs font-semibold">{p.name ?? '—'}</Text>
                      <Text className="text-ink text-sm font-bold">{p.grade ?? '—'}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider mb-4">
                Graded Assessments
              </Text>

              {(performance?.assessments?.length ?? 0) === 0 ? (
                <Empty text="No graded entries found in class record." />
              ) : (
                performance!.assessments.map((asm, i) => {
                  const ratio =
                    asm.student_score != null && asm.total_points > 0
                      ? asm.student_score / asm.total_points
                      : null;
                  return (
                    <View
                      key={`${asm.title ?? 'item'}-${i}`}
                      className="bg-surface border border-hairline p-4 rounded-xl mb-4 mt-2"
                    >
                      <View className="flex-row justify-between items-start">
                        <View className="flex-1">
                          <Text className="text-ink-faint text-[9px] font-bold uppercase tracking-wider">
                            {asm.component ?? 'Ungrouped'}
                            {asm.period ? ` · ${asm.period}` : ''}
                          </Text>
                          <Text className="text-ink text-sm font-bold mt-1 font-sans">
                            {asm.title ?? 'Untitled'}
                          </Text>
                          <Text className="text-ink-muted text-xs mt-2 font-mono">
                            Score:{' '}
                            <Text className="text-ink font-bold">{asm.student_score ?? '—'}</Text>{' '}
                            / {asm.total_points}
                          </Text>
                          <Text className="text-ink-faint text-[10px] mt-1">
                            Class Average: {asm.class_average ?? '—'}
                          </Text>
                        </View>
                      </View>

                      {ratio != null && (
                        <View className="w-full h-1.5 bg-sunken rounded-full mt-3 overflow-hidden">
                          <View
                            style={{ width: `${Math.min(100, ratio * 100)}%` }}
                            className={`h-full ${ratio >= 0.75 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                          />
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          ))}

        {/* ATTENDANCE */}
        {activeTab === 'attendance' &&
          (denied.attendance ? (
            <ScopeNotice label="Attendance records" />
          ) : errors.attendance ? (
            <Empty text={errors.attendance} />
          ) : (
            <View className="pb-10">
              {attendance?.attendance_rate != null && (
                <View className="bg-surface border border-hairline p-5 rounded-2xl flex-row justify-between items-center mt-3">
                  <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider">
                    Attendance Rate
                  </Text>
                  <Text className="text-ink text-2xl font-extrabold">
                    {attendance.attendance_rate}%
                  </Text>
                </View>
              )}

              <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider mt-6 mb-4">
                Class Attendance Logs
              </Text>

              {(attendance?.attendance_logs?.length ?? 0) === 0 ? (
                <Empty text="No attendance dates recorded." />
              ) : (
                attendance!.attendance_logs.map((log) => (
                  <View
                    key={log.date}
                    className="bg-surface border border-hairline p-4 rounded-xl mb-4 mt-2 flex-row justify-between items-center"
                  >
                    <View className="flex-1 pr-3">
                      <Text className="text-ink text-sm font-semibold font-sans">{log.date}</Text>
                      {log.remarks ? (
                        <Text className="text-ink-faint text-[10px] mt-1 leading-normal">
                          Remarks: {log.remarks}
                        </Text>
                      ) : null}
                      {log.excuse_url ? (
                        <Text className="text-accent-text text-[10px] mt-1">
                          📄 Excuse document attached
                        </Text>
                      ) : null}
                    </View>

                    <View
                      className={`px-3 py-1 rounded-full ${
                        log.status === 'present'
                          ? 'bg-emerald-500/10 border border-emerald-500/30'
                          : log.status === 'late'
                            ? 'bg-amber-500/10 border border-amber-500/30'
                            : log.status === 'excused'
                              ? 'bg-accent/10 border border-accent/30'
                              : 'bg-red-500/10 border border-red-500/30'
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-bold capitalize ${
                          log.status === 'present'
                            ? 'text-success'
                            : log.status === 'late'
                              ? 'text-warning'
                              : log.status === 'excused'
                                ? 'text-accent-text'
                                : 'text-danger'
                        }`}
                      >
                        {log.status}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          ))}

        {/* INSIGHTS (AI Recommendations) */}
        {activeTab === 'insights' &&
          (denied.insights ? (
            <ScopeNotice label="Subject analytics" />
          ) : errors.insights ? (
            <Empty text={errors.insights} />
          ) : (
            <View className="pb-10">
              <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider mt-3 mb-4">
                Study Guides For This Class
              </Text>

              {studyGuides.length === 0 ? (
                <Empty text="No study guides assigned for this class." />
              ) : (
                studyGuides.map((r) => {
                  const isExpanded = Boolean(expandedGuides[r.id]);
                  return (
                    <View
                      key={r.id}
                      className="bg-surface border border-hairline rounded-2xl mb-4 mt-2 overflow-hidden"
                    >
                      <TouchableOpacity
                        onPress={() => toggleGuide(r.id)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Study guide ${r.topic ?? r.title ?? 'details'}`}
                        className="p-5 flex-row items-center justify-between"
                      >
                        <View className="flex-1 pr-3">
                          <View className="flex-row items-center">
                            <Text className="text-accent-text text-[10px] font-bold uppercase tracking-wider">
                              {r.status ?? 'assigned'}
                            </Text>
                            {r.created_at ? (
                              <Text className="text-ink-faint text-[10px] ml-2">
                                • Assigned {r.created_at}
                              </Text>
                            ) : null}
                          </View>
                          <Text className="text-ink text-base font-bold font-sans mt-1">
                            {r.topic ?? r.title ?? 'Study guide'}
                          </Text>
                        </View>
                        <View className="w-8 h-8 rounded-full bg-sunken items-center justify-center border border-hairline">
                          <Text className="text-ink-muted text-xs font-bold">
                            {isExpanded ? '▲' : '▼'}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {isExpanded && (
                        <View className="px-5 pb-5 pt-1 border-t border-hairline/60">
                          {/* Teacher Guidance / Instructions */}
                          {r.guidance ? (
                            <View className="bg-accent/10 border border-accent/20 p-3.5 rounded-xl mt-3">
                              <Text className="text-accent-text text-xs font-bold uppercase tracking-wider mb-1">
                                📝 Teacher Guidance
                              </Text>
                              <Text className="text-ink text-xs leading-relaxed">
                                {r.guidance}
                              </Text>
                            </View>
                          ) : null}

                          {/* Identified Weakness / Learning Gap */}
                          {r.weakness_description ? (
                            <View className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-xl mt-3">
                              <Text className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
                                🎯 Focus Area
                              </Text>
                              <Text className="text-ink text-xs leading-relaxed">
                                {r.weakness_description}
                              </Text>
                            </View>
                          ) : null}

                          {/* Study Guide Content / Notes */}
                          {r.study_guide_markdown ? (
                            <View className="mt-3">
                              <Text className="text-ink-soft text-xs font-bold uppercase tracking-wider mb-1">
                                📖 Study Notes
                              </Text>
                              <Text className="text-ink-muted text-xs leading-relaxed">
                                {r.study_guide_markdown}
                              </Text>
                            </View>
                          ) : null}

                          {/* Recommended Materials */}
                          {r.recommended_materials && r.recommended_materials.length > 0 ? (
                            <View className="mt-3">
                              <Text className="text-ink-soft text-xs font-bold uppercase tracking-wider mb-1.5">
                                📚 Recommended Learning Materials
                              </Text>
                              {r.recommended_materials.map((mat, idx) => (
                                <View
                                  key={idx}
                                  className="bg-sunken p-2.5 rounded-lg border border-hairline mt-1"
                                >
                                  <Text className="text-ink text-xs font-semibold">
                                    {typeof mat === 'string' ? mat : mat.title || mat.name || JSON.stringify(mat)}
                                  </Text>
                                  {mat.url ? (
                                    <TouchableOpacity onPress={() => Linking.openURL(mat.url)}>
                                      <Text className="text-accent-text text-[11px] mt-0.5 underline" numberOfLines={1}>
                                        {mat.url}
                                      </Text>
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              ))}
                            </View>
                          ) : null}

                          {/* Fallback description if only topic/status exist */}
                          {!r.guidance &&
                            !r.weakness_description &&
                            !r.study_guide_markdown &&
                            (!r.recommended_materials || r.recommended_materials.length === 0) && (
                              <View className="mt-2 py-2">
                                <Text className="text-ink-muted text-xs leading-relaxed">
                                  This study guide was assigned by the subject teacher to help reinforce key concepts in this topic. Students can access dedicated review modules and mastery quizzes on their student portal.
                                </Text>
                              </View>
                            )}

                          <View className="mt-4 pt-3 border-t border-hairline/40 flex-row justify-between items-center">
                            <Text className="text-ink-faint text-[10px]">Status: {r.status ?? 'Active'}</Text>
                            <TouchableOpacity onPress={() => toggleGuide(r.id)}>
                              <Text className="text-accent-text text-xs font-semibold">Collapse Details ▲</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          ))}

        {/* ANNOUNCEMENTS */}
        {activeTab === 'announcements' && (
          <View className="pb-10">
            <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider mt-3 mb-4">
              Class Bulletins
            </Text>

            {announcements.length === 0 ? (
              <Empty text="No announcements published." />
            ) : (
              announcements.map((ann) => (
                <View
                  key={ann.id}
                  className="bg-surface border border-hairline p-5 rounded-2xl mb-4 mt-2"
                >
                  <Text className="text-ink text-base font-bold font-sans">{ann.title}</Text>
                  <Text className="text-ink-muted text-xs mt-3 leading-relaxed">{ann.body}</Text>

                  <View className="mt-4 pt-3 border-t border-hairline flex-row justify-between items-center">
                    <Text className="text-ink-faint text-[10px]">Course Instructor</Text>
                    <Text className="text-ink-faint text-[9px]">
                      {ann.created_at?.seconds
                        ? new Date(ann.created_at.seconds * 1000).toLocaleDateString()
                        : 'Active'}
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
