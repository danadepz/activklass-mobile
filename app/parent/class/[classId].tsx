import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../src/config/firebase';
import { StatusBar } from 'expo-status-bar';
import { ApiError, errorMessage } from '../../../src/lib/api';
import {
  AnalyticsPayload,
  AttendancePayload,
  PerformancePayload,
  getAnalytics,
  getClassAttendance,
  getClassPerformance,
} from '../../../src/lib/parent';

/**
 * One class, from the guardian's side.
 *
 * Grades, attendance and insights come from the Flask API — attendance in
 * particular CANNOT come from Firestore, because the attendance document holds
 * every student's record and a security rule cannot filter inside a document.
 *
 * Announcements stay on Firestore: that collection is readable by any signed-in
 * user by design (see firestore.rules, announcements).
 *
 * The syllabus tab is gone. Parents have no read access to
 * classes/{id}/syllabus/current, so it could only ever have shown an error.
 * docs/07 §2.D specifies Grades / Attendance / AI Recommendations anyway.
 */

type Tab = 'grades' | 'attendance' | 'insights' | 'announcements';

/** Rendered when the student has switched a section off for this guardian. */
function ScopeNotice({ label }: { label: string }) {
  return (
    <View className="bg-slate-900 border border-slate-850 rounded-2xl p-8 items-center mt-3">
      <Text className="text-slate-500 text-2xl mb-3">🔒</Text>
      <Text className="text-white text-sm font-bold text-center">{label} are hidden</Text>
      <Text className="text-slate-500 text-xs text-center mt-2 leading-relaxed max-w-xs">
        Your child has turned off sharing for this section in their student portal.
      </Text>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View className="items-center py-10">
      <Text className="text-slate-500 text-sm">{text}</Text>
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
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  // Per-tab denial, so one switched-off section does not blank the whole screen.
  const [denied, setDenied] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const capture = useCallback((key: Tab, err: unknown) => {
    if (err instanceof ApiError && err.code === 'scope_denied') {
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
        getClassPerformance(studentId, classId),
        getClassAttendance(studentId, classId),
        getAnalytics(studentId),
      ]);
      if (cancelled) return;

      const [perf, att, ana] = results;
      if (perf.status === 'fulfilled') setPerformance(perf.value);
      else capture('grades', perf.reason);

      if (att.status === 'fulfilled') setAttendance(att.value);
      else capture('attendance', att.reason);

      if (ana.status === 'fulfilled') setAnalytics(ana.value);
      else capture('insights', ana.reason);

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
      <View className="flex-1 justify-center items-center bg-slate-950">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const classRemediations = (analytics?.remediations ?? []).filter(
    (r) => r.class_id === classId
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />

      <View className="px-6 pt-6 pb-4 border-b border-slate-900 bg-slate-950">
        <TouchableOpacity onPress={() => router.back()} className="self-start mb-4">
          <Text className="text-slate-400 text-sm font-semibold">← Back to Dashboard</Text>
        </TouchableOpacity>

        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-indigo-400 text-xs font-bold uppercase tracking-wider">
              Monitoring: {studentName}
            </Text>
            <Text className="text-white text-2xl font-black font-sans mt-1">
              {performance?.subject || 'Course Overview'}
            </Text>
            <Text className="text-slate-500 text-xs mt-1">
              Section: {performance?.section || '—'}
            </Text>
          </View>

          <View className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
            <Text className="text-indigo-400 text-[10px] font-bold uppercase">Read-Only Access</Text>
          </View>
        </View>
      </View>

      <View className="flex-row bg-slate-900 border-b border-slate-800">
        {(['grades', 'attendance', 'insights', 'announcements'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            className={`flex-1 py-4 items-center ${activeTab === tab ? 'border-b-2 border-indigo-500' : ''}`}
          >
            <Text
              className={`text-xs font-bold capitalize ${activeTab === tab ? 'text-indigo-400' : 'text-slate-500'}`}
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
              <View className="bg-slate-900 border border-slate-850 p-5 rounded-2xl flex-row justify-between items-center mt-3 mb-6">
                <View>
                  <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                    Term Mark Average
                  </Text>
                  <Text className="text-white text-3xl font-extrabold mt-1 font-sans">
                    {performance?.final_grade ?? '—'}
                  </Text>
                </View>
                {performance?.final_grade != null && (
                  <View
                    className={`px-4 py-2 rounded-xl ${
                      performance.grading_mode === 'ched_point'
                        ? performance.final_grade <= 3.0
                          ? 'bg-emerald-600/10'
                          : 'bg-red-600/10'
                        : performance.final_grade >= 75
                          ? 'bg-emerald-600/10'
                          : 'bg-red-600/10'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold uppercase ${
                        performance.grading_mode === 'ched_point'
                          ? performance.final_grade <= 3.0
                            ? 'text-emerald-400'
                            : 'text-red-400'
                          : performance.final_grade >= 75
                            ? 'text-emerald-400'
                            : 'text-red-400'
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
                  <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">
                    Grading Periods
                  </Text>
                  {performance!.periods.map((p) => (
                    <View
                      key={p.id}
                      className="bg-slate-900 border border-slate-850 px-4 py-3 rounded-xl mb-2 flex-row justify-between items-center"
                    >
                      <Text className="text-slate-300 text-xs font-semibold">{p.name ?? '—'}</Text>
                      <Text className="text-white text-sm font-bold">{p.grade ?? '—'}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">
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
                      className="bg-slate-900 border border-slate-850 p-4 rounded-xl mb-4 mt-2"
                    >
                      <View className="flex-row justify-between items-start">
                        <View className="flex-1">
                          <Text className="text-slate-500 text-[9px] font-bold uppercase tracking-wider">
                            {asm.component ?? 'Ungrouped'}
                            {asm.period ? ` · ${asm.period}` : ''}
                          </Text>
                          <Text className="text-white text-sm font-bold mt-1 font-sans">
                            {asm.title ?? 'Untitled'}
                          </Text>
                          <Text className="text-slate-400 text-xs mt-2 font-mono">
                            Score:{' '}
                            <Text className="text-white font-bold">{asm.student_score ?? '—'}</Text>{' '}
                            / {asm.total_points}
                          </Text>
                          <Text className="text-slate-500 text-[10px] mt-1">
                            Class Average: {asm.class_average ?? '—'}
                          </Text>
                        </View>
                      </View>

                      {ratio != null && (
                        <View className="w-full h-1.5 bg-slate-950 rounded-full mt-3 overflow-hidden">
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
                <View className="bg-slate-900 border border-slate-850 p-5 rounded-2xl flex-row justify-between items-center mt-3">
                  <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                    Attendance Rate
                  </Text>
                  <Text className="text-white text-2xl font-extrabold">
                    {attendance.attendance_rate}%
                  </Text>
                </View>
              )}

              <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-6 mb-4">
                Class Attendance Logs
              </Text>

              {(attendance?.attendance_logs?.length ?? 0) === 0 ? (
                <Empty text="No attendance dates recorded." />
              ) : (
                attendance!.attendance_logs.map((log) => (
                  <View
                    key={log.date}
                    className="bg-slate-900 border border-slate-850 p-4 rounded-xl mb-4 mt-2 flex-row justify-between items-center"
                  >
                    <View className="flex-1 pr-3">
                      <Text className="text-white text-sm font-semibold font-sans">{log.date}</Text>
                      {log.remarks ? (
                        <Text className="text-slate-500 text-[10px] mt-1 leading-normal">
                          Remarks: {log.remarks}
                        </Text>
                      ) : null}
                      {log.excuse_url ? (
                        <Text className="text-indigo-400 text-[10px] mt-1">
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
                              ? 'bg-indigo-500/10 border border-indigo-500/30'
                              : 'bg-red-500/10 border border-red-500/30'
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-bold capitalize ${
                          log.status === 'present'
                            ? 'text-emerald-400'
                            : log.status === 'late'
                              ? 'text-amber-400'
                              : log.status === 'excused'
                                ? 'text-indigo-400'
                                : 'text-red-400'
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
              <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-3 mb-4">
                Study Guides For This Class
              </Text>

              {classRemediations.length === 0 ? (
                <Empty text="No study guides assigned for this class." />
              ) : (
                classRemediations.map((r) => (
                  <View
                    key={r.id}
                    className="bg-slate-900 border border-slate-850 p-5 rounded-2xl mb-4 mt-2"
                  >
                    <Text className="text-indigo-400 text-[10px] font-bold uppercase tracking-wider">
                      {r.status ?? 'assigned'}
                    </Text>
                    <Text className="text-white text-base font-bold font-sans mt-1">
                      {r.topic ?? 'Study guide'}
                    </Text>
                    {r.created_at ? (
                      <Text className="text-slate-500 text-[10px] mt-2">Assigned {r.created_at}</Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          ))}

        {/* ANNOUNCEMENTS */}
        {activeTab === 'announcements' && (
          <View className="pb-10">
            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-3 mb-4">
              Class Bulletins
            </Text>

            {announcements.length === 0 ? (
              <Empty text="No announcements published." />
            ) : (
              announcements.map((ann) => (
                <View
                  key={ann.id}
                  className="bg-slate-900 border border-slate-850 p-5 rounded-2xl mb-4 mt-2"
                >
                  <Text className="text-white text-base font-bold font-sans">{ann.title}</Text>
                  <Text className="text-slate-400 text-xs mt-3 leading-relaxed">{ann.body}</Text>

                  <View className="mt-4 pt-3 border-t border-slate-850 flex-row justify-between items-center">
                    <Text className="text-slate-500 text-[10px]">Course Instructor</Text>
                    <Text className="text-slate-600 text-[9px]">
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
