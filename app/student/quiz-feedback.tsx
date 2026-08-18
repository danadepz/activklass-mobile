import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { StatusBar } from 'expo-status-bar';

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

  const scorePct = Math.round((attempt.score / attempt.total_possible) * 100);
  const isPassed = scorePct >= 75;

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
          <Text className="text-white text-5xl font-black mt-3 font-sans">{attempt.score}/{attempt.total_possible}</Text>
          
          {/* Status Badge */}
          <View className={`px-4 py-1.5 rounded-full mt-4 border ${
            isPassed 
              ? 'bg-emerald-500/10 border-emerald-500/30' 
              : 'bg-amber-500/10 border-amber-500/30'
          }`}>
            <Text className={`text-xs font-bold uppercase ${isPassed ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isPassed ? 'Passed' : 'Needs Remediation'}
            </Text>
          </View>
          
          <Text className="text-slate-500 text-[10px] mt-3 font-semibold uppercase tracking-widest">{scorePct}% Overall Percentage</Text>
        </View>

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
              const studentAnswer = attempt.answers[q.id];
              let isCorrect = false;

              // Check if correct
              if (q.qtype === 'mcq') {
                const correctOpt = q.options?.find((opt: any) => opt.is_correct);
                isCorrect = correctOpt && studentAnswer === correctOpt.id;
              } else if (q.qtype === 'true_false') {
                const correctVal = q.answer_key?.value;
                const parsedAnswer = studentAnswer === 'True' ? true : studentAnswer === 'False' ? false : null;
                isCorrect = parsedAnswer === correctVal;
              } else if (q.qtype === 'short_answer') {
                const accepted = q.answer_key?.answers || [];
                const cleanAns = (studentAnswer || '').trim().toLowerCase();
                isCorrect = accepted.some((a: string) => a.trim().toLowerCase() === cleanAns);
              }

              // Get student response label
              let responseLabel = studentAnswer || 'No response';
              if (q.qtype === 'mcq' && studentAnswer) {
                const chosenOpt = q.options?.find((opt: any) => opt.id === studentAnswer);
                responseLabel = chosenOpt ? chosenOpt.text : studentAnswer;
              }

              // Get correct response label
              let correctLabel = '';
              if (q.qtype === 'mcq') {
                const correctOpt = q.options?.find((opt: any) => opt.is_correct);
                correctLabel = correctOpt ? correctOpt.text : '';
              } else if (q.qtype === 'true_false') {
                correctLabel = q.answer_key?.value ? 'True' : 'False';
              } else if (q.qtype === 'short_answer') {
                correctLabel = q.answer_key?.answers?.[0] || '';
              }

              return (
                <View key={q.id} className="bg-slate-900 border border-slate-850 p-5 rounded-2xl mt-4">
                  <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-slate-400 text-xs font-bold">Item {idx + 1}</Text>
                    
                    {q.qtype === 'essay' ? (
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
                    <Text className={`text-xs ${isCorrect ? 'text-emerald-400' : 'text-red-400'} font-semibold mt-0.5`}>
                      {responseLabel}
                    </Text>
                    
                    {!isCorrect && q.qtype !== 'essay' && (
                      <View className="mt-2 pt-2 border-t border-slate-900/60">
                        <Text className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Correct Answer:</Text>
                        <Text className="text-slate-300 text-xs font-semibold mt-0.5">
                          {correctLabel}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* AI Explanation Panel (only for incorrect objective answers) */}
                  {!isCorrect && q.qtype !== 'essay' && q.explanation && (
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
