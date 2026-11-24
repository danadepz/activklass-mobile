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
const RISK_FEATURE_BOUNDS: Record<string, [number, number]> = {
  prior_average_grade: [0, 100], attendance_rate: [0, 1], quiz_average: [0, 100],
  attendance_trend: [-1, 1], quiz_trend: [-100, 100], missing_work_rate: [0, 1],
};

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
 * Unit contract (2026-11-23): the input is ALWAYS a percentage, 0-100 (the
 * one caller passes attendanceRateFromLog), so it is always divided by 100.
 * The old "<= 1 is already a fraction" guess read 1% as 100%. Mirrors the web.
 */
function toAttendanceRate(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new TypeError('attendanceRate must be between 0 and 100');
  return n / 100;
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
 * only what was actually measured. The explicit opt-in lets this client ask
 * for an insufficient-data response; older backends may ignore it and return
 * a legacy score, which shapeRiskResult still suppresses for partial vectors.
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
    if (!Number.isFinite(n)) throw new TypeError(`${feature} must be a finite number`);
    const [min, max] = RISK_FEATURE_BOUNDS[feature];
    if (n < min || n > max) throw new RangeError(`${feature} is outside its supported range`);
    indicators[feature] = n;
  }
  return indicators;
}

export interface RiskResult {
  status: 'scored' | 'insufficient_data' | 'model_unavailable';
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
  const complete = RISK_FEATURES.every((feature) => supplied.includes(feature));
  const status = raw?.status === 'model_unavailable'
    ? 'model_unavailable'
    : raw?.status && raw.status !== 'scored'
      ? 'insufficient_data'
      : complete && raw?.risk_flag && Number.isFinite(raw?.risk_probability)
        ? 'scored'
        : 'insufficient_data';
  return {
    status,
    flag: status === 'scored' ? raw.risk_flag : null,
    atRisk: status === 'scored' && raw.risk_flag === 'high_risk',
    probability: null,
    supplied,
    missing: RISK_FEATURES.filter((f) => !supplied.includes(f)),
    coverage: Math.round(coverage * 100) / 100,
    globalFactors: raw?.top_factors ?? [],
    signals: status === 'scored' ? (raw?.signals ?? []) : [],
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
  const raw = await api('/api/predict', {
    method: 'POST',
    body: { indicators: built, accepts_insufficient_data: true },
  });
  return shapeRiskResult(raw, built);
}
