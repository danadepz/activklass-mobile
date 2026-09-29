import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Svg, Circle } from 'react-native-svg';
import { auth, db } from '../../src/config/firebase';
import { teacherNameFor } from '../../src/lib/teachers';
import { loadOverallStanding, standingLabel } from '../../src/lib/studentData';
import { useAuth } from '../../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { watchMyNotifications } from '../../src/lib/notifications';
import {
  GuardianLinkDoc,
  approveGuardianLink,
  canManageOwnLinks,
  listMyGuardians,
  revokeGuardianLink,
} from '../../src/lib/guardianCodes';
import { useThemeColors } from '../../src/theme';
import ClassStandingForecast from '../../src/components/ClassStandingForecast';
import { Ionicons } from '@expo/vector-icons';

// Interface for classes data structure in dashboard
interface ClassItem {
  id: string;
  subject: string;
  section: string | null;
  teacher_name?: string;
  school_year: string | null;
  grade_level?: string | null;
}

export default function StudentDashboard() {
  const c = useThemeColors();
  const router = useRouter();
  const { profile } = useAuth();
  
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [activeRemediations, setActiveRemediations] = useState<any[]>([]);
  const [pendingGuardians, setPendingGuardians] = useState<GuardianLinkDoc[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [consentBusy, setConsentBusy] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  /* Read from Firestore, not invented. These were useState(90) and
     useState(96) with nothing ever setting them, so every student saw the
     same two numbers over the words "Honor Standing" while the web showed
     their real marks. null means "not loaded or none recorded" and is
     rendered as such rather than as a zero. */
  const [overallGrade, setOverallGrade] = useState<number | null>(null);
  const [attendanceRate, setAttendanceRate] = useState<number | null>(null);

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
        const teacherName = await teacherNameFor(data.teacher_id);

        classList.push({
          id: docSnap.id,
          subject: data.subject || 'Untitled class',
          section: data.section || null,
          teacher_name: teacherName,
          school_year: data.school_year || data.academic_year || null,
          grade_level: data.grade_level || null,
        });
      }
      setClasses(classList);

      // Grades and attendance come from the same documents the web reads, so
      // the two cannot show a student different numbers.
      const uid = profile?.id;
      if (uid && classList.length) {
        const standing = await loadOverallStanding(classList.map((c) => c.id), uid);
        setOverallGrade(standing.average);
        setAttendanceRate(standing.attendanceRate);
      }
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

  /* Live, so the badge clears the moment the notifications screen marks one
     read rather than waiting for this screen to be refocused. */
  useEffect(
    () => watchMyNotifications((items) => setUnreadCount(items.filter((n) => !n.read).length)),
    []
  );

  /* Guardians awaiting this student's approval.
     Read straight from guardian_links, which is where the guardian app now
     writes them. Only adults see this banner: a minor's guardian is approved
     the moment the code is redeemed and is never pending, and a minor cannot
     act on the link anyway -- firestore.rules gates the write on is_minor. */
  const loadPendingGuardians = useCallback(async () => {
    if (!canManageOwnLinks(profile?.birthdate)) {
      setPendingGuardians([]);
      return;
    }
    try {
      const links = await listMyGuardians();
      setPendingGuardians(links.filter((g) => g.status !== 'approved'));
    } catch (e) {
      console.error('[StudentDashboard] guardian links:', e);
    }
  }, [profile?.birthdate]);

  useFocusEffect(
    useCallback(() => {
      loadPendingGuardians();
    }, [loadPendingGuardians])
  );

  const handleConsentAction = async (link: GuardianLinkDoc, approve: boolean) => {
    setConsentBusy(link.link_id);
    try {
      // There is no 'declined' state on a link -- declining is a revoke, which
      // removes the connection outright.
      await (approve ? approveGuardianLink(link.link_id) : revokeGuardianLink(link.link_id));
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
  /* A percentage grade fills the ring. A CHED point-scale average (1.0-5.0,
     lower is better) would read as an almost-empty circle, so it draws none. */
  const ringRatio =
    overallGrade != null && overallGrade > 5 ? Math.min(overallGrade / 100, 1) : null;
  const strokeDashoffset = circumference - (ringRatio ?? 0) * circumference;

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <StatusBar style="auto" />
      <ScrollView className="flex-1 px-6 py-4">
        
        {/* Welcome Header */}
        <View className="flex-row justify-between items-center mt-6">
          <View>
            <Text className="text-ink-muted text-xs font-semibold uppercase tracking-widest">{getGreeting()}</Text>
            <Text className="text-ink text-2xl font-extrabold font-sans mt-1">
              {profile?.first_name || 'Student'} 👋
            </Text>
          </View>
          {/* Logout used to live here, a thumb-width from nothing else, so a
              stray tap ended the session. It belongs in Profile, which is where
              the guardian side already keeps it. The bell takes its place. */}
          <TouchableOpacity
            onPress={() => router.push('/student/notifications')}
            accessibilityRole="button"
            accessibilityLabel={
              unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
            }
            className="w-11 h-11 items-center justify-center bg-surface border border-hairline rounded-xl"
          >
            <Ionicons name="notifications-outline" size={20} color={c.ink} />
            {unreadCount > 0 && (
              // Count, not a plain dot: "you have something" is less useful
              // than "you have three", and 9+ keeps the badge circular.
              <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent items-center justify-center border-2 border-hairline">
                <Text className="text-on-accent text-[9px] font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Circular Progress & Metrics Card */}
        <View className="bg-surface border border-hairline rounded-3xl p-6 mt-6 flex-row items-center justify-between shadow-xl">
          <View className="flex-1 pr-4">
            <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider">Overall Academic Standing</Text>
            <Text className="text-ink text-2xl font-extrabold font-sans mt-2">
              {standingLabel(overallGrade)}
            </Text>
            <Text className="text-ink-faint text-xs mt-1">
              {attendanceRate != null
                ? `Class Attendance Average is at ${attendanceRate}%.`
                : 'No attendance recorded yet.'}
            </Text>
          </View>
          
          {/* Animated Circular SVG */}
          <View className="items-center justify-center relative">
            <Svg width="120" height="120" viewBox="0 0 120 120">
              <Circle
                cx="60"
                cy="60"
                r={radius}
                stroke={c.track}
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
              <Text className="text-ink text-xl font-black">
                {overallGrade != null ? (ringRatio != null ? `${overallGrade}%` : overallGrade) : "—"}
              </Text>
              <Text className="text-ink-faint text-[9px] uppercase font-bold tracking-widest mt-0.5">Average</Text>
            </View>
          </View>
        </View>

        {/* Projected Academic Standing (Early-Warning Model) */}
        {profile?.id && (
          <View className="mt-4">
            <ClassStandingForecast
              studentId={profile.id}
              grade={overallGrade}
              attendanceRate={attendanceRate}
            />
          </View>
        )}

        {/* Consent Alert Banner (Conditional) */}
        {pendingGuardians.map((link) => (
          <View key={link.link_id} className="bg-amber-950/20 border border-amber-900/30 rounded-2xl p-5 mt-5">
            <View className="flex-row items-center mb-2">
              <Ionicons name="shield-checkmark-outline" size={15} color={c.warning} style={{ marginRight: 6 }} />
              <Text className="text-warning text-xs font-extrabold uppercase tracking-wider">
                Consent Request (RA 10173)
              </Text>
            </View>
            <Text className="text-ink-soft text-xs leading-normal mb-4">
              <Text className="font-semibold text-ink-soft">
                {link.guardian_name || link.guardian_email || 'A guardian'}
              </Text>{' '}
              is requesting access to view your academic record. You can choose exactly what they
              see in Profile afterwards.
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => handleConsentAction(link, true)}
                disabled={consentBusy === link.link_id}
                className="flex-1 bg-success py-3 rounded-xl items-center"
              >
                {consentBusy === link.link_id ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-on-accent text-xs font-bold">Approve Access</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleConsentAction(link, false)}
                disabled={consentBusy === link.link_id}
                className="flex-1 bg-surface border border-red-900/40 py-3 rounded-xl items-center"
              >
                <Text className="text-danger text-xs font-bold">Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Remediation Alert Banner (Conditional) */}
        {activeRemediations.length > 0 && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push('/student/remediation')}
            className="bg-indigo-950/20 border border-accent/30 rounded-2xl p-5 mt-5 flex-row items-center justify-between"
          >
            <View className="flex-1 pr-3">
              <View className="flex-row items-center mb-1">
                <Ionicons name="sparkles-outline" size={14} color={c.accentText} style={{ marginRight: 6 }} />
                <Text className="text-accent-text text-xs font-bold uppercase tracking-wider">
                  Adaptive Review Assigned
                </Text>
              </View>
              <Text className="text-ink-soft text-xs leading-relaxed">
                We&apos;ve flagged some learning gaps in <Text className="font-semibold text-ink">{activeRemediations[0].topic}</Text>. Open your Custom Study Guide now.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.ink} />
          </TouchableOpacity>
        )}

        {/* Classes Section Header */}
        <Text className="text-ink-soft text-xs font-bold uppercase tracking-wider mt-8 mb-4">
          My Active Classes ({classes.length})
        </Text>

        {loading ? (
          <ActivityIndicator size="small" color="#6366f1" className="my-8" />
        ) : classes.length === 0 ? (
          <View className="bg-surface/40 border border-hairline rounded-2xl p-8 items-center justify-center my-4">
            <Text className="text-ink-faint text-sm font-semibold">Not enrolled in any classes yet.</Text>
            <Text className="text-ink-faint text-xs text-center mt-2 leading-relaxed">
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
                className="bg-surface border border-hairline p-5 rounded-2xl mt-4"
              >
                <View className="flex-row justify-between items-start">
                  <View>
                    <Text className="text-accent-text text-xs font-bold uppercase tracking-wider">
                      {[cls.grade_level, cls.section].filter(Boolean).join(" · ") || "Class"}
                    </Text>
                    <Text className="text-ink text-lg font-bold font-sans mt-1">{cls.subject}</Text>
                    <Text className="text-ink-muted text-xs mt-2">Instructor: {cls.teacher_name}</Text>
                  </View>
                  <View className="bg-accent/10 px-3 py-1.5 rounded-lg">
                    <Text className="text-accent-text text-[10px] font-bold uppercase">{cls.school_year}</Text>
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
