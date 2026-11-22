import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { predictRisk, riskReasons, READABLE_FEATURE, RiskResult } from '../lib/risk';
import {
  attendanceTrendFromLog,
  missedQuizCounts,
  missingRate,
  missingWorkCountsFromEntry,
  quizDueDates,
  quizTrendFromAttempts,
} from '../lib/riskSignals';

interface ClassStandingForecastProps {
  studentId?: string;
  grade?: number | null;
  attendanceRate?: number | null;
  quizAverage?: number | null;
  attendanceLog?: any[];
  attempts?: any[];
  assessments?: any[];
  quizzes?: any[];
  attemptedQuizIds?: Set<string>;
}

export default function ClassStandingForecast({
  studentId,
  grade,
  attendanceRate,
  quizAverage,
  attendanceLog,
  attempts,
  assessments,
  quizzes,
  attemptedQuizIds,
}: ClassStandingForecastProps) {
  const [data, setData] = useState<RiskResult | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(studentId));
  const [error, setError] = useState(false);

  const indicators = useMemo(
    () => ({
      attendanceRate: attendanceRate ?? undefined,
      priorAverageGrade: grade ?? undefined,
      quizAverage: quizAverage ?? undefined,
      attendanceTrend: attendanceTrendFromLog(attendanceLog),
      quizTrend: quizTrendFromAttempts(attempts, quizDueDates(quizzes as any, assessments as any)),
      missingWorkRate: missingRate(
        missingWorkCountsFromEntry(assessments),
        missedQuizCounts(quizzes, attemptedQuizIds, studentId ?? '')
      ),
    }),
    [
      attendanceRate,
      grade,
      quizAverage,
      attendanceLog,
      attempts,
      assessments,
      quizzes,
      attemptedQuizIds,
      studentId,
    ]
  );

  useEffect(() => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(false);

    predictRisk(indicators)
      .then((result) => {
        if (isMounted) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          // Silence beats a broken or alarming panel. A network failure should not
          // read to the student as an urgent risk warning.
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [studentId, indicators]);

  if (loading) {
    return (
      <View className="bg-surface border border-hairline rounded-2xl p-4 my-2">
        <Text className="text-ink font-bold text-sm">Projected Standing</Text>
        <View className="flex-row items-center gap-2 mt-2">
          <ActivityIndicator size="small" color="#6366f1" />
          <Text className="text-ink-faint text-xs">Computing projection…</Text>
        </View>
      </View>
    );
  }

  if (error || !data) return null;

  if (data.status === 'insufficient_data') {
    const missing = (data.missing ?? []).map((feature) => READABLE_FEATURE[feature] ?? feature);
    return (
      <View className="bg-surface border border-hairline rounded-2xl p-4 my-2">
        <Text className="text-ink font-bold text-sm">Projected Standing</Text>
        <Text accessibilityRole="text" className="text-ink-muted text-xs mt-2 leading-relaxed">
          Not enough recorded academic information to estimate risk yet. This projection needs all six indicators.
          {missing.length ? ` Still needed: ${missing.join(', ')}.` : ''}
        </Text>
        <Text className="text-ink-faint text-[10px] mt-2">
          No risk score or on-track status is available.
        </Text>
      </View>
    );
  }

  if (data.status === 'model_unavailable') {
    return (
      <View className="bg-surface border border-hairline rounded-2xl p-4 my-2">
        <Text className="text-ink font-bold text-sm">Projected Standing</Text>
        <Text className="text-ink-muted text-xs mt-2">The prediction service is unavailable right now.</Text>
      </View>
    );
  }

  const supplied = data.supplied ?? [];
  const lowCoverage = (data.coverage ?? 0) < 0.7;
  const reasons = riskReasons(data.signals);
  const isAtRisk = data.atRisk;

  return (
    <View className="bg-surface border border-hairline rounded-2xl p-4 my-2">
      <Text className="text-ink font-bold text-sm">Projected Standing</Text>
      <Text className="text-ink-muted text-xs mt-1 leading-relaxed">
        A projection, not a grade. It looks at where your attendance and scores are heading, so it
        can change well before your grade does.
      </Text>

      {/* Status banner */}
      <View
        className={`mt-3 p-3.5 rounded-xl border flex-row items-center gap-3 ${
          isAtRisk
            ? 'bg-amber-500/10 border-amber-500/30'
            : 'bg-emerald-500/10 border-emerald-500/30'
        }`}
      >
        <Text
          className={`text-lg font-bold ${
            isAtRisk ? 'text-amber-500' : 'text-emerald-500'
          }`}
        >
          {isAtRisk ? 'Needs attention' : 'On track'}
        </Text>
        <Text className="text-ink-soft text-xs flex-1 leading-tight">
          {isAtRisk
            ? 'There is still time to improve this.'
            : 'Keep going — attendance and quiz scores are what move this most.'}
        </Text>
      </View>

      {/* Actionable reasons */}
      {reasons.length > 0 && (
        <View className="mt-3.5 pt-3 border-t border-hairline">
          <Text className="text-ink text-xs font-bold mb-2">What’s driving this</Text>
          <View className="space-y-1.5 pl-1">
            {reasons.map((reason, ri) => (
              <View key={ri} className="flex-row items-start gap-2">
                <Text className="text-amber-500 text-xs">•</Text>
                <Text className="text-ink-muted text-xs flex-1 leading-snug">{reason}</Text>
              </View>
            ))}
          </View>
          <Text className="text-ink-faint text-[10px] mt-2 leading-normal">
            Talking to your teacher about any one of these is a good next step.
          </Text>
        </View>
      )}

      {/* Basis indicators */}
      {supplied.length > 0 && (
        <Text className="text-ink-faint text-[10px] mt-3">
          Based on {supplied.map((f) => READABLE_FEATURE[f] ?? f).join(', ')}.
        </Text>
      )}

      {lowCoverage && (
        <Text className="text-ink-faint text-[10px] font-mono mt-1">
          Only part of your record is available, so treat this loosely.
        </Text>
      )}
    </View>
  );
}
