/**
 * How a student's grade is shown, by the gradebook's grading mode.
 *
 * Port of activklass-web/src/routes/student/gradeDisplay.js plus the three
 * policy helpers it leans on from lib/grading.js. Keep them in step.
 *
 * `entries.mode` is stamped by the teacher's Class Record from
 * `gradebooks.grading_mode`. Two of the three modes are percentages — DepEd
 * K-12 transmuted and CHED % — where higher is better. The third, `ched_point`,
 * is the collegiate 1.0–5.0 scale where LOWER is better and 3.0 is the last
 * passing point.
 *
 * Every helper takes an optional `policy` -- the entry itself will do, since
 * the record stamps `passing_percent` and `point_scale_direction` on it beside
 * `mode` (T-45, 2026-09-11). Without one the defaults apply: 75 passes, 1.0 is
 * the best point grade. The grades tab here used to paint a fixed green
 * "Passing" badge over every grade, including a 40, and coloured every score
 * bar at a hard-coded 75.
 */

export const DEFAULT_PASSING_PERCENT = 75;
export const PASSING_POINT = 3.0;
export const POINT_SCALE = 'ched_point';

export type PointScaleDirection = 'ched' | 'inverted';

export interface GradePolicy {
  passing_percent: number;
  point_scale_direction: PointScaleDirection;
}

export const isPointScale = (mode: unknown): boolean => mode === POINT_SCALE;

/** The pass mark and scale direction a source carries, or the defaults. */
export function gradePolicy(source?: Partial<Record<string, unknown>> | null): GradePolicy {
  const pct = Number(source?.passing_percent);
  return {
    passing_percent: Number.isFinite(pct) && pct > 0 && pct < 100 ? pct : DEFAULT_PASSING_PERCENT,
    point_scale_direction: source?.point_scale_direction === 'inverted' ? 'inverted' : 'ched',
  };
}

/**
 * Whether a final grade in `mode` passes under `policy`; null without a grade.
 * Mirrors lib/grading.js isPassingGrade: DepEd K-12 always passes at 75 (the
 * transmutation table fixes it), the CHED percentage mode honours the
 * teacher's mark, and the point scale passes at 3.0 in whichever direction the
 * scale runs.
 */
export function isPassingGrade(
  final: unknown,
  mode: unknown,
  policy?: Partial<Record<string, unknown>> | null
): boolean | null {
  const g = Number(final);
  if (final == null || !Number.isFinite(g)) return null;
  const { passing_percent, point_scale_direction } = gradePolicy(policy);
  if (mode === POINT_SCALE) {
    return point_scale_direction === 'inverted' ? g >= PASSING_POINT : g <= PASSING_POINT;
  }
  if (mode === 'deped_k12') return g >= DEFAULT_PASSING_PERCENT;
  return g >= passing_percent;
}

/* A point grade read the standard way round (1.0 best), whatever the policy. */
function standardPoint(grade: number, policy?: Partial<Record<string, unknown>> | null): number {
  return gradePolicy(policy).point_scale_direction === 'inverted' ? 6 - grade : grade;
}

/** null when there is no grade; otherwise whether it passes in this mode. */
export function passes(
  grade: unknown,
  mode: unknown,
  policy?: Partial<Record<string, unknown>> | null
): boolean | null {
  if (grade == null) return null;
  return isPassingGrade(grade, isPointScale(mode) ? mode : 'ched_percentage', policy);
}

/** "1.25" / "3.00" on the point scale; a whole number everywhere else. */
export function formatGrade(grade: unknown, mode: unknown): string {
  if (grade == null) return '—';
  return isPointScale(mode) ? Number(grade).toFixed(2) : String(Math.round(Number(grade)));
}

/** What passing means, in the scale's own units. */
export function passNote(mode: unknown, policy?: Partial<Record<string, unknown>> | null): string {
  const { passing_percent, point_scale_direction } = gradePolicy(policy);
  if (!isPointScale(mode)) return `${passing_percent} passes`;
  return `${point_scale_direction === 'inverted' ? '5.00' : '1.00'} is highest · 3.00 passes`;
}

/**
 * Colour ROLE for a grade, for the class-based palette. The web returns hex
 * from its theme; here screens name a role so light and dark both work.
 */
export type GradeToneKey = 'faint' | 'success' | 'accent' | 'warning' | 'danger';

export function gradeToneKey(
  grade: unknown,
  mode: unknown,
  policy?: Partial<Record<string, unknown>> | null
): GradeToneKey {
  if (grade == null) return 'faint';
  const g = Number(grade);
  if (isPointScale(mode)) {
    const p = standardPoint(g, policy);
    if (p <= 1.5) return 'success';
    if (p <= 2.25) return 'accent';
    if (p <= 3.0) return 'warning';
    return 'danger';
  }
  if (g >= 90) return 'success';
  if (g >= 85) return 'accent';
  if (g >= gradePolicy(policy).passing_percent) return 'warning';
  return 'danger';
}

/** Colour plus a descriptor, for the dashboard cards. Same words as the web. */
export function gradeTone(
  grade: unknown,
  mode: unknown,
  policy?: Partial<Record<string, unknown>> | null
): { tone: GradeToneKey; label: string } {
  if (grade == null) return { tone: 'faint', label: '—' };
  const tone = gradeToneKey(grade, mode, policy);
  const g = Number(grade);
  if (isPointScale(mode)) {
    const p = standardPoint(g, policy);
    if (p <= 1.5) return { tone, label: 'Excellent' };
    if (p <= 2.25) return { tone, label: 'Very Good' };
    if (p <= 3.0) return { tone, label: 'Passed' };
    return { tone, label: 'Failed' };
  }
  if (g >= 90) return { tone, label: 'Outstanding' };
  if (g >= 85) return { tone, label: 'Very Satisfactory' };
  if (g >= gradePolicy(policy).passing_percent) return { tone, label: 'Satisfactory' };
  return { tone, label: 'Needs work' };
}

/**
 * Whether one assessment's percentage clears the class's pass mark. Used for
 * the per-item score bars: an item at or above the mark reads green, below it
 * amber, and the mark is the teacher's, not 75.
 */
export function itemPasses(
  rawScore: unknown,
  totalPoints: unknown,
  policy?: Partial<Record<string, unknown>> | null
): boolean | null {
  const raw = Number(rawScore);
  const total = Number(totalPoints);
  if (rawScore == null || !Number.isFinite(raw) || !Number.isFinite(total) || total <= 0) return null;
  return (raw / total) * 100 >= gradePolicy(policy).passing_percent;
}
