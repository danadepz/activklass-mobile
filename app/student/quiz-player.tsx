import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, SafeAreaView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../src/config/firebase';
import { StatusBar } from 'expo-status-bar';

export default function QuizPlayer() {
  const router = useRouter();
  const { quizId } = useLocalSearchParams();
  
  const [quiz, setQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  
  // Timer State
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (!quizId) return;

    const fetchQuiz = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'quizzes', quizId as string));
        if (docSnap.exists()) {
          const quizData = docSnap.data();
          setQuiz(quizData);
          setTimeLeft((quizData.time_limit_minutes || quizData.time_limit || 15) * 60);
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

  const handleSelectOption = (questionId: string, optionId: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: optionId }));
  };

  const handleTextAnswerChange = (questionId: string, text: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: text }));
  };

  // Grade quiz attempt (Objective items graded client-side in Firestore-direct spec)
  const gradeAttempt = () => {
    let score = 0;
    let totalPossible = 0;
    let hasEssays = false;
    
    quiz.questions.forEach((q: any) => {
      const studentAnswer = answers[q.id];
      totalPossible += q.points || 1;
      
      if (q.qtype === 'mcq') {
        const correctOpt = q.options.find((opt: any) => opt.is_correct);
        if (correctOpt && studentAnswer === correctOpt.id) {
          score += q.points || 1;
        }
      } else if (q.qtype === 'true_false') {
        const correctVal = q.answer_key?.value;
        // Parse student boolean if saved
        const parsedAnswer = studentAnswer === 'True' ? true : studentAnswer === 'False' ? false : null;
        if (parsedAnswer === correctVal) {
          score += q.points || 1;
        }
      } else if (q.qtype === 'short_answer') {
        const accepted = q.answer_key?.answers || [];
        const cleanAns = (studentAnswer || '').trim().toLowerCase();
        if (accepted.some((a: string) => a.trim().toLowerCase() === cleanAns)) {
          score += q.points || 1;
        }
      } else if (q.qtype === 'matching') {
        const pairs = q.answer_key?.pairs || [];
        // Map matching scores proportionally
        let correctCount = 0;
        pairs.forEach((p: any) => {
          if (studentAnswer?.[p.left] === p.right) {
            correctCount++;
          }
        });
        if (correctCount === pairs.length) {
          score += q.points || 2;
        }
      } else if (q.qtype === 'essay') {
        hasEssays = true;
      }
    });

    return { score, totalPossible, hasEssays };
  };

  const autoSubmit = async () => {
    await submitQuizAttempt(true);
  };

  const handleSubmitPress = () => {
    // Check if there are unanswered questions
    const unansweredCount = quiz.questions.filter((q: any) => !answers[q.id]).length;
    
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
    
    setLoading(true);
    
    const { score, totalPossible, hasEssays } = gradeAttempt();
    
    try {
      // Create quiz attempt document
      const attemptData = {
        quiz_id: quizId,
        class_id: quiz.class_id,
        student_id: user.uid,
        score,
        total_possible: totalPossible,
        score_ratio: score / totalPossible,
        module_id: quiz.module_id || 'm1',
        answers,
        submitted_at: serverTimestamp(),
        has_essays_pending: hasEssays,
        status: hasEssays ? 'submitted' : 'graded',
      };

      const docRef = await addDoc(collection(db, 'quiz_attempts'), attemptData);
      
      // Redirect to feedback page passing attempt ID
      router.replace({
        pathname: '/student/quiz-feedback',
        params: { attemptId: docRef.id }
      });
      
    } catch (e) {
      console.error('Error saving attempt:', e);
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

          {/* True / False Selection */}
          {currentQ.qtype === 'true_false' && ['True', 'False'].map((val) => (
            <TouchableOpacity
              key={val}
              onPress={() => handleSelectOption(currentQ.id, val)}
              className={`p-4 rounded-xl border flex-row items-center mt-3 ${
                answers[currentQ.id] === val 
                  ? 'bg-indigo-600/15 border-indigo-500' 
                  : 'bg-slate-900 border-slate-850'
              }`}
            >
              <Text className="text-white text-sm font-semibold">{val}</Text>
            </TouchableOpacity>
          ))}

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
