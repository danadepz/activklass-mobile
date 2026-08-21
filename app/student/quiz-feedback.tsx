import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { StatusBar } from 'expo-status-bar';
import {
  correctAnswerText,
  gradeQuiz,
  normaliseLegacyAnswers,
  studentAnswerText,
  PerQuestion,
} from '../../src/lib/quizGrading';
import { feedbackVisibility } from '../../src/lib/quizFeedback';
import { questionsOfAttempt } from '../../src/lib/quizPool';
import { finishedAttempts } from '../../src/lib/quizAttempts';

export default function QuizFeedback() {
  const router = useRouter();
  const { attemptId } = useLocalSearchParams();
  
  const [attempt, setAttempt] = useState<any>(null);
  const [quiz, setQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [attemptCount, setAttemptCount] = useState(1);

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

          /* How many attempts this student has *finished*, for the "release
             after their last attempt" rule. Counted rather than read off
             attempt_number: a deleted attempt would leave a gap there and
             unlock the results a try early. Finished only, because an attempt
             still being sat is not one they have used. Same query and same
             rule as the web page. */
          try {
            const priorSnap = await getDocs(
              query(
                collection(db, 'quiz_attempts'),
                where('quiz_id', '==', attemptData.quiz_id),
                where('student_id', '==', attemptData.student_id)
              )
            );
            const finished = finishedAttempts(priorSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
            setAttemptCount(Math.max(finished.length, attemptData.attempt_number ?? 1));
          } catch {
            setAttemptCount(attemptData.attempt_number ?? 1);
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
      <View className="flex-1 justify-center items-center bg-sunken">
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

  /* What this student may see, decided by the shared rule rather than by this
     screen. Note the legacy clause: before feedback settings existed, THIS
     file hid the breakdown whenever `prevent_backtracking` was on -- a rule
     the web page never had, so the same attempt showed different things on a
     phone and in a browser. Quizzes saved since carry `feedback_release` and
     obey it on both clients; quizzes that predate it keep the old mobile
     behaviour, so turning this on cannot suddenly reveal a breakdown a teacher
     had been relying on being hidden. */
  const visible = feedbackVisibility({ quiz, attemptCount });
  const legacyHidesBreakdown = quiz.feedback_release == null && Boolean(quiz.prevent_backtracking);
  const showItems = visible.showItems && !legacyHidesBreakdown;

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <StatusBar style="auto" />
      
      {/* Header */}
      <View className="px-6 pt-6 pb-4 border-b border-hairline bg-sunken">
        <Text className="text-accent-text text-xs font-bold uppercase tracking-wider">Assessment Feedback</Text>
        <Text className="text-ink text-xl font-bold font-sans mt-0.5" numberOfLines={1}>{quiz.title}</Text>
      </View>

      <ScrollView className="flex-1 px-6 py-4">
        
        {/* Score Summary Card */}
        <View className="bg-surface border border-hairline rounded-3xl p-6 mt-3 mb-6 items-center">
          <Text className="text-ink-muted text-xs font-bold uppercase tracking-wider text-center">
            {visible.showScore ? 'Your Final Marks' : 'Answers Submitted'}
          </Text>
          {visible.showScore ? (
            <Text className="text-ink text-5xl font-black mt-3 font-sans">{totalScore}/{attempt.total_possible}</Text>
          ) : (
            <Text className="text-ink-muted text-sm mt-3 text-center leading-relaxed">{visible.waitingOn}</Text>
          )}

          {/* Status Badge. An attempt with essays still in the teacher's queue is
              neither passed nor failed yet -- the same three-way descriptor the
              web feedback page shows. Hidden with the score: "Needs
              Remediation" states the result in words. */}
          {visible.showScore && (
          <View className={`px-4 py-1.5 rounded-full mt-4 border ${
            isPending
              ? 'bg-accent/10 border-accent/30'
              : isPassed
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-amber-500/10 border-amber-500/30'
          }`}>
            <Text className={`text-xs font-bold uppercase ${
              isPending ? 'text-accent-text' : isPassed ? 'text-success' : 'text-warning'
            }`}>
              {isPending ? 'Awaiting Essay Review' : isPassed ? 'Passed' : 'Needs Remediation'}
            </Text>
          </View>
          )}

          {visible.showScore && (
            <Text className="text-ink-faint text-[10px] mt-3 font-semibold uppercase tracking-widest">{scorePct}% Overall Percentage</Text>
          )}
        </View>

        {isPending && visible.showScore && (
          <View className="bg-indigo-950/20 border border-accent/30 p-4 rounded-xl mb-6">
            <Text className="text-ink-soft text-xs leading-relaxed">
              ⏳ <Text className="font-semibold text-ink-soft">Not final yet:</Text> your objective
              answers are graded automatically. Essay questions are awaiting your teacher&apos;s
              review, so your score may rise once they are marked.
            </Text>
          </View>
        )}

        {/* Says which of the two reasons the breakdown is missing, rather than
            leaving the screen looking truncated. */}
        {visible.showScore && !showItems && (
          <View className="bg-surface border border-hairline p-4 rounded-xl mb-6">
            <Text className="text-ink-muted text-xs leading-relaxed text-center">
              <Text className="font-semibold text-ink-soft">Detailed review hidden:</Text>{' '}
              {legacyHidesBreakdown
                ? 'Your instructor has hidden the per-question breakdown for this quiz.'
                : 'Your teacher is releasing the score for this quiz, not the per-question breakdown.'}
            </Text>
          </View>
        )}

        {/* Question Review List */}
        {showItems && (
          <View className="space-y-6 pb-12">
            <Text className="text-ink-soft text-xs font-bold uppercase tracking-wider mb-4">Question Breakdown</Text>
            
            {questionsOfAttempt(quiz, attempt).map((q: any, idx: number) => {
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
                <View key={q.id} className="bg-surface border border-hairline p-5 rounded-2xl mt-4">
                  <View className="flex-row justify-between items-center mb-3">
                    <View className="flex-row items-center">
                      <Text className="text-ink-muted text-xs font-bold">Item {idx + 1}</Text>
                      {/* Points earned, the same figure the web breakdown shows. */}
                      <Text className="text-ink-faint text-[10px] font-mono font-bold ml-2">
                        {earned}/{possible} pts
                      </Text>
                    </View>

                    {isPendingItem ? (
                      <View className="bg-accent/10 px-2 py-0.5 rounded">
                        <Text className="text-accent-text text-[9px] font-bold uppercase">Pending Essay Review</Text>
                      </View>
                    ) : (
                      <View className={`px-2.5 py-0.5 rounded ${isCorrect ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                        <Text className={`text-[9px] font-bold uppercase ${isCorrect ? 'text-success' : 'text-danger'}`}>
                          {isCorrect ? 'Correct' : 'Incorrect'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Question Text */}
                  <Text className="text-ink text-sm font-semibold font-sans mb-3">{q.text}</Text>

                  {/* Answers review */}
                  <View className="bg-sunken/40 p-3 rounded-xl border border-hairline space-y-1">
                    <Text className="text-ink-muted text-[10px] uppercase font-bold tracking-wider">Your Answer:</Text>
                    <Text
                      className={`text-xs font-semibold mt-0.5 ${
                        isPendingItem ? 'text-ink-soft' : isCorrect ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {responseLabel}
                    </Text>

                    {visible.showCorrectAnswers && !isCorrect && !isPendingItem && (
                      <View className="mt-2 pt-2 border-t border-hairline/60">
                        <Text className="text-ink-faint text-[10px] uppercase font-bold tracking-wider">Correct Answer:</Text>
                        <Text className="text-ink-soft text-xs font-semibold mt-0.5">
                          {correctLabel}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* AI Explanation Panel (only for incorrect objective answers).
                      On its own switch: the rationale restates the correct
                      answer in prose, so it must not ride on showCorrectAnswers. */}
                  {visible.showRationale && !isCorrect && !isPendingItem && q.explanation && (
                    <View className="bg-indigo-950/15 border border-accent/25 p-4 rounded-xl mt-4">
                      <Text className="text-accent-text text-[10px] font-black uppercase tracking-wider mb-2">
                        ✨ AI Concept Explanation
                      </Text>
                      <Text className="text-ink-soft text-xs leading-relaxed font-sans">
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
      <View className="px-6 py-4 bg-surface border-t border-hairline">
        <TouchableOpacity
          onPress={() => router.replace(`/student/class/${attempt.class_id}`)}
          className="w-full bg-accent py-4 rounded-xl items-center justify-center shadow-lg shadow-indigo-600/20"
        >
          <Text className="text-on-accent text-sm font-bold">See How This Affects My Grade</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}
