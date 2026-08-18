import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../../src/config/firebase';
import { StatusBar } from 'expo-status-bar';

export default function ParentClassDetail() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { classId, studentId, studentName } = params;
  
  const [classInfo, setClassInfo] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'syllabus' | 'grades' | 'attendance' | 'announcements'>('grades'); // Default parents to Grades tab!
  const [loading, setLoading] = useState(true);

  // Read-only state components
  const [syllabus, setSyllabus] = useState<any>(null);
  const [gradeEntry, setGradeEntry] = useState<any>(null);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);

  useEffect(() => {
    if (!classId || !studentId) return;

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

    // 3. Fetch Gradebook Entry for the child
    const unsubscribeGrades = onSnapshot(doc(db, 'gradebooks', classId as string, 'entries', studentId as string), (docSnap) => {
      if (docSnap.exists()) {
        setGradeEntry(docSnap.data());
      }
    });

    // 4. Fetch Daily Attendance Logs for the child
    const attendanceQuery = query(collection(db, 'classes', classId as string, 'attendance'));
    const unsubscribeAttendance = onSnapshot(attendanceQuery, (snapshot) => {
      const list = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        const studentRecord = data.records?.[studentId as string] || data.status?.[studentId as string] || {};
        return {
          date: docSnap.id,
          status: studentRecord.status || 'absent',
          remarks: studentRecord.remarks || '',
          excuse_url: studentRecord.excuse_url || null,
        };
      });
      list.sort((a, b) => b.date.localeCompare(a.date));
      setAttendanceLogs(list);
    });

    // 5. Fetch Class Announcements
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
      unsubscribeGrades();
      unsubscribeAttendance();
      unsubscribeAnnouncements();
    };
  }, [classId, studentId]);

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-950">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />
      
      {/* Read-Only Dynamic Header */}
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
              {classInfo?.subject || 'Course Overview'}
            </Text>
            <Text className="text-slate-500 text-xs mt-1">Section: {classInfo?.section || '—'}</Text>
          </View>
          
          <View className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
            <Text className="text-indigo-400 text-[10px] font-bold uppercase">Read-Only Access</Text>
          </View>
        </View>
      </View>

      {/* Segmented Controls tab bar */}
      <View className="flex-row bg-slate-900 border-b border-slate-800">
        {(['grades', 'attendance', 'syllabus', 'announcements'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            className={`flex-1 py-4 items-center ${activeTab === tab ? 'border-b-2 border-indigo-500' : ''}`}
          >
            <Text className={`text-xs font-bold capitalize ${activeTab === tab ? 'text-indigo-400' : 'text-slate-500'}`}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView className="flex-1 px-6 py-4">
        
        {/* GRADES TAB CONTENT */}
        {activeTab === 'grades' && (
          <View className="pb-10">
            {/* GPA overview */}
            <View className="bg-slate-900 border border-slate-850 p-5 rounded-2xl flex-row justify-between items-center mt-3 mb-6">
              <View>
                <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">Term Mark Average</Text>
                <Text className="text-white text-3xl font-extrabold mt-1 font-sans">
                  {gradeEntry?.final_grade ?? '—'}
                </Text>
              </View>
              <View className="bg-emerald-600/10 px-4 py-2 rounded-xl">
                <Text className="text-emerald-400 text-xs font-bold uppercase">Passing</Text>
              </View>
            </View>

            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">Graded Assessments</Text>

            {gradeEntry?.assessments ? (
              gradeEntry.assessments.map((asm: any) => (
                <View key={asm.id} className="bg-slate-900 border border-slate-850 p-4 rounded-xl mb-4 mt-2">
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1">
                      <Text className="text-slate-500 text-[9px] font-bold uppercase tracking-wider">{asm.component_id || asm.component}</Text>
                      <Text className="text-white text-sm font-bold mt-1 font-sans">{asm.title}</Text>
                      <Text className="text-slate-400 text-xs mt-2 font-mono">
                        Score: <Text className="text-white font-bold">{asm.raw_score ?? '—'}</Text> / {asm.total_points}
                      </Text>
                      <Text className="text-slate-500 text-[10px] mt-1">Class Average: {asm.class_average ?? '—'}</Text>
                    </View>
                  </View>
                  
                  {/* Progress bar visualizer */}
                  {asm.raw_score !== undefined && (
                    <View className="w-full h-1.5 bg-slate-950 rounded-full mt-3 overflow-hidden">
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
                <Text className="text-slate-500 text-sm">No graded entries found in class record.</Text>
              </View>
            )}
          </View>
        )}

        {/* ATTENDANCE TAB CONTENT */}
        {activeTab === 'attendance' && (
          <View className="pb-10">
            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-3 mb-4">Class Attendance Logs</Text>
            
            {attendanceLogs.length === 0 ? (
              <View className="items-center py-10">
                <Text className="text-slate-500 text-sm">No attendance dates recorded.</Text>
              </View>
            ) : (
              attendanceLogs.map((log) => (
                <View key={log.date} className="bg-slate-900 border border-slate-850 p-4 rounded-xl mb-4 mt-2 flex-row justify-between items-center">
                  <View className="flex-1 pr-3">
                    <Text className="text-white text-sm font-semibold font-sans">{log.date}</Text>
                    {log.remarks ? (
                      <Text className="text-slate-500 text-[10px] mt-1 leading-normal">Remarks: {log.remarks}</Text>
                    ) : null}
                    {log.excuse_url ? (
                      <Text className="text-indigo-400 text-[10px] mt-1">📄 Excuse document attached</Text>
                    ) : null}
                  </View>

                  <View className={`px-3 py-1 rounded-full ${
                    log.status === 'present' ? 'bg-emerald-500/10 border border-emerald-500/30' :
                    log.status === 'late' ? 'bg-amber-500/10 border border-amber-500/30' :
                    log.status === 'excused' ? 'bg-indigo-500/10 border border-indigo-500/30' :
                    'bg-red-500/10 border border-red-500/30'
                  }`}>
                    <Text className={`text-[10px] font-bold capitalize ${
                      log.status === 'present' ? 'text-emerald-400' :
                      log.status === 'late' ? 'text-amber-400' :
                      log.status === 'excused' ? 'text-indigo-400' :
                      'text-red-400'
                    }`}>
                      {log.status}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* SYLLABUS TAB CONTENT */}
        {activeTab === 'syllabus' && (
          <View className="pb-10">
            {syllabus?.modules ? (
              syllabus.modules.map((mod: any) => (
                <View key={mod.id} className="bg-slate-900 border border-slate-850 rounded-2xl p-5 mb-5 mt-3">
                  <Text className="text-indigo-400 text-[10px] font-bold uppercase tracking-wider">Module {mod.id}</Text>
                  <Text className="text-white text-base font-bold font-sans mt-1">{mod.title}</Text>
                  <Text className="text-slate-400 text-xs mt-2 leading-relaxed">{mod.description}</Text>
                  
                  {/* Topic breakdown */}
                  <View className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                    {mod.topics?.map((topic: any) => (
                      <View key={topic.id} className="bg-slate-950/40 p-3 rounded-xl border border-slate-850">
                        <Text className="text-slate-300 text-xs font-semibold">📍 {topic.title}</Text>
                        <View className="mt-2 pl-4">
                          {topic.learning_objectives?.map((obj: string, i: number) => (
                            <Text key={i} className="text-slate-500 text-[10px] mt-1 leading-normal">• {obj}</Text>
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            ) : (
              <View className="items-center py-10">
                <Text className="text-slate-500 text-sm">No syllabus structure uploaded.</Text>
              </View>
            )}
          </View>
        )}

        {/* ANNOUNCEMENTS TAB CONTENT */}
        {activeTab === 'announcements' && (
          <View className="pb-10">
            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-3 mb-4">Class Bulletins</Text>
            
            {announcements.length === 0 ? (
              <View className="items-center py-10">
                <Text className="text-slate-500 text-sm">No announcements published.</Text>
              </View>
            ) : (
              announcements.map((ann) => (
                <View key={ann.id} className="bg-slate-900 border border-slate-850 p-5 rounded-2xl mb-4 mt-2">
                  <Text className="text-white text-base font-bold font-sans">{ann.title}</Text>
                  <Text className="text-slate-400 text-xs mt-3 leading-relaxed">{ann.body}</Text>
                  
                  <View className="mt-4 pt-3 border-t border-slate-850 flex-row justify-between items-center">
                    <Text className="text-slate-500 text-[10px]">Course Instructor</Text>
                    <Text className="text-slate-600 text-[9px]">
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
