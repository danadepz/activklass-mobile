import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, SafeAreaView, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { Svg, Circle } from 'react-native-svg';
import { auth, db } from '../../src/config/firebase';
import { useAuth } from '../../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';

interface LinkedStudent {
  student_id: string;
  student_name: string;
  student_number: string;
  year_level: string;
  status: 'approved' | 'pending' | 'declined';
  is_minor: boolean;
}

export default function ParentDashboard() {
  const router = useRouter();
  const { profile, logout } = useAuth();
  
  const [linkedStudents, setLinkedStudents] = useState<LinkedStudent[]>([]);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  
  // Active child classes list
  const [classes, setClasses] = useState<any[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  
  // Modals and inputs
  const [showSwitchSheet, setShowSwitchSheet] = useState(false);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [submittingLink, setSubmittingLink] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    // 1. Fetch all linked student consent records in real-time
    const consentQuery = query(
      collection(db, 'consent_records'),
      where('parent_id', '==', user.uid)
    );

    const unsubscribeConsent = onSnapshot(consentQuery, async (snapshot) => {
      const studentList: LinkedStudent[] = [];
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const studentId = data.student_id;
        
        // Fetch student profile to get current name and section registry
        try {
          const studentDoc = await getDoc(doc(db, 'users', studentId));
          if (studentDoc.exists()) {
            const studentData = studentDoc.data();
            studentList.push({
              student_id: studentId,
              student_name: `${studentData.first_name} ${studentData.last_name}`,
              student_number: studentData.student_number || 'Unknown',
              year_level: studentData.year_level || studentData.grade_level || 'Grade 10',
              status: data.status || 'pending',
              is_minor: data.is_minor || false,
            });
          }
        } catch (e) {
          console.error('Error fetching student profile:', e);
        }
      }
      
      setLinkedStudents(studentList);
      setLoading(false);
    }, (err) => {
      console.error('Consent listener error:', err);
      setLoading(false);
    });

    return () => unsubscribeConsent();
  }, []);

  // 2. Fetch classes of the currently active child if consent is approved
  useEffect(() => {
    if (linkedStudents.length === 0 || activeIdx >= linkedStudents.length) return;
    const activeStudent = linkedStudents[activeIdx];
    
    if (activeStudent.status !== 'approved') {
      setClasses([]);
      return;
    }

    setLoadingClasses(true);
    
    // Query classes where active child's UID is in student_ids array
    const classesQuery = query(
      collection(db, 'classes'),
      where('student_ids', 'array-contains', activeStudent.student_id)
    );

    const unsubscribeClasses = onSnapshot(classesQuery, async (snapshot) => {
      const classList: any[] = [];
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        classList.push({
          id: docSnap.id,
          subject: data.subject || 'Unknown',
          section: data.section || 'Unknown',
          school_year: data.school_year || '2025-2026',
        });
      }
      setClasses(classList);
      setLoadingClasses(false);
    }, (err) => {
      console.error('Error listening to classes:', err);
      setLoadingClasses(false);
    });

    return () => unsubscribeClasses();
  }, [linkedStudents, activeIdx]);

  // Handle adding another child link using invite code
  const handleLinkChild = async () => {
    if (!inviteCodeInput.trim()) return;
    const user = auth.currentUser;
    if (!user || !profile) return;

    setSubmittingLink(true);
    try {
      // Find matching invitation code in consent records
      const consentQuery = query(
        collection(db, 'consent_records'),
        where('invitation_code', '==', inviteCodeInput.trim().toUpperCase())
      );
      
      const querySnapshot = await getDocs(consentQuery);
      
      if (querySnapshot.empty) {
        Alert.alert('Invalid Code', 'The invitation code is incorrect.');
        setSubmittingLink(false);
        return;
      }

      const docSnap = querySnapshot.docs[0];
      const data = docSnap.data();

      // Check if already linked
      if (data.parent_id === user.uid) {
        Alert.alert('Already Linked', 'This student is already linked to your account.');
        setSubmittingLink(false);
        return;
      }

      // Link parent details
      await updateDoc(doc(db, 'consent_records', data.student_id), {
        parent_id: user.uid,
        parent_first_name: profile.first_name,
        parent_last_name: profile.last_name,
        status: data.is_minor ? 'approved' : 'pending', // Automatic approval for minor
      });

      Alert.alert('Link Success', 'Child account linked successfully.');
      setShowAddChildModal(false);
      setInviteCodeInput('');
      
    } catch (e: any) {
      console.error(e);
      Alert.alert('Linking Failed', 'Firestore rules or network blocked link request.');
    } finally {
      setSubmittingLink(false);
    }
  };

  // Re-request consent from adult child
  const handleReRequestConsent = async () => {
    if (linkedStudents.length === 0) return;
    const activeStudent = linkedStudents[activeIdx];
    try {
      await updateDoc(doc(db, 'consent_records', activeStudent.student_id), {
        status: 'pending',
        signed_at: serverTimestamp()
      });
      Alert.alert('Re-requested', 'A consent confirmation request has been sent to your child.');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to submit request.');
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-950">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const activeChild = linkedStudents[activeIdx];
  const radius = 40;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />
      
      {/* Header and Child Switch Selector */}
      <View className="px-6 pt-6 pb-4 border-b border-slate-900 bg-slate-950 flex-row justify-between items-center">
        <View className="flex-1 pr-3">
          <Text className="text-indigo-400 text-xs font-bold uppercase tracking-wider">Parent Portal</Text>
          {activeChild ? (
            <TouchableOpacity 
              onPress={() => setShowSwitchSheet(true)} 
              className="flex-row items-center mt-1"
            >
              <Text className="text-white text-xl font-extrabold font-sans pr-1">
                {activeChild.student_name}
              </Text>
              <Text className="text-indigo-400 text-sm">▼</Text>
            </TouchableOpacity>
          ) : (
            <Text className="text-white text-xl font-extrabold font-sans mt-1">No Child Linked</Text>
          )}
        </View>
        
        <View className="flex-row gap-2">
          <TouchableOpacity 
            onPress={() => setShowAddChildModal(true)} 
            className="px-3 py-2 bg-indigo-650 rounded-xl"
          >
            <Text className="text-white text-xs font-bold">+ Add Child</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={logout} 
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl"
          >
            <Text className="text-slate-400 text-xs font-bold">Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-6 py-4">
        
        {/* If no children linked */}
        {linkedStudents.length === 0 ? (
          <View className="bg-slate-900/40 border border-slate-850 rounded-2xl p-8 items-center justify-center my-20">
            <Text className="text-slate-500 text-3xl mb-4">🛡️</Text>
            <Text className="text-white text-base font-bold text-center">No Children Linked</Text>
            <Text className="text-slate-600 text-xs text-center mt-2 leading-relaxed max-w-xs">
              Link your child's profile to view their class record grades and attendance. Click "+ Add Child" above and input their invitation code.
            </Text>
          </View>
        ) : activeChild.status !== 'approved' ? (
          
          /* DPA COMPLIANT ACCESS GATE / CONSENT RESTRICTION SCREEN */
          <View className="bg-slate-900 border border-slate-850 rounded-3xl p-6 mt-6 items-center">
            <View className="w-16 h-16 bg-red-950/20 border border-red-500/20 rounded-full items-center justify-center mb-4">
              <Text className="text-red-400 text-2xl font-bold">🔒</Text>
            </View>
            <Text className="text-white text-lg font-black text-center font-sans">
              Access Gate Restricted
            </Text>
            <Text className="text-slate-400 text-xs text-center mt-1">
              RA 10173 — Data Privacy Act of 2012
            </Text>
            
            <View className="w-full bg-slate-950 p-4 rounded-xl border border-slate-850 my-6">
              <Text className="text-slate-300 text-xs font-medium leading-relaxed">
                Because <Text className="font-bold text-indigo-400">{activeChild.student_name}</Text> is of legal age (18+), you must obtain explicit consent in their profile settings to view grades and records.
              </Text>
              <Text className="text-slate-500 text-[10px] mt-2">
                Status: <Text className="font-semibold capitalize text-amber-400">{activeChild.status}</Text>
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleReRequestConsent}
              className="w-full bg-indigo-600 py-4 rounded-xl items-center justify-center shadow-lg shadow-indigo-600/20"
            >
              <Text className="text-white text-sm font-bold">Re-request Access</Text>
            </TouchableOpacity>
          </View>

        ) : (
          
          /* APPROVED PORTAL: METRICS & CLASSES LIST */
          <View className="pb-10">
            {/* Quick Metrics Summary */}
            <View className="bg-slate-900 border border-slate-850 rounded-3xl p-6 mt-6 flex-row items-center justify-between">
              <View className="flex-1 pr-4">
                <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">Child Grade Standing</Text>
                <Text className="text-white text-xl font-bold font-sans mt-2">Satisfactory Averages</Text>
                <Text className="text-slate-500 text-[10px] mt-1">Registry: {activeChild.year_level} · ID {activeChild.student_number}</Text>
              </View>
              
              {/* Animated SVG Circle */}
              <View className="items-center justify-center relative">
                <Svg width="100" height="100" viewBox="0 0 100 100">
                  <Circle
                    cx="50"
                    cy="50"
                    r={radius}
                    stroke="#1e293b"
                    strokeWidth={strokeWidth}
                    fill="none"
                  />
                  <Circle
                    cx="50"
                    cy="50"
                    r={radius}
                    stroke="#10b981"
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - (0.88 * circumference)} // Mock 88%
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                  />
                </Svg>
                <View className="absolute items-center justify-center">
                  <Text className="text-white text-base font-black">88%</Text>
                  <Text className="text-slate-500 text-[8px] uppercase font-bold tracking-widest">GPA</Text>
                </View>
              </View>
            </View>

            {/* Enrolled Classes List */}
            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-8 mb-4">
              Enrolled Course Sections ({classes.length})
            </Text>

            {loadingClasses ? (
              <ActivityIndicator size="small" color="#6366f1" className="my-8" />
            ) : classes.length === 0 ? (
              <View className="bg-slate-900/40 border border-slate-850 rounded-2xl p-8 items-center justify-center mt-2">
                <Text className="text-slate-500 text-sm">No active enrolled classes found.</Text>
              </View>
            ) : (
              <View className="space-y-4">
                {classes.map((cls) => (
                  <TouchableOpacity
                    key={cls.id}
                    onPress={() => router.push({
                      pathname: `/parent/class/${cls.id}`,
                      params: { studentId: activeChild.student_id, studentName: activeChild.student_name }
                    })}
                    activeOpacity={0.8}
                    className="bg-slate-900 border border-slate-850 p-5 rounded-2xl mt-4"
                  >
                    <View className="flex-row justify-between items-center">
                      <View className="flex-1 pr-3">
                        <Text className="text-indigo-400 text-[10px] font-bold uppercase tracking-wider">{cls.section}</Text>
                        <Text className="text-white text-base font-bold font-sans mt-1">{cls.subject}</Text>
                        <Text className="text-slate-500 text-[10px] mt-2">Academic Term Year: {cls.school_year}</Text>
                      </View>
                      <Text className="text-indigo-400 text-lg font-bold">→</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

          </View>
        )}

      </ScrollView>

      {/* MODAL: Switch Child Sliding Sheet */}
      <Modal
        visible={showSwitchSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSwitchSheet(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-slate-950 border-t border-slate-800 rounded-t-3xl p-6">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-white text-lg font-bold">Switch Linked Student</Text>
              <TouchableOpacity onPress={() => setShowSwitchSheet(false)}>
                <Text className="text-slate-400 text-sm font-semibold">Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView className="space-y-3 max-h-64">
              {linkedStudents.map((std, i) => (
                <TouchableOpacity
                  key={std.student_id}
                  onPress={() => {
                    setActiveIdx(i);
                    setShowSwitchSheet(false);
                  }}
                  className={`p-4 rounded-xl border flex-row justify-between items-center mt-3 ${
                    activeIdx === i ? 'bg-indigo-600/10 border-indigo-500' : 'bg-slate-900 border-slate-850'
                  }`}
                >
                  <View>
                    <Text className="text-white text-sm font-bold">{std.student_name}</Text>
                    <Text className="text-slate-400 text-xs mt-1">ID: {std.student_number} · {std.year_level}</Text>
                  </View>
                  {activeIdx === i && <Text className="text-indigo-400 text-xs font-bold">✓ Active</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL: Add Child Link */}
      <Modal
        visible={showAddChildModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddChildModal(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/65 px-6">
          <View className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-3xl p-6">
            <Text className="text-white text-xl font-bold mb-2">Link Student Record</Text>
            <Text className="text-slate-400 text-xs leading-normal mb-6">
              Enter the unique invitation code generated on your child's profile screen to establish a parental connection.
            </Text>

            <TextInput
              value={inviteCodeInput}
              onChangeText={setInviteCodeInput}
              placeholder="Enter Code (e.g. AK123456)"
              placeholderTextColor="#64748b"
              autoCapitalize="characters"
              className="w-full bg-slate-950 border border-slate-850 p-4 rounded-xl text-white text-center text-base font-bold mb-6"
            />

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={handleLinkChild}
                disabled={submittingLink}
                className="flex-1 bg-indigo-600 py-3 rounded-xl items-center justify-center"
              >
                {submittingLink ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-white text-xs font-bold">Link Student</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowAddChildModal(false);
                  setInviteCodeInput('');
                }}
                disabled={submittingLink}
                className="flex-1 bg-slate-950 border border-slate-800 py-3 rounded-xl items-center justify-center"
              >
                <Text className="text-slate-400 text-xs font-bold">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
