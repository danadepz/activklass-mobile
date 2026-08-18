import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { StatusBar } from 'expo-status-bar';
import {
  correctAnswerText,
  gradeQuiz,
  normaliseLegacyAnswers,
  studentAnswerText,
  PerQuestion,
} from '../../src/lib/quizGrading';

export default function QuizFeedback() {
  const router = useRouter();
  const { attemptId } = useLocalSearchParams();
  
  const [attempt, setAttempt] = useState<any>(null);
  const [quiz, setQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!attemptId) return;

    const fetchAttemptAndQuiz = async () => {
      try {
        const attemptSnap = await getDoc(doc(db, 'quiz_attempts', attemptId as string));
        if (attemptSnap.exists()) {
          const attemptData = attemptSnap.data();
          setAttempt(attemptData);

          const quizSnap = await getDoc(doc(db, 'quizzes', attemptData.quiz_id));
          if (quizSnap.exists()) {
            setQuiz(quizSnap.data());
          }
        } else {
          Alert.alert('Error', 'Quiz attempt details not found.');
          router.back();
        }
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'Failed to retrieve assessment feedback data.');
      } finally {
        setLoading(false);
      }
    };

    fetchAttemptAndQuiz();
  }, [attemptId]);

  if (loading || !attempt || !quiz) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-950">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  // total_score is the field the web feedback page and the teacher views read;
  // `score` is the older mirror, kept as a fallback for attempts written before
  // both names were stored.
  const totalScore = attempt.total_score ?? attempt.score ?? 0;
  const scorePct = Math.round((attempt.score_ratio ?? 0) * 100);
  const isPassed = scorePct >= 75;
  const isPending = Boolean(attempt.has_essays_pending);

  // The breakdown now comes from the attempt itself, exactly as the web page
  // reads it, so a phone and a browser show the same marks for the same
  // submission. Attempts written before per_question existed are re-graded here
  // from their stored answers -- legacy mobile encodings normalised first.
  const legacyAnswers = normaliseLegacyAnswers(quiz, attempt.answers);
  const perQuestion: PerQuestion[] = attempt.per_question?.length
    ? attempt.per_question
    : gradeQuiz(quiz, legacyAnswers).per_question;
  const byId: Record<string, PerQuestion> = Object.fromEntries(
    perQuestion.map((p) => [p.id, p])
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />
      
      {/* Header */}
      <View className="px-6 pt-6 pb-4 border-b border-slate-900 bg-slate-950">
        <Text className="text-indigo-400 text-xs font-bold uppercase tracking-wider">Assessment Feedback</Text>
        <Text className="text-white text-xl font-bold font-sans mt-0.5" numberOfLines={1}>{quiz.title}</Text>
      </View>

      <ScrollView className="flex-1 px-6 py-4">
        
        {/* Score Summary Card */}
        <View className="bg-slate-900 border border-slate-850 rounded-3xl p-6 mt-3 mb-6 items-center">
          <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider text-center">Your Final Marks</Text>
          <Text className="text-white text-5xl font-black mt-3 font-sans">{totalScore}/{attempt.total_possible}</Text>

          {/* Status Badge. An attempt with essays still in the teacher's queue is
              neither passed nor failed yet -- the same three-way descriptor the
              web feedback page shows. */}
          <View className={`px-4 py-1.5 rounded-full mt-4 border ${
            isPending
              ? 'bg-indigo-500/10 border-indigo-500/30'
              : isPassed
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-amber-500/10 border-amber-500/30'
          }`}>
            <Text className={`text-xs font-bold uppercase ${
              isPending ? 'text-indigo-400' : isPassed ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              {isPending ? 'Awaiting Essay Review' : isPassed ? 'Passed' : 'Needs Remediation'}
            </Text>
          </View>

          <Text className="text-slate-500 text-[10px] mt-3 font-semibold uppercase tracking-widest">{scorePct}% Overall Percentage</Text>
        </View>

        {isPending && (
          <View className="bg-indigo-950/20 border border-indigo-900/30 p-4 rounded-xl mb-6">
            <Text className="text-slate-300 text-xs leading-relaxed">
              ⏳ <Text className="font-semibold text-slate-200">Not final yet:</Text> your objective
              answers are graded automatically. Essay questions are awaiting your teacher&apos;s
              review, so your score may rise once they are marked.
            </Text>
          </View>
        )}

        {/* Warning notification regarding backtracking and review restrictions (Conditional) */}
        {quiz.prevent_backtracking && (
          <View className="bg-slate-900 border border-slate-850 p-4 rounded-xl mb-6">
            <Text className="text-slate-400 text-xs leading-relaxed text-center">
              ⚠️ <Text className="font-semibold text-slate-300">Detailed Review Hidden:</Text> Your instructor has disabled backtracking detailed review to protect question banks. Only high-level marks are visible.
            </Text>
          </View>
        )}

        {/* Question Review List (Conditional - only render if detailed review is permitted) */}
        {!quiz.prevent_backtracking && (
          <View className="space-y-6 pb-12">
            <Text className="text-slate-300 text-xs font-bold uppercase tracking-wider mb-4">Question Breakdown</Text>
            
            {quiz.questions.map((q: any, idx: number) => {
              // Marks come from the attempt's per_question row rather than being
              // recomputed here. Recomputing meant this screen and the web one
              // could disagree about the same submission, and it silently
              // treated matching and every unhandled type as wrong.
              const pq = byId[q.id];
              const isPendingItem = Boolean(pq?.pending);
              const isCorrect = Boolean(pq?.correct);
              const earned = pq?.earned ?? 0;
              const possible = pq?.possible ?? q.points ?? 0;

              const responseLabel = studentAnswerText(q, legacyAnswers[q.id]);
              const correctLabel = correctAnswerText(q);

              return (
                <View key={q.id} className="bg-slate-900 border border-slate-850 p-5 rounded-2xl mt-4">
                  <View className="flex-row justify-between items-center mb-3">
                    <View className="flex-row items-center">
                      <Text className="text-slate-400 text-xs font-bold">Item {idx + 1}</Text>
                      {/* Points earned, the same figure the web breakdown shows. */}
                      <Text className="text-slate-500 text-[10px] font-mono font-bold ml-2">
                        {earned}/{possible} pts
                      </Text>
                    </View>

                    {isPendingItem ? (
                      <View className="bg-indigo-600/10 px-2 py-0.5 rounded">
                        <Text className="text-indigo-400 text-[9px] font-bold uppercase">Pending Essay Review</Text>
                      </View>
                    ) : (
                      <View className={`px-2.5 py-0.5 rounded ${isCorrect ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                        <Text className={`text-[9px] font-bold uppercase ${isCorrect ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isCorrect ? 'Correct' : 'Incorrect'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Question Text */}
                  <Text className="text-white text-sm font-semibold font-sans mb-3">{q.text}</Text>

                  {/* Answers review */}
                  <View className="bg-slate-950/40 p-3 rounded-xl border border-slate-850 space-y-1">
                    <Text className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Your Answer:</Text>
                    <Text
                      className={`text-xs font-semibold mt-0.5 ${
                        isPendingItem ? 'text-slate-200' : isCorrect ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {responseLabel}
                    </Text>

                    {!isCorrect && !isPendingItem && (
                      <View className="mt-2 pt-2 border-t border-slate-900/60">
                        <Text className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Correct Answer:</Text>
                        <Text className="text-slate-300 text-xs font-semibold mt-0.5">
                          {correctLabel}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* AI Explanation Panel (only for incorrect objective answers) */}
                  {!isCorrect && !isPendingItem && q.explanation && (
                    <View className="bg-indigo-950/15 border border-indigo-900/25 p-4 rounded-xl mt-4">
                      <Text className="text-indigo-400 text-[10px] font-black uppercase tracking-wider mb-2">
                        ✨ AI Concept Explanation
                      </Text>
                      <Text className="text-slate-300 text-xs leading-relaxed font-sans">
                        {q.explanation}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

      </ScrollView>

      {/* Done Footer CTA */}
      <View className="px-6 py-4 bg-slate-900 border-t border-slate-800">
        <TouchableOpacity
          onPress={() => router.replace(`/student/class/${attempt.class_id}`)}
          className="w-full bg-indigo-600 py-4 rounded-xl items-center justify-center shadow-lg shadow-indigo-600/20"
        >
          <Text className="text-white text-sm font-bold">See How This Affects My Grade</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}
