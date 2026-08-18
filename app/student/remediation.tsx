import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView, Linking } from 'react-native';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../src/config/firebase';
import { StatusBar } from 'expo-status-bar';

interface RemediationItem {
  id: string;
  topic: string;
  class_id: string;
  created_at: any;
  confidence_score?: number;
  study_guides?: {
    title: string;
    description: string;
    resource_url?: string;
    type?: string; // 'video' | 'article' | 'pdf'
  }[];
}

export default function StudentRemediationIndex() {
  const [remediations, setRemediations] = useState<RemediationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const remQuery = query(
      collection(db, 'remediations'),
      where('student_id', '==', user.uid)
    );

    const unsubscribe = onSnapshot(remQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as RemediationItem[];
      setRemediations(list);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const openResource = (url?: string) => {
    if (!url) return;
    Linking.openURL(url).catch((err) => console.error("Couldn't open URL:", err));
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <StatusBar style="light" />
      <View className="flex-1 px-6 py-4">
        
        {/* Header */}
        <View className="mt-6 mb-6">
          <Text className="text-white text-3xl font-extrabold font-sans">
            Adaptive Remediation
          </Text>
          <Text className="text-slate-400 text-sm mt-2 font-sans">
            Personalized study guides and review resources compiled by AI to bridge diagnosed learning gaps.
          </Text>
        </View>

        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        ) : remediations.length === 0 ? (
          <View className="bg-slate-900/40 border border-slate-850 rounded-2xl p-8 items-center justify-center my-auto">
            <Text className="text-emerald-400 text-3xl mb-4">🏆</Text>
            <Text className="text-white text-base font-bold text-center">All Topics Mastered!</Text>
            <Text className="text-slate-500 text-xs text-center mt-2 leading-relaxed max-w-xs">
              Excellent job. There are currently no active remediation playlists or study guides assigned to your profile.
            </Text>
          </View>
        ) : (
          <ScrollView className="flex-1">
            <View className="space-y-6 mb-10">
              {remediations.map((rem) => (
                <View
                  key={rem.id}
                  className="bg-slate-900 border border-slate-850 p-5 rounded-2xl mt-4"
                >
                  <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-indigo-400 text-[10px] font-bold uppercase tracking-wider">Flagged Concept</Text>
                    {rem.confidence_score !== undefined && (
                      <View className="bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/25">
                        <Text className="text-amber-400 text-[9px] font-bold">Confidence: {rem.confidence_score}%</Text>
                      </View>
                    )}
                  </View>

                  <Text className="text-white text-lg font-bold font-sans">{rem.topic}</Text>
                  
                  {/* Playlist Guides */}
                  <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-5 mb-3">
                    Study Guides &amp; Materials
                  </Text>
                  
                  {rem.study_guides && rem.study_guides.length > 0 ? (
                    rem.study_guides.map((guide, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => openResource(guide.resource_url)}
                        activeOpacity={0.8}
                        className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl mt-3 flex-row justify-between items-center"
                      >
                        <View className="flex-1 pr-3">
                          <View className="flex-row items-center gap-2">
                            <Text className="text-[14px]">
                              {guide.type === 'video' ? '📺' : guide.type === 'pdf' ? '📄' : '📝'}
                            </Text>
                            <Text className="text-white text-xs font-bold font-sans">{guide.title}</Text>
                          </View>
                          <Text className="text-slate-500 text-[10px] mt-1.5 leading-normal">{guide.description}</Text>
                        </View>
                        {guide.resource_url && (
                          <Text className="text-indigo-400 text-xs font-bold">→</Text>
                        )}
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text className="text-slate-500 text-xs italic">Compiling guide contents...</Text>
                  )}

                </View>
              ))}
            </View>
          </ScrollView>
        )}

      </View>
    </SafeAreaView>
  );
}
