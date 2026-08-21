import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  doc,
  getDoc,
  getDocs,
  query,
  where,
  collection,
} from 'firebase/firestore';
import { auth, db } from '../../src/config/firebase';
import { StatusBar } from 'expo-status-bar';
import { gradeQuiz, isAnswered, matchingChoices } from '../../src/lib/quizGrading';
import { questionsForAttempt, questionsForStudent } from '../../src/lib/quizPool';
import {
  attemptsAllowedFor,
  canStart,
  focusEvent,
  hasExpired,
  nextAttemptNumber,
  openAttempt,
  secondsRemaining,
  startBriefing,
} from '../../src/lib/quizAttempts';
import {
  finishAttempt,
  recordFocusEvent,
  saveAnswers,
  recordReopen,
  startAttempt,
} from '../../src/lib/attemptSession';
import { useThemeColors } from '../../src/theme';

/**
 * Why a student may not sit this quiz, or null.
 *
 * The decision itself comes from the shared `canStart` -- the same call the
 * web player makes -- so the two clients cannot drift on who is allowed to sit
 * what. Only the wording lives here.
 *
 * None of it is enforced by firestore.rules, which allows any student to
 * create an attempt under their own uid. This is a rule for honest use, the
 * same as it is on the web; server-side enforcement is a known follow-up.
 */
function gateFor(quiz: any, attempts: any[], studentId?: string): { title: string; message: string } | null {
  const decision = canStart({ quiz, attempts, studentId });
  if (decision.ok) return null;

  switch (decision.reason) {
    case 'not_assigned':
      return {
        title: 'Not assigned to you',
        message: 'Your teacher assigned this quiz to specific students, and you are not on the list.',
      };
    case 'not_open':
      return {
        title: 'Not open yet',
        message: `This quiz opens at ${new Date(quiz.opens_at).toLocaleString()}.`,
      };
    case 'closed':
      return { title: 'Quiz closed', message: 'The window for this quiz has passed.' };
    case 'no_attempts_left': {
      const allowed = attemptsAllowedFor(quiz, studentId);
      return {
        title: 'No attempts left',
        message: `You've used all ${allowed} attempt${allowed === 1 ? '' : 's'} for this quiz. Ask your teacher if you need another.`,
      };
    }
    default:
      return { title: 'Quiz unavailable', message: "This quiz isn't open right now." };
  }
}

