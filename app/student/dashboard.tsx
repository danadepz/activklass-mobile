import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { Svg, Circle } from 'react-native-svg';
import { auth, db } from '../../src/config/firebase';
import { useAuth, UserProfile } from '../../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { GuardianLink, approveGuardian, getMyGuardians, revokeGuardian } from '../../src/lib/parent';

// Interface for classes data structure in dashboard
interface ClassItem {
  id: string;
  subject: string;
  section: string;
  teacher_name?: string;
  school_year: string;
  grade_level?: string;
}

export default function StudentDashboard() {
  const router = useRouter();
  const { profile, logout } = useAuth();
  
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [activeRemediations, setActiveRemediations] = useState<any[]>([]);
  const [pendingGuardians, setPendingGuardians] = useState<GuardianLink[]>([]);
  const [consentBusy, setConsentBusy] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [overallGrade, setOverallGrade] = useState(90); // Default placeholder
  const [attendanceRate, setAttendanceRate] = useState(96); // Default placeholder

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    // 1. Fetch Enrolled Classes in Real-Time
    const classesQuery = query(
      collection(db, 'classes'),
      where('student_ids', 'array-contains', user.uid)
    );

    const unsubscribeClasses = onSnapshot(classesQuery, async (snapshot) => {
      const classList: ClassItem[] = [];
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        
        // Fetch teacher name from users collection
        let teacherName = 'Mrs. Santos'; // Fallback
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

    // 2. Fetch Active Remediations
    const remediationQuery = query(
      collection(db, 'remediations'),
      where('student_id', '==', user.uid)
    );
    const unsubscribeRemediations = onSnapshot(remediationQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveRemediations(list);
    });

    return () => {
      unsubscribeClasses();
      unsubscribeRemediations();
    };
  }, [profile]);

  /* Guardians awaiting this student's approval.
     Read from the API, not consent_records: the backend decides who is pending
     (a minor's guardian never is), and guardian_links is write-denied to
     clients so the device can no longer set its own consent status. */
  const loadPendingGuardians = useCallback(async () => {
    try {
      const data = await getMyGuardians();
      setPendingGuardians(
        data.can_manage ? data.guardians.filter((g) => g.status !== 'approved') : []
      );
    } catch (e) {
      console.error('[StudentDashboard] guardian links:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPendingGuardians();
    }, [loadPendingGuardians])
  );

  const handleConsentAction = async (link: GuardianLink, approve: boolean) => {
    setConsentBusy(link.id);
    try {
      // There is no 'declined' state on a link -- declining is a revoke, which
      // removes the connection outright.
      await (approve ? approveGuardian(link.id) : revokeGuardian(link.id));
      await loadPendingGuardians();
    } catch (e) {
      console.error('[StudentDashboard] consent action:', e);
    } finally {
      setConsentBusy(null);
    }
  };

  const getGreeting = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) return 'Good Morning';
    if (hrs < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Circular progress dimensions
  const radius = 50;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (overallGrade / 100) * circumference;

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />
      <ScrollView className="flex-1 px-6 py-4">
        
        {/* Welcome Header */}
        <View className="flex-row justify-between items-center mt-6">
          <View>
            <Text className="text-slate-400 text-xs font-semibold uppercase tracking-widest">{getGreeting()}</Text>
            <Text className="text-white text-2xl font-extrabold font-sans mt-1">
              {profile?.first_name || 'Student'} 👋
            </Text>
          </View>
          <TouchableOpacity 
            onPress={logout}
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl"
          >
            <Text className="text-slate-400 text-xs font-bold">Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Circular Progress & Metrics Card */}
        <View className="bg-slate-900 border border-slate-850 rounded-3xl p-6 mt-6 flex-row items-center justify-between shadow-xl">
          <View className="flex-1 pr-4">
            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">Overall Academic Standing</Text>
            <Text className="text-white text-2xl font-extrabold font-sans mt-2">Honor Standing</Text>
            <Text className="text-slate-500 text-xs mt-1">Class Attendance Average is at {attendanceRate}%.</Text>
          </View>
          
          {/* Animated Circular SVG */}
          <View className="items-center justify-center relative">
            <Svg width="120" height="120" viewBox="0 0 120 120">
              <Circle
                cx="60"
                cy="60"
                r={radius}
                stroke="#1e293b"
                strokeWidth={strokeWidth}
                fill="none"
              />
              <Circle
                cx="60"
                cy="60"
                r={radius}
                stroke="#6366f1"
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
              />
            </Svg>
            <View className="absolute items-center justify-center">
              <Text className="text-white text-xl font-black">{overallGrade}%</Text>
              <Text className="text-slate-500 text-[9px] uppercase font-bold tracking-widest mt-0.5">Average</Text>
            </View>
          </View>
        </View>

        {/* Consent Alert Banner (Conditional) */}
        {pendingGuardians.map((link) => (
          <View key={link.id} className="bg-amber-950/20 border border-amber-900/30 rounded-2xl p-5 mt-5">
            <Text className="text-amber-400 text-xs font-extrabold uppercase tracking-wider mb-2">
              🛡️ Consent Request (RA 10173)
            </Text>
            <Text className="text-slate-300 text-xs leading-normal mb-4">
              <Text className="font-semibold text-slate-200">
                {link.guardian_name || link.guardian_email || 'A guardian'}
              </Text>{' '}
              is requesting access to view your academic record. You can choose exactly what they
              see in Profile afterwards.
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => handleConsentAction(link, true)}
                disabled={consentBusy === link.id}
                className="flex-1 bg-emerald-600 py-3 rounded-xl items-center"
              >
                {consentBusy === link.id ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-white text-xs font-bold">Approve Access</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleConsentAction(link, false)}
                disabled={consentBusy === link.id}
                className="flex-1 bg-slate-900 border border-red-900/40 py-3 rounded-xl items-center"
              >
                <Text className="text-red-400 text-xs font-bold">Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Remediation Alert Banner (Conditional) */}
        {activeRemediations.length > 0 && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push('/student/remediation')}
            className="bg-indigo-950/20 border border-indigo-900/30 rounded-2xl p-5 mt-5 flex-row items-center justify-between"
          >
            <View className="flex-1 pr-3">
              <Text className="text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
                ✨ Adaptive Review Assigned
              </Text>
              <Text className="text-slate-300 text-xs leading-relaxed">
                We've flagged some learning gaps in <Text className="font-semibold text-white">{activeRemediations[0].topic}</Text>. Open your Custom Study Guide now.
              </Text>
            </View>
            <Text className="text-white text-xl ml-2">→</Text>
          </TouchableOpacity>
        )}

        {/* Classes Section Header */}
        <Text className="text-slate-300 text-xs font-bold uppercase tracking-wider mt-8 mb-4">
          My Active Classes ({classes.length})
        </Text>

        {loading ? (
          <ActivityIndicator size="small" color="#6366f1" className="my-8" />
        ) : classes.length === 0 ? (
          <View className="bg-slate-900/40 border border-slate-850 rounded-2xl p-8 items-center justify-center my-4">
            <Text className="text-slate-500 text-sm font-semibold">Not enrolled in any classes yet.</Text>
            <Text className="text-slate-600 text-xs text-center mt-2 leading-relaxed">
              Ask your teacher to add your email address to the class section roster on the web portal.
            </Text>
          </View>
        ) : (
          <View className="space-y-4 mb-10">
            {classes.map((cls) => (
              <TouchableOpacity
                key={cls.id}
                onPress={() => router.push(`/student/class/${cls.id}`)}
                activeOpacity={0.8}
                className="bg-slate-900 border border-slate-850 p-5 rounded-2xl mt-4"
              >
                <View className="flex-row justify-between items-start">
                  <View>
                    <Text className="text-indigo-400 text-xs font-bold uppercase tracking-wider">{cls.grade_level} · {cls.section}</Text>
                    <Text className="text-white text-lg font-bold font-sans mt-1">{cls.subject}</Text>
                    <Text className="text-slate-400 text-xs mt-2">Instructor: {cls.teacher_name}</Text>
                  </View>
                  <View className="bg-indigo-600/10 px-3 py-1.5 rounded-lg">
                    <Text className="text-indigo-400 text-[10px] font-bold uppercase">{cls.school_year}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
