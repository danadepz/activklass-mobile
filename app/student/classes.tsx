import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { auth, db } from '../../src/config/firebase';
import { StatusBar } from 'expo-status-bar';

interface ClassItem {
  id: string;
  subject: string;
  section: string;
  teacher_name?: string;
  school_year: string;
  grade_level?: string;
}

export default function StudentClassesIndex() {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const classesQuery = query(
      collection(db, 'classes'),
      where('student_ids', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(classesQuery, async (snapshot) => {
      const classList: ClassItem[] = [];
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        let teacherName = 'Mrs. Santos';
        if (data.teacher_id) {
          try {
            const teacherDoc = await getDocs(query(collection(db, 'users'), where('id', '==', data.teacher_id)));
            if (!teacherDoc.empty) {
              const teacherData = teacherDoc.docs[0].data();
              teacherName = `Mr/s. ${teacherData.last_name}`;
            }
          } catch (e) {
            console.error('Error fetching teacher name:', e);
          }
        }

        classList.push({
          id: docSnap.id,
          subject: data.subject || 'Unknown Subject',
          section: data.section || 'Unknown Section',
          teacher_name: teacherName,
          school_year: data.school_year || data.academic_year || '2025-2026',
          grade_level: data.grade_level || 'Grade 10',
        });
      }
      setClasses(classList);
      setLoading(false);
    }, (err) => {
      console.error('Error listening to classes:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />
      <View className="flex-1 px-6 py-4">
        
        {/* Header */}
        <View className="mt-6 mb-6">
          <Text className="text-white text-3xl font-extrabold font-sans">
            My Classes
          </Text>
          <Text className="text-slate-400 text-sm mt-2 font-sans">
            View course structures, grades, attendance logs, and alerts for your enrolled subjects.
          </Text>
        </View>

        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        ) : classes.length === 0 ? (
          <View className="bg-slate-900/40 border border-slate-850 rounded-2xl p-8 items-center justify-center my-auto">
            <Text className="text-slate-500 text-sm font-semibold">Not enrolled in any classes yet.</Text>
            <Text className="text-slate-600 text-xs text-center mt-2 leading-relaxed">
              Enrolled classes are updated automatically once your instructor registers your email address to the class roster.
            </Text>
          </View>
        ) : (
          <ScrollView className="flex-1">
            <View className="space-y-4 mb-10">
              {classes.map((cls) => (
                <TouchableOpacity
                  key={cls.id}
                  onPress={() => router.push(`/student/class/${cls.id}`)}
                  activeOpacity={0.8}
                  className="bg-slate-900 border border-slate-850 p-5 rounded-2xl mt-4"
                >
                  <View className="flex-row justify-between items-center">
                    <View className="flex-1 pr-3">
                      <Text className="text-indigo-400 text-[10px] font-bold uppercase tracking-wider">
                        {cls.grade_level} · {cls.section}
                      </Text>
                      <Text className="text-white text-lg font-bold font-sans mt-1">
                        {cls.subject}
                      </Text>
                      <Text className="text-slate-400 text-xs mt-2">
                        Instructor: {cls.teacher_name}
                      </Text>
                    </View>
                    <Text className="text-indigo-400 text-xl font-bold font-sans">→</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

      </View>
    </SafeAreaView>
  );
}
