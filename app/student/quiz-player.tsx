import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, SafeAreaView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  doc,
  getDoc,
  getDocs,
  query,
  where,
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../../src/config/firebase';
import { StatusBar } from 'expo-status-bar';
import { gradeQuiz, isAnswered, matchingChoices } from '../../src/lib/quizGrading';

export default function QuizPlayer() {
  const router = useRouter();
  const { quizId } = useLocalSearchParams();

  const [quiz, setQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  // Which attempt this is, counted the way the web player counts it: prior
  // attempts for this (quiz, student) + 1. The teacher history and the parent
  // quiz-scores endpoint both label rows by attempt_number.
  const [attemptNumber, setAttemptNumber] = useState(1);

  // Timer State
  const [timeLeft, setTimeLeft] = useState(0);
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
          setTimeLeft((quizData.time_limit_minutes || quizData.time_limit || 15) * 60);

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
            setAttemptNumber(priorSnap.size + 1);
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

  // Start Count-down timer
  useEffect(() => {
    if (timeLeft <= 0 || loading || !quiz) {
      if (timeLeft === 0 && quiz && !loading) {
        Alert.alert('Time Up', 'Your quiz timer has expired. Submitting your current answers.', [
          { text: 'OK', onPress: () => autoSubmit() }
        ]);
      }
      return;
    }

    timerRef.current = setTimeout(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeLeft, loading, quiz]);

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

  const autoSubmit = async () => {
    await submitQuizAttempt(true);
  };

  const handleSubmitPress = () => {
    // isAnswered, not truthiness: `false` is a real true_false answer, and a
    // plain `!answers[q.id]` counted a deliberate "False" as a skip.
    const unansweredCount = quiz.questions.filter((q: any) => !isAnswered(q, answers[q.id])).length;

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
    if (!user || !quiz) return;
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
    const graded = gradeQuiz(quiz, answers);

    try {
      // Create quiz attempt document
      const attemptData = {
        quiz_id: quizId,
        class_id: quiz.class_id,
        student_id: user.uid,
        // Both names are required. `score` is the documented quiz_attempts
        // field; `total_score` is what every teacher-side view actually reads
        // (scaffolds mastery, quiz results stats, class history). Writing only
        // `score` makes a mobile attempt invisible to the teacher -- it is
        // skipped outright by the mastery calculation.
        score: graded.total_score,
        total_score: graded.total_score,
        total_possible: graded.total_possible,
        score_ratio: graded.score_ratio,
        // No 'm1' fallback: inventing a module id files the attempt against a
        // unit the quiz may not belong to, and the scaffold mastery figures are
        // grouped by it. Unknown is null.
        module_id: quiz.module_id ?? null,
        answers,
        // Read by the web feedback screen to show the per-item breakdown.
        per_question: graded.per_question,
        // Which try this is. The web player records it; without it a retake is
        // indistinguishable from a first attempt in the teacher's results view.
        attempt_number: attemptNumber,
        submitted_at: serverTimestamp(),
        has_essays_pending: graded.has_essays,
        status: graded.has_essays ? 'submitted' : 'graded',
      };

      const docRef = await addDoc(collection(db, 'quiz_attempts'), attemptData);
      
      // Redirect to feedback page passing attempt ID
      router.replace({
        pathname: '/student/quiz-feedback',
        params: { attemptId: docRef.id }
      });
      
    } catch (e) {
      console.error('Error saving attempt:', e);
      // Nothing was written, so let them try again.
      submittedRef.current = false;
      Alert.alert('Submission Failed', 'Firestore rules blocked attempt logging.');
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (loading && !quiz) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-950">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const currentQ = quiz.questions[currentIdx];

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />
      
      {/* Quiz Header & Timer */}
      <View className="px-6 pt-6 pb-4 border-b border-slate-900 flex-row justify-between items-center bg-slate-950">
        <View className="flex-1 pr-3">
          <Text className="text-indigo-400 text-[10px] font-bold uppercase tracking-wider">Assessment Player</Text>
          <Text className="text-white text-lg font-bold font-sans mt-0.5" numberOfLines={1}>{quiz.title}</Text>
        </View>
        <View className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl">
          <Text className="text-amber-400 font-mono font-bold text-sm">{formatTime(timeLeft)}</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-6 py-4">
        
        {/* Question Counter Card */}
        <View className="bg-slate-900 border border-slate-850 p-4 rounded-2xl flex-row justify-between items-center mb-6 mt-3">
          <Text className="text-slate-400 text-xs font-bold">Question {currentIdx + 1} of {quiz.questions.length}</Text>
          <View className="bg-indigo-600/10 px-3 py-1 rounded-lg">
            <Text className="text-indigo-400 text-[10px] font-bold">{currentQ.points || 1} Points</Text>
          </View>
        </View>

        {/* Question Text block */}
        <View className="bg-slate-900 border border-slate-850 p-5 rounded-2xl mb-6">
          <Text className="text-white text-base leading-relaxed font-sans">{currentQ.text}</Text>
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
                  ? 'bg-indigo-600/15 border-indigo-500' 
                  : 'bg-slate-900 border-slate-850'
              }`}
            >
              <View className={`w-5 h-5 rounded-full border items-center justify-center mr-3 ${
                answers[currentQ.id] === opt.id ? 'border-indigo-500' : 'border-slate-700'
              }`}>
                {answers[currentQ.id] === opt.id && (
                  <View className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                )}
              </View>
              <Text className="text-slate-200 text-sm flex-1">{opt.text}</Text>
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
                  ? 'bg-indigo-600/15 border-indigo-500'
                  : 'bg-slate-900 border-slate-850'
              }`}
            >
              <Text className="text-white text-sm font-semibold">{val ? 'True' : 'False'}</Text>
            </TouchableOpacity>
          ))}

          {/* Matching — one row per left item, tap a right option to pair it.
              Answers are keyed by ROW INDEX, matching the web player, so an
              attempt submitted here grades and renders identically there.
              Chips rather than a picker: React Native has no <select>. */}
          {currentQ.qtype === 'matching' && (
            <View className="mt-2">
              <Text className="text-slate-400 text-xs mb-2">Tap an option to pair it with each item:</Text>
              {(currentQ.answer_key?.pairs ?? []).map((pair: any, rowIndex: number) => {
                const chosen = answers[currentQ.id]?.[rowIndex];
                return (
                  <View key={rowIndex} className="bg-slate-900 border border-slate-850 rounded-xl p-3 mb-2">
                    <Text className="text-slate-200 text-sm mb-2">{pair.left}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {matchingChoices(currentQ).map((choice: string) => (
                        <TouchableOpacity
                          key={choice}
                          onPress={() => handleMatchingChange(currentQ.id, rowIndex, choice)}
                          className={`px-3 py-2 rounded-lg border ${
                            chosen === choice
                              ? 'bg-indigo-600/20 border-indigo-500'
                              : 'bg-slate-950 border-slate-800'
                          }`}
                        >
                          <Text className={chosen === choice ? 'text-indigo-300 text-xs font-semibold' : 'text-slate-400 text-xs'}>
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
              <Text className="text-slate-400 text-xs mb-2">Type your answer below:</Text>
              <TextInput
                value={answers[currentQ.id] || ''}
                onChangeText={(text) => handleTextAnswerChange(currentQ.id, text)}
                placeholder="Enter response..."
                placeholderTextColor="#64748b"
                className="w-full bg-slate-900 border border-slate-850 p-4 rounded-xl text-white text-sm focus:border-indigo-500"
              />
            </View>
          )}

          {/* Essay Areas */}
          {currentQ.qtype === 'essay' && (
            <View className="mt-2">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-slate-400 text-xs">Write your essay response below:</Text>
                <Text className="text-slate-500 text-[10px]">
                  Words: {(answers[currentQ.id] || '').split(/\s+/).filter(Boolean).length}
                </Text>
              </View>
              <TextInput
                value={answers[currentQ.id] || ''}
                onChangeText={(text) => handleTextAnswerChange(currentQ.id, text)}
                placeholder="Write response (AI grading assist configured)..."
                placeholderTextColor="#64748b"
                multiline
                numberOfLines={8}
                style={{ textAlignVertical: 'top' }}
                className="w-full bg-slate-900 border border-slate-850 p-4 rounded-xl text-white text-sm focus:border-indigo-500"
              />
            </View>
          )}

        </View>

      </ScrollView>

      {/* Question Footer Navigation Controls */}
      <View className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex-row justify-between items-center">
        <TouchableOpacity
          onPress={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
          disabled={currentIdx === 0}
          className={`px-4 py-3 rounded-xl border border-slate-800 ${currentIdx === 0 ? 'opacity-40' : ''}`}
        >
          <Text className="text-slate-300 text-xs font-semibold">Previous</Text>
        </TouchableOpacity>

        {currentIdx < quiz.questions.length - 1 ? (
          <TouchableOpacity
            onPress={() => setCurrentIdx(prev => prev + 1)}
            className="px-6 py-3 bg-slate-950 border border-slate-800 rounded-xl"
          >
            <Text className="text-white text-xs font-semibold">Next Question</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleSubmitPress}
            className="px-6 py-3 bg-indigo-600 rounded-xl shadow-md shadow-indigo-600/20"
          >
            <Text className="text-white text-xs font-bold">Submit Quiz</Text>
          </TouchableOpacity>
        )}
      </View>

    </SafeAreaView>
  );
}
