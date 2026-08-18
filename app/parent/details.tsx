import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../../src/config/firebase';
import { StatusBar } from 'expo-status-bar';
import { errorMessage } from '../../src/lib/api';
import { redeemGuardianCode } from '../../src/lib/parent';

/**
 * Guardian sign-up, then link.
 *
 * Guardians now register with their OWN email and choose their own password.
 * The previous version minted p-<student_number>@activklass.com with a
 * generated temporary password, which allowed exactly one guardian per student
 * — the whole point of code-based linking is that a student can connect several.
 *
 * Order matters: create the Auth account, write the Firestore profile, then
 * redeem. The backend mirrors the Firestore profile into Postgres on the first
 * authenticated request (middleware/auth.py), so the users document has to
 * exist with role 'parent' before /api/guardian-links/redeem is called.
 */
export default function ParentDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const inviteCode = String(params.inviteCode ?? '');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [relationship, setRelationship] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmitDetails = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password || !contactNumber.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!inviteCode) {
      setError('Missing your child’s code. Go back and enter it again.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Create the guardian's own Firebase Auth account (signs them in).
      const credential = await createUserWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );
      const parentUid = credential.user.uid;

      // 2. Firestore profile. The backend reads this to provision the Postgres
      //    user row, so role and email must be right before any API call.
      await setDoc(doc(db, 'users', parentUid), {
        id: parentUid,
        email: email.trim().toLowerCase(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        middle_name: middleName.trim() || null,
        role: 'parent',
        status: 'active',
        contact_number: contactNumber.trim(),
      });

      // 3. Redeem the code. The backend decides the resulting status: a minor's
      //    guardian is approved at once, an adult student's guardian waits.
      const link = await redeemGuardianCode(inviteCode, relationship.trim() || undefined);

      router.replace({
        pathname: '/parent/confirm',
        params: { email: email.trim().toLowerCase(), linkStatus: link.status },
      });
    } catch (err: any) {
      console.error('[ParentDetails] Error registering guardian:', err);
      if (err?.code === 'auth/email-already-in-use') {
        setError('That email already has an account. Sign in instead, then use "+ Add Child".');
      } else if (err?.code === 'auth/invalid-email') {
        setError('That email address is not valid.');
      } else if (err?.code === 'auth/weak-password') {
        setError('Please choose a stronger password.');
      } else if (auth.currentUser) {
        // Account exists but linking failed — usually a wrong code. Do not strand
        // them on this screen; the dashboard's "+ Add Child" can retry.
        setError(
          `${errorMessage(err, 'That code did not work.')} Your account was created — continue and add your child from the dashboard.`
        );
      } else {
        setError(errorMessage(err, 'Sign-up failed. Please try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-10">
        <TouchableOpacity
          onPress={() => router.back()}
          className="self-start w-10 h-10 items-center justify-center bg-slate-900 border border-slate-800 rounded-xl mb-6"
        >
          <Text className="text-white text-lg font-bold">←</Text>
        </TouchableOpacity>

        <View className="mb-6">
          <Text className="text-white text-3xl font-extrabold font-sans">Guardian Details</Text>
          <Text className="text-slate-400 text-sm mt-2 font-sans">
            Create your account. You will sign in with this email from now on.
          </Text>
          {inviteCode ? (
            <View className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 mt-4 flex-row justify-between items-center">
              <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                Child&apos;s code
              </Text>
              <Text className="text-indigo-400 text-base font-extrabold font-mono tracking-widest">
                {inviteCode}
              </Text>
            </View>
          ) : null}
        </View>

        {error && (
          <View className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl mb-4">
            <Text className="text-red-400 text-xs font-semibold leading-relaxed">{error}</Text>
          </View>
        )}

        <View>
          <Field label="First name *" value={firstName} onChangeText={setFirstName} />
          <Field label="Last name *" value={lastName} onChangeText={setLastName} />
          <Field label="Middle name" value={middleName} onChangeText={setMiddleName} />
          <Field
            label="Email *"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="Password *"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          <Field
            label="Contact number *"
            value={contactNumber}
            onChangeText={setContactNumber}
            keyboardType="phone-pad"
          />
          <Field
            label="Relationship (e.g. Mother, Guardian)"
            value={relationship}
            onChangeText={setRelationship}
          />
        </View>

        <TouchableOpacity
          onPress={handleSubmitDetails}
          disabled={loading}
          activeOpacity={0.8}
          className="w-full bg-indigo-600 py-4 rounded-xl items-center justify-center mt-6 mb-10"
        >
          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text className="text-white text-base font-bold font-sans">Create Account &amp; Link</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  ...inputProps
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View className="mb-4">
      <Text className="text-slate-300 text-xs font-bold mb-2 uppercase tracking-wider">{label}</Text>
      <TextInput
        placeholderTextColor="#64748b"
        className="w-full bg-slate-900 border border-slate-850 p-4 rounded-xl text-white text-base"
        {...inputProps}
      />
    </View>
  );
}
