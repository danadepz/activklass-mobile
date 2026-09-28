/**
 * A student's own grades, attendance and syllabus, from the same documents the
 * web reads.
 *
 * Mirrors activklass-web/src/lib/studentData.js so the two cannot disagree:
 *   gradebooks/{classId}/entries/{studentId}  — one student's computed grade
 *   classes/{classId}/attendance/{date}       — a day for the whole class
 *   syllabi/{syllabus_id} | classes/{classId}/syllabus/current — the modules
 *
 * A student may read ONLY the per-student entry for grades. Deliberately NOT
 * gradebooks/{classId} or its assessments subcollection: those hold every
 * classmate's raw scores, and the rules deny them. Grades are derived by the
 * teacher's client; nothing here computes or writes one.
 *
 * The attendance document holds every student's record for that day, which is
 * why a guardian cannot read it (a rule can only allow or deny the whole
 * document) but the student themselves can — they are enrolled in the class.
 * Filtering to their own row happens here, client-side, exactly as on the web.
 */
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Syllabus, Module } from './scaffolding';
export type { Syllabus };

export interface EntryAssessment {
  id: string;
  title: string;
  period_id?: string | null;
  component_id?: string | null;
  component?: string | null;
  status?: 'graded' | 'missing' | 'excused' | string | null;
  raw_score?: number | null;
  total_points?: number | null;
  class_average?: number | null;
  date_given?: string | null;
  [key: string]: unknown;
}

export interface EntryComponent {
  id: string;
  name: string;
  weight_percent?: number | null;
}

export interface StudentEntry {
  class_id: string;
  final_grade: number | null;
  periods: { id: string; name: string | null; grade: number | null }[];
  /** 'deped_k12' | 'ched_percentage' | 'ched_point' — stamped by the record. */
  mode: string | null;
  /** The teacher's pass mark and scale direction (T-45). Read, never assumed. */
  passing_percent: number | null;
  point_scale_direction: string | null;
  /** This student's assessments, already flattened, each with its own status. */
  assessments: EntryAssessment[];
  components: EntryComponent[];
}

export interface AttendanceDay {
  date: string;
  status: string;
  remarks: string | null;
  excuse_url: string | null;
}

export interface AttendanceSummary {
  /** Newest first, days this student has a record for. */
  log: AttendanceDay[];
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
 * Shape (written by the teacher Class Record on save):
 *   { student_id, final_grade, periods: [{ id, name, grade }], mode,
 *     passing_percent, point_scale_direction, assessments, components }
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
      mode: typeof d.mode === 'string' ? d.mode : null,
      passing_percent: toNumber(d.passing_percent),
      point_scale_direction: typeof d.point_scale_direction === 'string' ? d.point_scale_direction : null,
      assessments: Array.isArray(d.assessments) ? d.assessments : [],
      components: Array.isArray(d.components) ? d.components : [],
    };
  } catch {
    // A class whose teacher has not saved yet simply has no entry; one missing
    // or denied read must not blank the whole dashboard.
    return null;
  }
}

/** Firestore dates arrive as Timestamps or as 'YYYY-MM-DD' doc ids. */
const dateKey = (v: any): string =>
  v && typeof v.toDate === 'function' ? v.toDate().toISOString().slice(0, 10) : String(v ?? '');

/**
 * One student's attendance across every recorded day in a class.
 *
 * Days with no record for this student are left out, as on the web. The class
 * screen used to default them to 'absent', which showed a student absent on a
 * day their teacher had not marked anyone.
 */
export async function loadStudentAttendance(
  classId: string,
  studentId: string
): Promise<AttendanceSummary> {
  const empty: AttendanceSummary = {
    log: [],
    tally: { present: 0, late: 0, absent: 0, excused: 0 },
    rate: null,
  };
  try {
    const snap = await getDocs(collection(db, 'classes', classId, 'attendance'));
    const log: AttendanceDay[] = [];
    const tally = { present: 0, late: 0, absent: 0, excused: 0 };
    snap.forEach((d) => {
      const data = d.data() as any;
      const rec = data.records?.[studentId];
      if (!rec?.status) return;
      const status = rec.status as keyof typeof tally;
      if (status in tally) tally[status] += 1;
      log.push({
        date: dateKey(data.date ?? d.id),
        status: rec.status,
        remarks: rec.remarks ?? null,
        excuse_url: rec.excuse_url ?? null,
      });
    });
    log.sort((a, b) => b.date.localeCompare(a.date));
    const counted = tally.present + tally.late + tally.absent + tally.excused;
    return { log, tally, rate: counted ? Math.round((tally.present / counted) * 100) : null };
  } catch {
    return empty;
  }
}

/**
 * Syllabus modules/topics for a class, resolved the way the web resolves it.
 *
 * A syllabus lives in two places: one saved from the teacher's syllabus page is
 * `syllabi/{classes.syllabus_id}`; the seed script writes
 * `classes/{id}/syllabus/current` and leaves syllabus_id empty. The teacher's
 * scaffolds page reads both, so a remediation can carry topic ids from either
 * -- and this read has to find the same document, or the student's review
 * guide cannot name the module it came from. Since 2026-09-12 the web reads
 * syllabus_id first and falls back to the per-class document; this does the
 * same. The class screen used to read only the per-class document.
 *
 * Unpublished modules are held back from students. Filtered here rather than
 * in the screen so every student-side reader gets the same answer.
 */
export async function loadSyllabus(classId: string): Promise<Syllabus | null> {
  try {
    const classSnap = await getDoc(doc(db, 'classes', classId));
    if (!classSnap.exists()) return null;
    const syllabusId = (classSnap.data() as any)?.syllabus_id;
    let snap: any = syllabusId ? await getDoc(doc(db, 'syllabi', syllabusId)) : null;
    if (!snap?.exists()) snap = await getDoc(doc(db, 'classes', classId, 'syllabus', 'current'));
    if (!snap.exists()) return null;
    const data = snap.data() as Syllabus;
    return {
      ...data,
      modules: (data.modules ?? []).filter((m: Module) => m.published !== false),
    };
  } catch {
    return null;
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
): Promise<{
  average: number | null;
  attendanceRate: number | null;
  entries: StudentEntry[];
  attendance: AttendanceSummary[];
}> {
  const [entriesOrNull, attendance] = await Promise.all([
    Promise.all(classIds.map((id) => loadStudentEntry(id, studentId))),
    Promise.all(classIds.map((id) => loadStudentAttendance(id, studentId))),
  ]);
  const entries = entriesOrNull.filter((e): e is StudentEntry => e != null);

  const graded = entries
    .map((e) => e.final_grade)
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
    entries,
    attendance,
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
