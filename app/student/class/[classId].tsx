import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, SafeAreaView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../../../src/config/firebase';
import { useAuth } from '../../../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';

export default function StudentClassDetail() {
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
  const [uploadingExcuse, setUploadingExcuse] = useState(false);
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState<string | null>(null);

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

    // 3. Fetch Published Quizzes for this Class
    const quizzesQuery = query(
      collection(db, 'quizzes'),
      where('class_id', '==', classId),
      where('status', '==', 'published')
    );
    const unsubscribeQuizzes = onSnapshot(quizzesQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setQuizzes(list);
    });

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
      unsubscribeQuizzes();
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
      const disputeId = `disp-${classId}-${selectedAssessment.id}-${user.uid}`;
      await setDoc(doc(db, 'disputes', disputeId), {
        id: disputeId,
        student_id: user.uid,
        student_name: `${profile?.first_name} ${profile?.last_name}`,
        class_id: classId,
        assessment_id: selectedAssessment.id,
        assessment_title: selectedAssessment.title,
        current_score: selectedAssessment.raw_score,
        justification: contestReason.trim(),
        status: 'pending',
        teacher_decision: 'Pending',
        created_at: serverTimestamp(),
      });

      Alert.alert('Success', 'Your grade dispute has been submitted directly to your teacher\'s portal.');
      setShowContestModal(false);
      setContestReason('');
      setSelectedAssessment(null);
    } catch (e) {
      console.error('Error submitting dispute:', e);
      Alert.alert('Error', 'Failed to submit grade dispute. Check credentials and rules.');
    } finally {
      setSubmittingContest(false);
    }
  };

  // Mock Uploading excuse document (we use a simple prompt since full device photo files are mock in simulation)
  const handleTriggerExcuseUpload = (date: string) => {
    setSelectedAttendanceDate(date);
    
    Alert.prompt(
      "Attach Excuse Document",
      "Enter a mock certificate URL or description note to upload as your justification.",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Upload",
          onPress: async (text?: string) => {
            if (!text || !auth.currentUser) return;
            setUploadingExcuse(true);
            try {
              const dummyUrl = `https://firebasestorage.googleapis.com/v0/b/demo-activklass/o/excuses%2F${date}.pdf?alt=media`;
              
              // In Firestore emulator structure, update key matching status.{uid}
              const docRef = doc(db, 'classes', classId as string, 'attendance', date);
              
              // Get current document data to preserve other student statuses
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                const currentData = docSnap.data();
                const records = currentData.records || currentData.status || {};
                
                records[auth.currentUser.uid] = {
                  status: 'excused',
                  remarks: `Justification: ${text}`,
                  excuse_url: dummyUrl
                };

                // Save back to Firestore
                await updateDoc(docRef, {
                  records: records,
                  status: records // Handle both naming schema variants in rules/db
                });
                
                Alert.alert("Excuse Uploaded", "Your attendance mark has been updated to Excused.");
              }
            } catch (err) {
              console.error('Error uploading excuse letter:', err);
              Alert.alert("Upload Failed", "Firestore security rules or network blocked the write.");
            } finally {
              setUploadingExcuse(false);
              setSelectedAttendanceDate(null);
            }
          }
        }
      ]
    );
  };

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
      
      {/* Dynamic Header */}
      <View className="px-6 pt-6 pb-4 border-b border-slate-900 bg-slate-950">
        <TouchableOpacity onPress={() => router.back()} className="self-start mb-4">
          <Text className="text-slate-400 text-sm font-semibold">← Back to Dashboard</Text>
        </TouchableOpacity>
        <Text className="text-indigo-400 text-xs font-bold uppercase tracking-wider">
          {classInfo?.section || 'Section'}
        </Text>
        <Text className="text-white text-2xl font-black font-sans mt-1">
          {classInfo?.subject || 'Course Detail'}
        </Text>
      </View>

      {/* Segmented Controls tab bar */}
      <View className="flex-row bg-slate-900 border-b border-slate-800">
        {(['syllabus', 'grades', 'attendance', 'announcements'] as const).map((tab) => (
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
        
        {/* SYLLABUS TAB CONTENT */}
        {activeTab === 'syllabus' && (
          <View className="pb-10">
            {syllabus?.modules ? (
              syllabus.modules.map((mod: any) => (
                <View key={mod.id} className="bg-slate-900 border border-slate-850 rounded-2xl p-5 mb-5 mt-3">
                  <Text className="text-indigo-400 text-[10px] font-bold uppercase tracking-wider">Module {mod.id}</Text>
                  <Text className="text-white text-base font-bold font-sans mt-1">{mod.title}</Text>
                  <Text className="text-slate-400 text-xs mt-2 leading-relaxed">{mod.description}</Text>
                  
                  {/* Topics feed inside modules */}
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

                  {/* Quizzes aligned to this module */}
                  {quizzes.filter(q => q.module_id === mod.id).map(quiz => (
                    <TouchableOpacity
                      key={quiz.id}
                      onPress={() => router.push({
                        pathname: '/student/quiz-player',
                        params: { quizId: quiz.id }
                      })}
                      className="bg-indigo-600/10 border border-indigo-500/25 p-3 rounded-xl flex-row justify-between items-center mt-4"
                    >
                      <View className="flex-1 pr-3">
                        <Text className="text-indigo-400 text-[10px] font-black uppercase">✏️ Published Assessment</Text>
                        <Text className="text-white text-xs font-bold mt-0.5">{quiz.title}</Text>
                        <Text className="text-slate-500 text-[9px] mt-1">{quiz.questions?.length || 0} items · {quiz.time_limit_minutes || quiz.time_limit} mins</Text>
                      </View>
                      <Text className="text-indigo-400 text-base font-bold">→</Text>
                    </TouchableOpacity>
                  ))}

                </View>
              ))
            ) : (
              <View className="items-center py-10">
                <Text className="text-slate-500 text-sm">No syllabus structure uploaded by teacher yet.</Text>
              </View>
            )}
          </View>
        )}

        {/* GRADE CENTER TAB CONTENT */}
        {activeTab === 'grades' && (
          <View className="pb-10">
            {/* Summary GPA card */}
            <View className="bg-slate-900 border border-slate-850 p-5 rounded-2xl flex-row justify-between items-center mt-3 mb-6">
              <View>
                <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">Computed Term Grade</Text>
                <Text className="text-white text-3xl font-extrabold mt-1 font-sans">
                  {gradeEntry?.final_grade ?? '—'}
                </Text>
              </View>
              <View className="bg-emerald-600/10 px-4 py-2 rounded-xl">
                <Text className="text-emerald-400 text-xs font-bold uppercase">Passing</Text>
              </View>
            </View>

            {/* List of Assessments */}
            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">Graded Assessments</Text>
            
            {gradeEntry?.assessments ? (
              gradeEntry.assessments.map((asm: any) => (
                <View key={asm.id} className="bg-slate-900 border border-slate-850 p-4 rounded-xl mb-4 mt-2">
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1 pr-3">
                      <Text className="text-slate-500 text-[9px] font-bold uppercase tracking-wider">{asm.component_id || asm.component}</Text>
                      <Text className="text-white text-sm font-bold mt-1 font-sans">{asm.title}</Text>
                      <Text className="text-slate-400 text-xs mt-2 font-mono">
                        Score: <Text className="text-white font-bold">{asm.raw_score ?? '—'}</Text> / {asm.total_points}
                      </Text>
                      <Text className="text-slate-500 text-[10px] mt-1">Class Average: {asm.class_average ?? '—'}</Text>
                    </View>

                    {/* Dispute Button */}
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedAssessment(asm);
                        setShowContestModal(true);
                      }}
                      className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg"
                    >
                      <Text className="text-slate-300 text-[10px] font-bold">Contest</Text>
                    </TouchableOpacity>
                  </View>
                  
                  {/* Simple Custom Bar Visualizer */}
                  {asm.raw_score !== undefined && (
                    <View className="w-full h-2 bg-slate-950 rounded-full mt-3 overflow-hidden">
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

            {/* Score dispute input modal (Overlay layout in tabs) */}
            {showContestModal && selectedAssessment && (
              <View className="bg-slate-900 border border-indigo-900/40 p-5 rounded-2xl mt-4 shadow-xl">
                <Text className="text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">Score Dispute Form</Text>
                <Text className="text-white text-sm font-bold mt-1 mb-2 font-sans">
                  Contesting: {selectedAssessment.title}
                </Text>
                <Text className="text-slate-400 text-xs leading-normal mb-4">
                  Provide your teacher with details regarding the score discrepancy.
                </Text>
                
                <TextInput
                  value={contestReason}
                  onChangeText={setContestReason}
                  placeholder="Justification details here..."
                  placeholderTextColor="#64748b"
                  multiline
                  numberOfLines={4}
                  className="w-full bg-slate-950 border border-slate-850 p-3 rounded-xl text-white text-xs mb-4"
                />

                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={handleSubmitContest}
                    disabled={submittingContest}
                    className="flex-1 bg-indigo-600 py-3 rounded-xl items-center"
                  >
                    {submittingContest ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text className="text-white text-xs font-bold">Submit Contest</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setShowContestModal(false);
                      setSelectedAssessment(null);
                      setContestReason('');
                    }}
                    className="flex-1 bg-slate-950 border border-slate-800 py-3 rounded-xl items-center"
                  >
                    <Text className="text-slate-300 text-xs font-bold">Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

          </View>
        )}

        {/* ATTENDANCE TAB CONTENT */}
        {activeTab === 'attendance' && (
          <View className="pb-10">
            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-3 mb-4">Attendance Logs</Text>
            
            {attendanceLogs.length === 0 ? (
              <View className="items-center py-10">
                <Text className="text-slate-500 text-sm">No attendance dates recorded for this class section.</Text>
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

                  <View className="flex-row items-center gap-3">
                    {/* Status Badge */}
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

                    {/* Upload excuse button for absent/late logs without attached documents */}
                    {(log.status === 'absent' || log.status === 'late') && !log.excuse_url ? (
                      <TouchableOpacity
                        onPress={() => handleTriggerExcuseUpload(log.date)}
                        className="bg-indigo-600/15 border border-indigo-500/30 px-3 py-1.5 rounded-lg"
                      >
                        <Text className="text-indigo-400 text-[9px] font-bold">Attach Excuse</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                </View>
              ))
            )}
          </View>
        )}

        {/* ANNOUNCEMENTS TAB CONTENT */}
        {activeTab === 'announcements' && (
          <View className="pb-10">
            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-3 mb-4">Class Bulletins</Text>
            
            {announcements.length === 0 ? (
              <View className="items-center py-10">
                <Text className="text-slate-500 text-sm">No announcements published in this class yet.</Text>
              </View>
            ) : (
              announcements.map((ann) => (
                <View key={ann.id} className="bg-slate-900 border border-slate-850 p-5 rounded-2xl mb-4 mt-2">
                  <Text className="text-white text-base font-bold font-sans">{ann.title}</Text>
                  <Text className="text-slate-400 text-xs mt-3 leading-relaxed">{ann.body}</Text>
                  
                  <View className="mt-4 pt-3 border-t border-slate-850 flex-row justify-between items-center">
                    <Text className="text-slate-500 text-[10px]">Math Adviser Faculty</Text>
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