export default function QuizPlayer() {
  const c = useThemeColors();
  const router = useRouter();
  const { quizId } = useLocalSearchParams();

  const [quiz, setQuiz] = useState<any>(null);
  /* Every attempt this student has on this quiz, open ones included. The count
     alone is no longer enough: an open attempt carries the deadline, the drawn
     paper and the reopen history. */
  const [attempts, setAttempts] = useState<any[]>([]);
  const [attempt, setAttempt] = useState<any>(null);
  const [starting, setStarting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  // Which attempt this is, counted the way the web player counts it: prior
  // attempts for this (quiz, student) + 1. The teacher history and the parent
  // quiz-scores endpoint both label rows by attempt_number.
  const [attemptNumber, setAttemptNumber] = useState(1);

  /* Why this student cannot sit the quiz right now, or null. The web player
     has always refused an unpublished quiz, one outside its open/close window,
     and one whose attempts are used up; this file refused none of them, so a
     student with a link could sit a closed quiz an unlimited number of times
     from their phone. The rules are mirrored from
     activklass-web/src/routes/student/quiz-player.jsx (windowState + the
     attempts check). */
  const [gate, setGate] = useState<{ title: string; message: string } | null>(null);

  // Timer State. null means the teacher set no time limit -- deliberately not
  // 0, because 0 is "time is up" and the countdown effect below auto-submits
  // on it. This used to default to 15 minutes when the field was absent, which
  // put a timer on every untimed quiz and auto-submitted it at 15:00.
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<any>(null);
  // One attempt document per submission. The timer and the Submit button can
  // both reach submitQuizAttempt, and two docs would share an attempt_number.
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!quizId) return;

    const fetchQuiz = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'quizzes', quizId as string));
        if (docSnap.exists()) {
          const quizData = docSnap.data();
          setQuiz(quizData);
          // `??`, not `||`: the teacher's stored value is the only source of
          // a time limit. `time_limit` is the older field name, still present
          // on quizzes written before the rename.
          const limitMinutes = quizData.time_limit_minutes ?? quizData.time_limit ?? null;
          setTimeLeft(limitMinutes != null ? Number(limitMinutes) * 60 : null);

          // Same query the web player runs, so the composite index and the
          // quiz_attempts read rule (own student_id) already cover it.
          const uid = auth.currentUser?.uid;
          if (uid) {
            const priorSnap = await getDocs(
              query(
                collection(db, 'quiz_attempts'),
                where('quiz_id', '==', quizId as string),
                where('student_id', '==', uid)
              )
            );
            const prior = priorSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setAttempts(prior);
            setAttemptNumber(nextAttemptNumber(prior));
            setAttempt(openAttempt(prior));
            setGate(gateFor(quizData, prior, uid));
          }
        } else {
          Alert.alert('Error', 'Quiz not found.');
          router.back();
        }
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'Failed to load quiz details.');
      } finally {
        setLoading(false);
      }
    };

    fetchQuiz();
  }, [quizId]);

  /* Countdown measured against the deadline the server stamped on the
     attempt, re-derived every tick rather than counted down from a number held
     in this component. Backgrounding the app, locking the screen or killing it
     entirely no longer buys time: reopening resumes at the right number.

     Reaching zero submits what the student has. */
  useEffect(() => {
    if (!attempt) return;
    const left = secondsRemaining(attempt);
    setTimeLeft(left);
    if (left === null || left <= 0) return;

    timerRef.current = setInterval(() => {
      const now = secondsRemaining(attempt);
      setTimeLeft(now);
      if (now !== null && now <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        /* Submit FIRST, then tell them.

           This used to be Alert.alert(..., [{ text: 'OK', onPress: () =>
           autoSubmit() }]), which is not an auto-submission: nothing was
           written until the student tapped OK. A student who had put the
           phone down, taken a call, or walked away at the wrong moment was
           left with an attempt stuck in_progress and every answer still only
           in React state -- and the deadline is anchored to the server clock,
           so the time was gone either way.

           The web player has always submitted without asking. A timer that
           ends the exam should not also require a tap to bank the work. */
        autoSubmit();
        Alert.alert('Time Up', 'Your time has run out. Your answers have been submitted.');
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [attempt]);

  /* An attempt whose deadline passed while the app was closed. Submitting on
     sight is the honest reading: the time was spent. */
  useEffect(() => {
    if (attempt && hasExpired(attempt) && !submittedRef.current) {
      submitQuizAttempt(true);
    }
  }, [attempt]);

  /* Returning to an attempt that was already open is a reopen. Recorded, not
     prevented -- a dropped connection and a deliberate walk-away look the same
     from here, and which it was is the teacher's call. */
  const reopenLogged = useRef(false);
  useEffect(() => {
    if (!attempt || reopenLogged.current) return;
    // Not when this screen just created it: beginAttempt sets the flag.
    if (justStartedRef.current) return;
    reopenLogged.current = true;
    recordReopen(attempt.id, {
      questionIndex: currentIdxRef.current,
      remainingSeconds: secondsRemaining(attempt),
    }).catch(() => { /* best effort: never interrupt a student mid-quiz */ });
  }, [attempt]);

  /* Leaving the app: switching to another app, locking the screen, or pulling
     down the notification shade. Recorded with the question that was on screen
     and how long they were gone.

     This is the phone equivalent of the browser's visibilitychange, and it has
     the same blind spots: it cannot see what they switched to, and it cannot
     see a second device or notes on paper. Evidence that attention left the
     app, and nothing more. */
  const awayRef = useRef<{ at: number; index: number } | null>(null);
  const focusCountRef = useRef(0);
  useEffect(() => {
    if (!attempt) return;
    focusCountRef.current = Array.isArray(attempt.focus_events) ? attempt.focus_events.length : 0;

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        const left = awayRef.current;
        awayRef.current = null;
        if (!left || submittedRef.current) return;
        recordFocusEvent(
          attempt.id,
          focusEvent({
            at: new Date(left.at).toISOString(),
            questionIndex: left.index,
            questionId: questionsRef.current[left.index]?.id ?? null,
            awayMs: Date.now() - left.at,
          }),
          focusCountRef.current,
        ).catch(() => {});
        focusCountRef.current += 1;
        return;
      }
      // 'background' and 'inactive' both mean the quiz is no longer in front
      // of the student. Only the first one starts the clock on being away.
      if (!awayRef.current) {
        awayRef.current = { at: Date.now(), index: currentIdxRef.current };
        /* Bank the work at the moment risk appears.

           This handler was already here, already writing to this document,
           already fired by exactly the events that lose an app: another app,
           a locked screen, an incoming call, the notification shade. It
           recorded that the student left and discarded what they had written.

           A deliberate exit is arguably the student's responsibility. Android
           reclaiming memory from a backgrounded app is not, and from in here
           the two are indistinguishable. */
        if (!submittedRef.current) {
          saveAnswers(attempt.id, answersRef.current).catch(() => {});
        }
      }
    });
    return () => sub.remove();
  }, [attempt]);

  /** An mcq option id, or a true_false boolean. */
  const handleSelectOption = (questionId: string, value: string | boolean) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleTextAnswerChange = (questionId: string, text: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: text }));
  };

  /** Keyed by row index, not by the left label. The web player and its grader
   *  both use the index; keying by label would make an attempt submitted here
   *  ungradable there. */
  const handleMatchingChange = (questionId: string, rowIndex: number, right: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: { ...(prev[questionId] ?? {}), [rowIndex]: right },
    }));
  };

  /* The paper this student sits: the pool draw, the question order and the
     option order, all derived from (quiz, student, attempt) by the same shared
     module the web player uses. Nothing here may use Math.random -- a student
     who starts on the web and finishes here has to be handed the same
     questions, and a reload has to return the same ones again. */
  /* The paper this student sits. Once an attempt is open it comes from the
     ids that attempt recorded at Start, so a teacher editing the quiz mid-quiz
     cannot change the questions under someone halfway through. Before that --
     on the briefing screen -- it is derived, only to count them. */
  const questions = useMemo(
    () =>
      attempt
        ? questionsForAttempt(quiz, attempt, { studentId: auth.currentUser?.uid })
        : questionsForStudent(quiz, { studentId: auth.currentUser?.uid, attemptNumber }),
    [quiz, attempt, attemptNumber],
  );

  /* Mirrors for the AppState and reopen listeners, which register once per
     attempt and would otherwise capture the first render's values forever. */
  const currentIdxRef = useRef(0);
  const questionsRef = useRef<any[]>(questions);
  const justStartedRef = useRef(false);
  /* answers needs the same mirror, and for a costlier reason than the other
     two. setAttempt runs exactly twice -- resuming a prior attempt, or
     creating one -- so `attempt` never changes while the student is typing,
     so the countdown effect keyed on [attempt] runs ONCE and freezes that
     render's submitQuizAttempt inside the Time Up alert. That render is the
     one where the attempt was set, when answers was still {}. Tapping OK on
     an expired timer therefore graded and saved an empty answer set: a zero,
     with everything the student had entered discarded. */
  const answersRef = useRef(answers);
  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);
  useEffect(() => { answersRef.current = answers; }, [answers]);

  /* Writes the attempt, then hands over to the player. Nothing exists in
     Firestore until this runs, which is what lets the briefing screen be a
     real decision rather than a notice. */
  async function beginAttempt() {
    const uid = auth.currentUser?.uid;
    if (!uid || !quiz) return;
    setStarting(true);
    try {
      justStartedRef.current = true;
      const created = await startAttempt({
        quiz: { ...quiz, id: quizId as string },
        classId: quiz.class_id ?? null,
        studentId: uid,
        questions,
        attemptNumber,
      });
      setAttempt(created);
      setAttempts((prev) => [...prev, created]);
    } catch (e) {
      justStartedRef.current = false;
      console.error(e);
      Alert.alert('Could not start', 'The attempt could not be opened. Check your connection and try again.');
    } finally {
      setStarting(false);
    }
  }

  const autoSubmit = async () => {
    await submitQuizAttempt(true);
  };

  const handleSubmitPress = () => {
    // isAnswered, not truthiness: `false` is a real true_false answer, and a
    // plain `!answers[q.id]` counted a deliberate "False" as a skip.
    const unansweredCount = questions.filter((q: any) => !isAnswered(q, answers[q.id])).length;

    let confirmMsg = 'Are you sure you want to submit your assessment?';
    if (unansweredCount > 0) {
      confirmMsg = `You have ${unansweredCount} unanswered questions. Are you sure you want to submit?`;
    }

    Alert.alert('Submit Assessment', confirmMsg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Submit', onPress: () => submitQuizAttempt(false) }
    ]);
  };

  const submitQuizAttempt = async (isAuto = false) => {
    const user = auth.currentUser;
    if (!user || !quiz || !attempt) return;
    // One document per submission. The expired-timer alert and the Submit
    // button can both land here, and a second document would carry a duplicate
    // attempt_number and double-count in the teacher's averages.
    if (submittedRef.current) return;
    submittedRef.current = true;

    setLoading(true);

    // src/lib/quizGrading is the shared grader, deliberately the only one: this
    // file used to grade matching all-or-nothing while the web gave
    // proportional credit, so the same answers earned a different mark
    // depending on the device.
    // The drawn paper, not the whole pool: grading `quiz` directly would mark
    // a pooled student against questions they never saw.
    // answersRef, not `answers`: the expired-timer path reaches here through a
    // closure frozen at the render where the attempt was created. The ref is
    // always current, and for the manual Submit button the two are identical.
    const submitted = answersRef.current;
    const graded = gradeQuiz({ ...quiz, questions }, submitted);

    try {
      /* Closes the attempt that already exists rather than creating one. The
         document was written when Start was pressed -- that is what anchors
         the deadline to the server clock instead of to whenever this screen
         opened, and what gives reopens and away-events somewhere to live.

         `finishAttempt` writes both `score` and `total_score`: the first is
         the documented field, the second is what every teacher-side view
         actually reads (scaffold mastery, quiz results, class history). */
      await finishAttempt(attempt.id, {
        result: graded,
        answers: submitted,
        expired: hasExpired(attempt),
      });

      router.replace({
        pathname: '/student/quiz-feedback',
        params: { attemptId: attempt.id },
      });
    } catch (e) {
      console.error('Error saving attempt:', e);
      submittedRef.current = false;
      /* The security rule refuses an update once the attempt is no longer
         `in_progress`, so a teacher discarding it arrives here as a
         permissions error. Naming the real reason is worth one extra read. */
      let message = 'Your answers could not be saved. Check your connection and try again.';
      try {
        const check = await getDoc(doc(db, 'quiz_attempts', attempt.id));
        const status = check.data()?.status;
        if (status === 'discarded') {
          message = 'Your teacher ended this attempt. Nothing was saved — go back to your class and start again.';
        } else if (status && status !== 'in_progress') {
          message = 'This attempt has already been submitted. Check your results from your class page.';
        }
      } catch {
        /* Keep the connection message. */
      }
      Alert.alert('Submission Failed', message);
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // `loading || !quiz`, not `loading && !quiz`: the paper above is seeded on
  // attemptNumber, which is resolved during the same load. Rendering before it
  // settles would show one paper and then swap it. It also stops a second tap
  // reaching Submit while the first is still writing.
  if (loading || !quiz) {
    return (
      <View className="flex-1 justify-center items-center bg-sunken">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (gate) {
    return (
      <SafeAreaView className="flex-1 bg-canvas">
        <StatusBar style="auto" />
        <View className="flex-1 justify-center px-8">
          <View className="bg-surface border border-hairline rounded-2xl p-6">
            <Text className="text-ink text-lg font-bold font-sans">{gate.title}</Text>
            <Text className="text-ink-muted text-sm mt-2 leading-relaxed">{gate.message}</Text>
            <TouchableOpacity onPress={() => router.back()} className="mt-5 px-5 py-3 bg-accent rounded-xl self-start">
              <Text className="text-on-accent text-xs font-bold">Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  /* The rules, then a green Start.
     This screen exists because the clock is now real: once Start is pressed
     the attempt is written and the deadline is fixed on the server, so closing
     the app no longer stops it. That is only fair if the student was told
     first. The rules come from the shared `startBriefing`, so they are the
     same sentences the web shows. */
  if (!attempt) {
    const rules = startBriefing({
      quiz,
      attempts,
      studentId: auth.currentUser?.uid,
      drawCount: quiz.pool_enabled ? questions.length : null,
    });
    return (
      <SafeAreaView className="flex-1 bg-canvas">
        <StatusBar style="auto" />
        <ScrollView className="flex-1 px-6 py-6">
          <View className="bg-surface border border-hairline rounded-2xl overflow-hidden">
            <View className="px-5 py-5 bg-sunken border-b border-hairline">
              <Text className="text-accent-text text-[10px] font-bold uppercase tracking-widest">
                Before you start
              </Text>
              <Text className="text-ink text-xl font-bold font-sans mt-1">{quiz.title}</Text>
            </View>
            {rules.map((rule) => (
              <View key={rule.key} className="px-5 py-4 border-b border-hairline">
                <Text className="text-ink text-sm font-bold">{rule.label}</Text>
                <Text className="text-ink-muted text-xs mt-1 leading-relaxed">{rule.detail}</Text>
              </View>
            ))}
            <View className="px-5 py-5">
              <TouchableOpacity
                onPress={beginAttempt}
                disabled={starting}
                className={`py-4 rounded-xl items-center ${starting ? 'opacity-60' : ''}`}
                style={{ backgroundColor: '#1F8A5B' }}
              >
                <Text className="text-white text-base font-bold">
                  {starting ? 'Starting…' : 'Start'}
                </Text>
              </TouchableOpacity>
              <Text className="text-ink-faint text-[11px] text-center mt-3">
                Your timer begins the moment you press this.
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const currentQ = questions[currentIdx];

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <StatusBar style="auto" />
      
      {/* Quiz Header & Timer */}
      <View className="px-6 pt-6 pb-4 border-b border-hairline flex-row justify-between items-center bg-sunken">
        <View className="flex-1 pr-3">
          <Text className="text-accent-text text-[10px] font-bold uppercase tracking-wider">Assessment Player</Text>
          <Text className="text-ink text-lg font-bold font-sans mt-0.5" numberOfLines={1}>{quiz.title}</Text>
        </View>
        {timeLeft !== null && (
          <View className="bg-surface border border-hairline px-4 py-2 rounded-xl">
            <Text className="text-warning font-mono font-bold text-sm">{formatTime(timeLeft)}</Text>
          </View>
        )}
      </View>

      <ScrollView className="flex-1 px-6 py-4">
        
        {/* Question Counter Card */}
        <View className="bg-surface border border-hairline p-4 rounded-2xl flex-row justify-between items-center mb-6 mt-3">
          <Text className="text-ink-muted text-xs font-bold">Question {currentIdx + 1} of {questions.length}</Text>
          <View className="bg-accent/10 px-3 py-1 rounded-lg">
            <Text className="text-accent-text text-[10px] font-bold">{currentQ.points || 1} Points</Text>
          </View>
        </View>

        {/* Question Text block */}
        <View className="bg-surface border border-hairline p-5 rounded-2xl mb-6">
          <Text className="text-ink text-base leading-relaxed font-sans">{currentQ.text}</Text>
        </View>

        {/* Dynamic Question Render Block based on Type */}
        <View className="space-y-4 pb-12">
          
          {/* MCQ Option Selectors */}
          {currentQ.qtype === 'mcq' && currentQ.options?.map((opt: any) => (
            <TouchableOpacity
              key={opt.id}
              onPress={() => handleSelectOption(currentQ.id, opt.id)}
              className={`p-4 rounded-xl border flex-row items-center mt-3 ${
                answers[currentQ.id] === opt.id 
                  ? 'bg-accent/15 border-accent' 
                  : 'bg-surface border-hairline'
              }`}
            >
              <View className={`w-5 h-5 rounded-full border items-center justify-center mr-3 ${
                answers[currentQ.id] === opt.id ? 'border-accent' : 'border-hairline-strong'
              }`}>
                {answers[currentQ.id] === opt.id && (
                  <View className="w-2.5 h-2.5 rounded-full bg-accent" />
                )}
              </View>
              <Text className="text-ink-soft text-sm flex-1">{opt.text}</Text>
            </TouchableOpacity>
          ))}

          {/* True / False Selection.
              Stores a BOOLEAN, not the label. The web grader accepts a
              true_false answer only when `typeof answer === 'boolean'`, and its
              feedback page renders anything else as "no answer" -- which is why
              a mobile true_false answer used to vanish from the web breakdown. */}
          {currentQ.qtype === 'true_false' && [true, false].map((val) => (
            <TouchableOpacity
              key={String(val)}
              onPress={() => handleSelectOption(currentQ.id, val)}
              className={`p-4 rounded-xl border flex-row items-center mt-3 ${
                answers[currentQ.id] === val
                  ? 'bg-accent/15 border-accent'
                  : 'bg-surface border-hairline'
              }`}
            >
              <Text className="text-on-accent text-sm font-semibold">{val ? 'True' : 'False'}</Text>
            </TouchableOpacity>
          ))}

          {/* Matching — one row per left item, tap a right option to pair it.
              Answers are keyed by ROW INDEX, matching the web player, so an
              attempt submitted here grades and renders identically there.
              Chips rather than a picker: React Native has no <select>. */}
          {currentQ.qtype === 'matching' && (
            <View className="mt-2">
              <Text className="text-ink-muted text-xs mb-2">Tap an option to pair it with each item:</Text>
              {(currentQ.answer_key?.pairs ?? []).map((pair: any, rowIndex: number) => {
                const chosen = answers[currentQ.id]?.[rowIndex];
                return (
                  <View key={rowIndex} className="bg-surface border border-hairline rounded-xl p-3 mb-2">
                    <Text className="text-ink-soft text-sm mb-2">{pair.left}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {matchingChoices(currentQ).map((choice: string) => (
                        <TouchableOpacity
                          key={choice}
                          onPress={() => handleMatchingChange(currentQ.id, rowIndex, choice)}
                          className={`px-3 py-2 rounded-lg border ${
                            chosen === choice
                              ? 'bg-accent/20 border-accent'
                              : 'bg-sunken border-hairline'
                          }`}
                        >
                          <Text className={chosen === choice ? 'text-indigo-300 text-xs font-semibold' : 'text-ink-muted text-xs'}>
                            {choice}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Short Answer Inputs */}
          {currentQ.qtype === 'short_answer' && (
            <View className="mt-2">
              <Text className="text-ink-muted text-xs mb-2">Type your answer below:</Text>
              <TextInput
                value={answers[currentQ.id] || ''}
                onChangeText={(text) => handleTextAnswerChange(currentQ.id, text)}
                placeholder="Enter response..."
                placeholderTextColor={c.inkFaint}
                className="w-full bg-surface border border-hairline p-4 rounded-xl text-ink text-sm focus:border-accent"
              />
            </View>
          )}

          {/* Essay Areas */}
          {currentQ.qtype === 'essay' && (
            <View className="mt-2">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-ink-muted text-xs">Write your essay response below:</Text>
                <Text className="text-ink-faint text-[10px]">
                  Words: {(answers[currentQ.id] || '').split(/\s+/).filter(Boolean).length}
                </Text>
              </View>
              <TextInput
                value={answers[currentQ.id] || ''}
                onChangeText={(text) => handleTextAnswerChange(currentQ.id, text)}
                placeholder="Write response (AI grading assist configured)..."
                placeholderTextColor={c.inkFaint}
                multiline
                numberOfLines={8}
                style={{ textAlignVertical: 'top' }}
                className="w-full bg-surface border border-hairline p-4 rounded-xl text-ink text-sm focus:border-accent"
              />
            </View>
          )}

        </View>

      </ScrollView>

      {/* Question Footer Navigation Controls */}
      <View className="px-6 py-4 bg-surface border-t border-hairline flex-row justify-between items-center">
        {/* prevent_backtracking was read by neither the button nor anything
            else in this file: a teacher could switch it on, see it respected on
            the web, and have every phone ignore it. */}
        {quiz.prevent_backtracking ? (
          <View className="px-4 py-3">
            <Text className="text-ink-faint text-[11px]">No going back</Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
            disabled={currentIdx === 0}
            className={`px-4 py-3 rounded-xl border border-hairline ${currentIdx === 0 ? 'opacity-40' : ''}`}
          >
            <Text className="text-ink-soft text-xs font-semibold">Previous</Text>
          </TouchableOpacity>
        )}

        {currentIdx < questions.length - 1 ? (
          <TouchableOpacity
            onPress={() => setCurrentIdx(prev => prev + 1)}
            className="px-6 py-3 bg-sunken border border-hairline rounded-xl"
          >
            <Text className="text-ink text-xs font-semibold">Next Question</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleSubmitPress}
            className="px-6 py-3 bg-accent rounded-xl shadow-md shadow-indigo-600/20"
          >
            <Text className="text-on-accent text-xs font-bold">Submit Quiz</Text>
          </TouchableOpacity>
        )}
      </View>

    </SafeAreaView>
  );
}
