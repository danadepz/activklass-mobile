/**
 * Predict Class Standing — the student's own view of the early-warning model.
 *
 * Port of the /api/predict half of activklass-web/src/lib/ai.js: the
 * indicator builder, the result shaper and the student-facing sentences. The
 * backend is Flask (`/api/predict`, a scikit-learn forest), reached through
 * `api()` because it needs the model; everything else on this screen reads
 * Firestore directly.
 *
 * Wording is the whole point of showing this to a student. A flat "at risk" is
 * both discouraging and overclaims what a model trained on synthetic data can
 * know. What a student can act on is the specific thing that is slipping and
 * by how much — "your attendance has dropped about 26 points recently" — so
 * that is what RISK_SIGNAL_COPY says, in the same words as the web.
 */
import { api } from './api';

/**
 * The six indicators /api/predict scores, mapped to the fitted forest's global
 * feature importances. They let us report how much of the signal we supplied.
 * tests/test_risk_model.py in the backend asserts these stay in step with the
 * fitted forest.
 */
export const RISK_FEATURE_WEIGHTS: Record<string, number> = {
  prior_average_grade: 0.26,
  attendance_trend: 0.21,
  missing_work_rate: 0.17,
  quiz_trend: 0.15,
  quiz_average: 0.13,
  attendance_rate: 0.08,
};

const RISK_FEATURES = Object.keys(RISK_FEATURE_WEIGHTS);

/**
 * Plain-language reasons, keyed by the `code` the backend attaches to each
 * out-of-band indicator it was actually given. Student wording only: the
 * teacher's terse variant lives on the web, which is the only teacher client.
 */
export const RISK_SIGNAL_COPY: Record<string, (v: number) => string> = {
  attendance_falling: (v) => `your attendance has dropped about ${Math.round(Math.abs(v) * 100)} points recently`,
  // "work", not "assessments": this pools assessments a teacher marked
  // missing with quizzes that closed unattempted.
  work_not_submitted: (v) => `you have not turned in ${Math.round(v * 100)}% of your work so far`,
  quiz_scores_falling: (v) => `your recent quiz scores are about ${Math.round(Math.abs(v))} points below your earlier ones`,
  attendance_low: (v) => `your attendance is at ${Math.round(v * 100)}%`,
  quiz_average_low: (v) => `your quiz average is ${Math.round(v)}%`,
  grade_low: (v) => `your current grade is ${Math.round(v)}`,
};

/** What each indicator is called when we say what the projection was based on. */
export const READABLE_FEATURE: Record<string, string> = {
  attendance_rate: 'your attendance',
  prior_average_grade: 'your current grade',
  quiz_average: 'your quiz scores',
  attendance_trend: 'how your attendance has changed',
  quiz_trend: 'how your quiz scores have changed',
  missing_work_rate: 'unsubmitted work',
};

export interface RiskSignal {
  code: string;
  value: number;
}

/** Signals rendered for the student, worst-first as the backend ranked them. */
export function riskReasons(signals: RiskSignal[] | null | undefined): string[] {
  return (signals ?? [])
    .map((s) => RISK_SIGNAL_COPY[s.code]?.(s.value))
    .filter((s): s is string => Boolean(s));
}

/**
 * The app stores attendance as a percentage but the model wants 0.0-1.0.
 * Passing 45 for 45% scores *safer* than sending nothing, so normalise here.
 * Anything above 1 is unambiguously a percentage; exactly 1 is read as 100%.
 */
function toAttendanceRate(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n > 1 ? n / 100 : n;
}

export interface RiskInputs {
  attendanceRate?: number | null;
  priorAverageGrade?: number | null;
  quizAverage?: number | null;
  attendanceTrend?: number | null;
  quizTrend?: number | null;
  missingWorkRate?: number | null;
}

/**
 * camelCase indicators -> the snake_case vector the endpoint expects, keeping
 * only what was actually measured. Omitting a field is not neutral: the
 * backend fills gaps with healthy cohort defaults, so a student we know only
 * a failing grade for still comes back `on_track`. We report what we sent so
 * the panel can qualify the result instead of presenting a guess as a finding.
 */
export function buildRiskIndicators({
  attendanceRate,
  priorAverageGrade,
  quizAverage,
  attendanceTrend,
  quizTrend,
  missingWorkRate,
}: RiskInputs = {}): Record<string, number> {
  const candidates: Record<string, unknown> = {
    attendance_rate: attendanceRate == null ? undefined : toAttendanceRate(attendanceRate),
    prior_average_grade: priorAverageGrade,
    quiz_average: quizAverage,
    // Trends are already differences, so they are NOT normalised.
    attendance_trend: attendanceTrend,
    quiz_trend: quizTrend,
    missing_work_rate: missingWorkRate,
  };

  const indicators: Record<string, number> = {};
  for (const feature of RISK_FEATURES) {
    const value = candidates[feature];
    if (value == null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) indicators[feature] = n;
  }
  return indicators;
}

export interface RiskResult {
  flag: string | null;
  atRisk: boolean;
  probability: number | null;
  supplied: string[];
  missing: string[];
  coverage: number;
  globalFactors: unknown[];
  signals: RiskSignal[];
  training: { real_data?: boolean; source?: string; samples?: number } | null;
}

/**
 * Reshape one raw /api/predict result, annotating it with how much of the
 * model's basis we supplied. `top_factors` is renamed `globalFactors`: it is
 * global to the forest, not about this student, and must not read as an
 * explanation of them.
 */
export function shapeRiskResult(raw: any, indicators: Record<string, number>): RiskResult {
  const supplied = Object.keys(indicators);
  const coverage = supplied.reduce((sum, f) => sum + (RISK_FEATURE_WEIGHTS[f] ?? 0), 0);
  return {
    flag: raw?.risk_flag ?? null,
    atRisk: raw?.risk_flag === 'high_risk',
    probability: raw?.risk_probability ?? null,
    supplied,
    missing: RISK_FEATURES.filter((f) => !supplied.includes(f)),
    coverage: Math.round(coverage * 100) / 100,
    globalFactors: raw?.top_factors ?? [],
    signals: raw?.signals ?? [],
    training: raw?.training ?? null,
  };
}

/**
 * Score this student with the Random Forest behind /api/predict.
 * Pass whatever indicators exist; unmeasured ones are left out rather than
 * faked. Check `coverage` before trusting a flag.
 */
export async function predictRisk(inputs: RiskInputs): Promise<RiskResult> {
  const built = buildRiskIndicators(inputs);
  const raw = await api('/api/predict', { method: 'POST', body: { indicators: built } });
  return shapeRiskResult(raw, built);
}
