/**
 * Typed calls for the guardian-linking and parent-portal endpoints.
 *
 * Shapes mirror activklass-backend app/api/guardians.py and app/api/parent.py.
 * Keep them in step: the backend is the source of truth for both the payloads
 * and the scope names.
 */
import { api } from './api';

/** The four visibility toggles a student controls, per guardian. */
export interface GuardianScopes {
  can_view_grades: boolean;
  can_view_quiz_scores: boolean;
  can_view_attendance: boolean;
  can_view_analytics: boolean;
}

export type LinkStatus = 'pending' | 'approved' | 'revoked';

export interface LinkedStudent {
  id: string;
  uid: string | null;
  student_number: string | null;
  first_name: string | null;
  last_name: string | null;
  grade_level: string | null;
  section: string | null;
  /** null when the student's birthdate is unknown — treated as an adult. */
  is_underage: boolean | null;
}

export interface DashboardClass {
  class_id: string;
  subject: string | null;
  subject_code: string | null;
  section: string | null;
  current_grade: number | null;
}

export interface DashboardChild {
  link_id: string;
  link_status: LinkStatus;
  linked_student: LinkedStudent;
  scopes: GuardianScopes;
  performance_summary: {
    overall_grade_average: number | null;
    attendance_rate: number | null;
  } | null;
  classes: DashboardClass[];
}

export interface GuardianLink {
  id: string;
  student_id: string;
  guardian_id: string;
  guardian_name: string | null;
  guardian_email: string | null;
  relationship_type: string | null;
  status: LinkStatus;
  scopes: GuardianScopes;
  linked_at: string | null;
  revoked_at: string | null;
}

export interface AssessmentRow {
  title: string | null;
  component: string | null;
  period: string | null;
  date_given: string | null;
  status: string | null;
  student_score: number | null;
  total_points: number;
  /** null when fewer than two classmates are graded — see backend note. */
  class_average: number | null;
}

export interface PerformancePayload {
  class_id: string;
  subject: string | null;
  section: string | null;
  grading_mode: string;
  final_grade: number | null;
  periods: { id: string; name: string | null; grade: number | null }[];
  assessments: AssessmentRow[];
}

export interface AttendanceLog {
  date: string;
  status: 'present' | 'late' | 'absent' | 'excused' | string;
  remarks: string | null;
  excuse_url: string | null;
}

export interface AttendancePayload {
  class_id: string;
  attendance_logs: AttendanceLog[];
  tally: { present: number; late: number; absent: number; excused: number };
  attendance_rate: number | null;
}

export interface QuizAttempt {
  attempt_id: string;
  quiz_id: string | null;
  quiz_title: string | null;
  class_id: string | null;
  attempt_number: number | null;
  total_score: number | null;
  total_possible: number | null;
  status: string | null;
  awaiting_teacher: boolean;
  submitted_at: string | null;
}

export interface AnalyticsPayload {
  active_study_guides: number;
  remediations: {
    id: string;
    class_id: string | null;
    topic: string | null;
    status: string | null;
    created_at: string | null;
  }[];
  subjects: {
    class_id: string;
    subject: string | null;
    subject_code: string | null;
    current_grade: number | null;
  }[];
}

// ---------------------------------------------------------------------------
// Linking
// ---------------------------------------------------------------------------

/**
 * Redeem a student's 6-character code.
 *
 * The returned status is the whole story for the next screen: a minor's
 * guardian comes back `approved` and can go straight to the dashboard, while
 * an adult student's guardian comes back `pending` and must wait for approval.
 * The backend decides which — never the client.
 */
export function redeemGuardianCode(code: string, relationshipType?: string) {
  return api<GuardianLink>('/api/guardian-links/redeem', {
    method: 'POST',
    body: { code, relationship_type: relationshipType || null },
  });
}

export function listLinkedChildren() {
  return api<
    {
      link_id: string;
      status: LinkStatus;
      student: LinkedStudent;
      scopes: GuardianScopes;
    }[]
  >('/api/guardian-links/children');
}

// ---------------------------------------------------------------------------
// Student side: my code, my guardians
// ---------------------------------------------------------------------------

export interface GuardianCode {
  code: string;
  created_at: string | null;
  rotated_at: string | null;
}

export interface MyGuardiansPayload {
  /** null when the birthdate is unknown; the backend then treats them as an adult. */
  is_minor: boolean | null;
  /** false for under-18s: render the toggles and revoke disabled, not hidden. */
  can_manage: boolean;
  locked_reason: string | null;
  scope_labels: { key: keyof GuardianScopes; label: string }[];
  guardians: GuardianLink[];
}

/** The student's share code. The backend creates it on first call. */
export function getMyGuardianCode() {
  return api<GuardianCode>('/api/guardian-links/code');
}

/**
 * Mint a new code. Guardians already connected stay connected — rotating only
 * stops anyone still holding the old code from redeeming it.
 */
export function rotateMyGuardianCode() {
  return api<GuardianCode>('/api/guardian-links/code/rotate', { method: 'POST' });
}

export function getMyGuardians() {
  return api<MyGuardiansPayload>('/api/guardian-links');
}

export function setGuardianScopes(linkId: string, scopes: Partial<GuardianScopes>) {
  return api<GuardianLink>(`/api/guardian-links/${linkId}`, { method: 'PATCH', body: scopes });
}

export function approveGuardian(linkId: string) {
  return api<GuardianLink>(`/api/guardian-links/${linkId}/approve`, { method: 'POST' });
}

export function revokeGuardian(linkId: string) {
  return api<{ status: string; id: string }>(`/api/guardian-links/${linkId}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Portal data
// ---------------------------------------------------------------------------

export function getParentDashboard() {
  return api<{ children: DashboardChild[] }>('/api/parent/dashboard');
}

export function getClassPerformance(studentId: string, classId: string) {
  return api<PerformancePayload>(
    `/api/parent/student/${studentId}/classes/${classId}/performance`
  );
}

export function getClassAttendance(studentId: string, classId: string) {
  return api<AttendancePayload>(
    `/api/parent/student/${studentId}/classes/${classId}/attendance`
  );
}

export function getQuizScores(studentId: string, classId?: string) {
  return api<{ attempts: QuizAttempt[] }>(
    `/api/parent/student/${studentId}/quiz-scores`,
    { params: { class_id: classId } }
  );
}

export function getAnalytics(studentId: string) {
  return api<AnalyticsPayload>(`/api/parent/student/${studentId}/analytics`);
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function studentFullName(student: LinkedStudent | null | undefined): string {
  if (!student) return 'Your child';
  return `${student.first_name ?? ''} ${student.last_name ?? ''}`.trim() || 'Your child';
}

/** Normalises what the user typed: codes are shown in groups and read aloud. */
export function normaliseCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}
