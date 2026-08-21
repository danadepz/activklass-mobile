/**
 * A student's own grades and attendance, from the same documents the web reads.
 *
 * The mobile dashboard did not read either. It held them as component state:
 *
 *     const [overallGrade, setOverallGrade] = useState(90)   // Default placeholder
 *     const [attendanceRate, setAttendanceRate] = useState(96) // Default placeholder
 *
 * and nothing ever set them, so every student on every phone saw 90% and 96%
 * over the words "Honor Standing" — while the web showed their real marks. Ana
 * Reyes reads 85 on a laptop and read 90 here. Same family as the hardcoded
 * "Mrs. Santos" instructor name.
 *
 * Mirrors activklass-web/src/lib/studentData.js so the two cannot disagree:
 *   gradebooks/{classId}/entries/{studentId}  — one student's computed grade
 *   classes/{classId}/attendance/{date}       — a day for the whole class
 *
 * The attendance document holds every student's record for that day, which is
 * why a guardian cannot read it (a rule can only allow or deny the whole
 * document) but the student themselves can — they are enrolled in the class.
 * Filtering to their own row happens here, client-side, exactly as on the web.
 */
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface StudentEntry {
  class_id: string;
  final_grade: number | null;
  periods: { id: string; name: string | null; grade: number | null }[];
}

export interface AttendanceSummary {
  tally: { present: number; late: number; absent: number; excused: number };
  /** present / counted, 0-100, or null when nothing has been recorded yet. */
  rate: number | null;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * This student's computed grade for one class, or null.
 *
 * Deliberately NOT gradebooks/{classId} or its assessments subcollection: those
 * hold every classmate's raw scores, and the rules deny them. The per-student
 * entry is the only grade document a student may read.
 */
export async function loadStudentEntry(
  classId: string,
  studentId: string
): Promise<StudentEntry | null> {
  try {
    const snap = await getDoc(doc(db, 'gradebooks', classId, 'entries', studentId));
    if (!snap.exists()) return null;
    const d = snap.data() as any;
    return {
      class_id: classId,
      final_grade: toNumber(d.final_grade),
      periods: Array.isArray(d.periods)
        ? d.periods.map((p: any) => ({
            id: String(p.id ?? ''),
            name: p.name ?? null,
            grade: toNumber(p.grade),
          }))
        : [],
    };
  } catch {
    // A class whose teacher has not saved yet simply has no entry; one missing
    // or denied read must not blank the whole dashboard.
    return null;
  }
}

/** One student's attendance across every recorded day in a class. */
export async function loadStudentAttendance(
  classId: string,
  studentId: string
): Promise<AttendanceSummary> {
  const empty: AttendanceSummary = {
    tally: { present: 0, late: 0, absent: 0, excused: 0 },
    rate: null,
  };
  try {
    const snap = await getDocs(collection(db, 'classes', classId, 'attendance'));
    const tally = { present: 0, late: 0, absent: 0, excused: 0 };
    snap.forEach((d) => {
      const rec = (d.data() as any).records?.[studentId];
      const status = rec?.status as keyof typeof tally | undefined;
      if (status && status in tally) tally[status] += 1;
    });
    const counted = tally.present + tally.late + tally.absent + tally.excused;
    return { tally, rate: counted ? Math.round((tally.present / counted) * 100) : null };
  } catch {
    return empty;
  }
}

/**
 * Averages across every class, for the dashboard ring.
 *
 * Classes with no entry yet are skipped rather than counted as zero — a
 * student one week into a term should not be shown a 0% average because only
 * one of four teachers has posted marks.
 */
export async function loadOverallStanding(
  classIds: string[],
  studentId: string
): Promise<{ average: number | null; attendanceRate: number | null }> {
  const [entries, attendance] = await Promise.all([
    Promise.all(classIds.map((id) => loadStudentEntry(id, studentId))),
    Promise.all(classIds.map((id) => loadStudentAttendance(id, studentId))),
  ]);

  const graded = entries
    .map((e) => e?.final_grade)
    .filter((g): g is number => g != null);
  const average = graded.length
    ? Math.round((graded.reduce((a, b) => a + b, 0) / graded.length) * 100) / 100
    : null;

  // Pooled across classes rather than a mean of per-class rates, so a class
  // with two recorded days does not weigh as much as one with forty.
  const pooled = attendance.reduce(
    (acc, a) => {
      acc.present += a.tally.present;
      acc.counted += a.tally.present + a.tally.late + a.tally.absent + a.tally.excused;
      return acc;
    },
    { present: 0, counted: 0 }
  );

  return {
    average,
    attendanceRate: pooled.counted ? Math.round((pooled.present / pooled.counted) * 100) : null,
  };
}

/**
 * The label above the ring. Was the literal string "Honor Standing" for
 * everyone, including a student failing every subject.
 *
 * Thresholds follow DepEd's descriptors; a CHED point-scale average (1.0-5.0,
 * where lower is better) is left unlabelled rather than described with the
 * wrong scale's words.
 */
export function standingLabel(average: number | null): string {
  if (average == null) return 'No grades yet';
  if (average <= 5) return 'Point-scale average';
  if (average >= 90) return 'With Honors';
  if (average >= 85) return 'Very Satisfactory';
  if (average >= 80) return 'Satisfactory';
  if (average >= 75) return 'Passing';
  return 'Needs Improvement';
}
