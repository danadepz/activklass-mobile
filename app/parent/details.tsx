import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../../src/config/firebase';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../src/context/AuthContext';
import {
  GuardianCodeError,
  createGuardianLink,
  lookupGuardianCode,
} from '../../src/lib/guardianCodes';
import { useThemeColors } from '../../src/theme';

/**
 * Step 2 of guardian sign-up: the guardian's own details, then the link.
 *
 * Guardians register with their OWN email and choose their own password. The
 * version before this minted p-<student_number>@activklass.com with a generated
 * temporary password, which allowed exactly one guardian per student — the
 * whole point of code-based linking is that a student can connect several.
 *
 * Order matters: create the Auth account, write the Firestore profile with
 * role 'parent', then write the link. firestore.rules checks `isParent()` by
 * reading users/{uid}, so the profile has to exist and be committed before the
 * link write is attempted or it is denied.
 */
export default function ParentDetailsScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { refreshProfile } = useAuth();

  const inviteCode = String(params.inviteCode ?? '');
  const studentName = String(params.studentName ?? '');
  const gradeLevel = String(params.gradeLevel ?? '');
  const studentNumber = String(params.studentNumber ?? '');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
    if (password !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    if (!inviteCode) {
      setError('Missing your child’s code. Go back and enter it again.');
      return;
    }

    setLoading(true);
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

    try {
      // 1. Create the guardian's own Firebase Auth account. This also signs
      //    them in, which every write below depends on.
      const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const parentUid = credential.user.uid;

      // 2. Firestore profile. role: 'parent' is what the security rules read to
      //    let the link write through, so this must land first.
      await setDoc(doc(db, 'users', parentUid), {
        id: parentUid,
        email: cleanEmail,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        middle_name: middleName.trim() || null,
        role: 'parent',
        status: 'active',
        contact_number: contactNumber.trim(),
      });

      // 3. Re-read the code rather than trusting what step 1 passed through.
      //    A student can rotate their code between the two screens, and the
      //    minor/adult flag decides whether this link unlocks immediately.
      const codeDoc = await lookupGuardianCode(inviteCode);
      const link = await createGuardianLink(
        codeDoc,
        { uid: parentUid, name: fullName, email: cleanEmail },
        relationship
      );

      // The context still holds 'signed_out' from before the account existed;
      // the dashboard reads role off it, so refresh before navigating.
      await refreshProfile();

      router.replace({
        pathname: '/parent/confirm',
        params: {
          email: cleanEmail,
          linkStatus: link.status,
          studentName: codeDoc.student_name,
        },
      });
    } catch (err: any) {
      console.error('[ParentDetails] Error registering guardian:', err);

      if (err?.code === 'auth/email-already-in-use') {
        setError('That email already has an account. Sign in instead, then use “+ Add Child”.');
      } else if (err?.code === 'auth/invalid-email') {
        setError('That email address is not valid.');
      } else if (err?.code === 'auth/weak-password') {
        setError('Please choose a stronger password.');
      } else if (auth.currentUser) {
        /* The account exists but the link did not land — a rotated code, or a
           rules rejection. Do not strand them here with an account they cannot
           see: send them to the dashboard, where "+ Add Child" retries the
           code against the same validation. */
        const reason =
          err instanceof GuardianCodeError ? err.message : 'That code could not be redeemed.';
        setError(
          `${reason} Your account was created — continue to your dashboard and add your child there.`
        );
      } else {
        setError('Sign-up failed. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Set once the account exists but linking failed, so the dead-end above has
  // a way out that does not involve creating a second account.
  const accountCreated = !!auth.currentUser && !!error;

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <StatusBar style="auto" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView className="px-6 py-10" keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            onPress={() => router.back()}
            className="self-start w-10 h-10 items-center justify-center bg-surface border border-hairline rounded-xl mb-6"
          >
            <Text className="text-ink text-lg font-bold">←</Text>
          </TouchableOpacity>

          <View className="mb-6">
            <Text className="text-accent-text text-xs font-bold uppercase tracking-widest mb-2">
              Step 2 of 2
            </Text>
            <Text className="text-ink text-3xl font-extrabold font-sans">Guardian Details</Text>
            <Text className="text-ink-muted text-sm mt-2 font-sans leading-relaxed">
              Create your account. You will sign in with this email from now on.
            </Text>

            {inviteCode ? (
              <View className="bg-surface border border-hairline rounded-2xl px-4 py-4 mt-4">
                <Text className="text-ink-faint text-[10px] font-bold uppercase tracking-widest">
                  Connecting to
                </Text>
                <View className="flex-row justify-between items-center mt-2">
                  <View className="flex-1 pr-3">
                    <Text className="text-ink text-base font-bold">
                      {studentName || 'Your child'}
                    </Text>
                    <Text className="text-ink-faint text-[10px] mt-1">
                      {gradeLevel ? `${gradeLevel} · ` : ''}
                      {studentNumber ? `ID ${studentNumber}` : 'Student'}
                    </Text>
                  </View>
                  <Text className="text-accent-text text-sm font-extrabold font-mono tracking-widest">
                    {inviteCode}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {error && (
            <View className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl mb-4">
              <Text className="text-danger text-xs font-semibold leading-relaxed">{error}</Text>
              {accountCreated && (
                <TouchableOpacity
                  onPress={() => router.replace('/parent/dashboard')}
                  className="bg-surface border border-hairline rounded-xl px-4 py-3 mt-3 self-start"
                >
                  <Text className="text-ink-soft text-xs font-bold">Go to my dashboard →</Text>
                </TouchableOpacity>
              )}
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
              autoCorrect={false}
              placeholder="you@example.com"
            />
            <Field
              label="Password *"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="At least 6 characters"
            />
            <Field
              label="Confirm password *"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
            />
            <Field
              label="Contact number *"
              value={contactNumber}
              onChangeText={setContactNumber}
              keyboardType="phone-pad"
              placeholder="09XX XXX XXXX"
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
            className={`w-full py-4 rounded-xl items-center justify-center mt-6 mb-10 ${
              loading ? 'bg-accent/50' : 'bg-accent'
            }`}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text className="text-ink text-base font-bold font-sans">
                Create Account &amp; Link
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  ...inputProps
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  // Its own call: this Field lives outside the screen component, so the
  // palette is not in scope from there.
  const c = useThemeColors();
  return (
    <View className="mb-4">
      <Text className="text-ink-soft text-xs font-bold mb-2 uppercase tracking-wider">{label}</Text>
      <TextInput
        placeholderTextColor={c.inkFaint}
        className="w-full bg-surface border border-hairline p-4 rounded-xl text-ink text-base"
        {...inputProps}
      />
    </View>
  );
}
