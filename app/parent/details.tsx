import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db } from '../../src/config/firebase';
import { StatusBar } from 'expo-status-bar';

export default function ParentDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const { studentId, studentName, studentNumber, yearLevel, inviteCode } = params;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmitDetails = async () => {
    if (!firstName.trim() || !lastName.trim() || !contactNumber.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    setError(null);

    // Auto-filled username matching student records format
    const parentUsername = `p-${studentNumber}`;
    const parentEmail = `${parentUsername}@activklass.com`;
    
    // Generate a temporary 8-digit password (mix of chars/nums)
    const tempPassword = 'temp' + Math.floor(1000 + Math.random() * 9000);

    try {
      // 1. Fetch current consent record to verify minor status
      const consentDocRef = doc(db, 'consent_records', studentId as string);
      const consentSnap = await getDoc(consentDocRef);
      
      let isMinor = false;
      if (consentSnap.exists()) {
        isMinor = consentSnap.data().is_minor || false;
      }

      // 2. Create Parent user account in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, parentEmail, tempPassword);
      const parentUid = userCredential.user.uid;

      // 3. Create Parent profile document in Firestore users collection
      const parentProfile = {
        id: parentUid,
        email: parentEmail,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        middle_name: middleName.trim() || null,
        role: 'parent',
        status: 'active',
        linked_student_id: studentId,
        username: parentUsername,
        contact_number: contactNumber.trim(),
        is_temp_password: true, // Tag to trigger password reset on first login
      };
      
      await setDoc(doc(db, 'users', parentUid), parentProfile);

      // 4. Update the consent record linking the parent
      await updateDoc(consentDocRef, {
        parent_id: parentUid,
        parent_first_name: firstName.trim(),
        parent_last_name: lastName.trim(),
        // Minor gets approved immediately; Adult student needs manual approval toggle in student app
        status: isMinor ? 'approved' : 'pending', 
      });

      // 5. Sign out immediately so they can log in normally with temporary password
      await signOut(auth);

      // 6. Navigate to Confirmation screen
      router.replace({
        pathname: '/parent/confirm',
        params: {
          username: parentUsername,
          tempPassword,
        }
      });

    } catch (err: any) {
      console.error('[ParentDetails] Error registering parent:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('A parent account is already registered for this student number.');
      } else {
        setError(err.message || 'Onboarding failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-10 justify-between">
        
        {/* Header */}
        <View className="mb-6">
          <Text className="text-white text-3xl font-extrabold font-sans">
            Guardian Details
          </Text>
          <Text className="text-slate-400 text-sm mt-2 font-sans">
            Set up your parent profile details and auto-generate credentials.
          </Text>
        </View>

        {/* Verification Card */}
        <View className="bg-indigo-950/20 border border-indigo-900/30 rounded-2xl p-4 mb-6">
          <Text className="text-indigo-400 text-xs font-bold uppercase tracking-wider mb-2">
            Verifying Connection
          </Text>
          <Text className="text-white text-base font-bold font-sans">
            {studentName}
          </Text>
          <Text className="text-slate-400 text-xs mt-1">
            Student Number: {studentNumber} · Grade: {yearLevel}
          </Text>
        </View>

        {/* Form Details */}
        <View className="flex-1 justify-center space-y-4">
          
          {error && (
            <View className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl mb-4">
              <Text className="text-red-400 text-xs font-semibold">
                {error}
              </Text>
            </View>
          )}

          {/* First Name */}
          <View>
            <Text className="text-slate-300 text-xs font-bold mb-2 uppercase tracking-wider">
              First Name <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              placeholder="e.g. Ricardo"
              placeholderTextColor="#64748b"
              className="w-full bg-slate-900 border border-slate-850 p-4 rounded-xl text-white text-sm focus:border-indigo-500"
            />
          </View>

          {/* Last Name */}
          <View className="mt-4">
            <Text className="text-slate-300 text-xs font-bold mb-2 uppercase tracking-wider">
              Last Name <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              value={lastName}
              onChangeText={lastName => setLastName(lastName)}
              placeholder="e.g. Santos"
              placeholderTextColor="#64748b"
              className="w-full bg-slate-900 border border-slate-850 p-4 rounded-xl text-white text-sm focus:border-indigo-500"
            />
          </View>

          {/* Middle Name */}
          <View className="mt-4">
            <Text className="text-slate-300 text-xs font-bold mb-2 uppercase tracking-wider">
              Middle Name (Optional)
            </Text>
            <TextInput
              value={middleName}
              onChangeText={setMiddleName}
              placeholder="e.g. Lopez"
              placeholderTextColor="#64748b"
              className="w-full bg-slate-900 border border-slate-850 p-4 rounded-xl text-white text-sm focus:border-indigo-500"
            />
          </View>

          {/* Contact Number */}
          <View className="mt-4">
            <Text className="text-slate-300 text-xs font-bold mb-2 uppercase tracking-wider">
              Contact Number <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              value={contactNumber}
              onChangeText={setContactNumber}
              placeholder="e.g. +639171234567"
              placeholderTextColor="#64748b"
              keyboardType="phone-pad"
              className="w-full bg-slate-900 border border-slate-850 p-4 rounded-xl text-white text-sm focus:border-indigo-500"
            />
          </View>

          {/* Auto-filled field */}
          <View className="mt-4 bg-slate-900/40 p-4 rounded-xl border border-slate-850">
            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">
              Generated Username
            </Text>
            <Text className="text-indigo-400 text-sm font-semibold mt-1">
              p-{studentNumber}
            </Text>
            <Text className="text-slate-500 text-[10px] mt-1 leading-normal">
              This username is auto-generated based on your child's student record and will serve as your login identifier.
            </Text>
          </View>

        </View>

        {/* Submit Block */}
        <View className="mt-8">
          <TouchableOpacity
            onPress={handleSubmitDetails}
            disabled={loading}
            activeOpacity={0.8}
            className="w-full bg-indigo-600 py-4 rounded-xl items-center justify-center shadow-lg shadow-indigo-600/25"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text className="text-white text-base font-bold font-sans">
                Register &amp; Generate Credentials
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.back()}
            disabled={loading}
            className="w-full items-center justify-center mt-4"
          >
            <Text className="text-slate-400 text-sm font-semibold">Cancel</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
