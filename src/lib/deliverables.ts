/**
 * TypeScript port of the QUIZ parts of activklass-web src/lib/deliverables.js.
 *
 * The web student's Quizzes tab derives each quiz's state and its chip
 * sentence there; this is the same derivation for the mobile Quizzes tab
 * (T-252), so one quiz reads "Closed" or "Due today" on both clients.
 * activklass-web src/lib/portParity.test.js imports this file and holds it
 * equal to the original -- edit both, or that test fails.
 *
 * Tasks (fromTask, bucket, sorting) are not ported: mobile has no task list.
 * Dates are the zone-less 'YYYY-MM-DDTHH:mm' strings a quiz stores, read as
 * local time exactly like canStart() in quizAttempts.ts.
 */
import { finishedAttempts, type Attempt, type AttemptQuiz } from './quizAttempts';

export type DeliverableState = 'scheduled' | 'open' | 'due_today' | 'overdue' | 'closed' | 'done';

export interface QuizDeliverable {
  id: string;
  source: 'quiz';
  title: string;
  opensAt: Date | null;
  dueAt: Date | null;
  closedByTeacher: boolean;
  done: boolean;
  state: DeliverableState;
}

/** The word the web class page's card badge uses per state (WindowChip.jsx STATE_TONE.badge). */
export const STATE_BADGE: Record<DeliverableState, string | null> = {
  scheduled: 'Not open yet',
  open: null,
  due_today: 'Due today',
  overdue: 'Overdue',
  closed: 'Closed',
  done: 'Done',
};

export function parseWindowDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fromQuiz(
  quiz: (AttemptQuiz & { id?: string; title?: string }) | null | undefined,
  { attempts = [], now = Date.now() }: { attempts?: Attempt[]; now?: number | Date } = {},
): QuizDeliverable {
  const d = {
    id: quiz?.id ?? '',
    source: 'quiz' as const,
    title: quiz?.title ?? 'Quiz',
    opensAt: parseWindowDate(quiz?.opens_at),
    dueAt: parseWindowDate(quiz?.closes_at),
    closedByTeacher: quiz?.status === 'closed',
    done: finishedAttempts(attempts).length > 0,
    state: 'open' as DeliverableState,
  };
  d.state = stateOf(d, now);
  return d;
}

const toMs = (value: number | Date) => (value instanceof Date ? value.getTime() : Number(value));

const sameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Same order as the web: done, then closed, then not-yet-open, overdue, due today, open. */
export function stateOf(d: Partial<QuizDeliverable> | null | undefined, now: number | Date = Date.now()): DeliverableState {
  const t = toMs(now);
  const opens = d?.opensAt ? toMs(d.opensAt) : null;
  const due = d?.dueAt ? toMs(d.dueAt) : null;

  if (d?.done) return 'done';
  if (d?.source === 'quiz' && (d.closedByTeacher || (due != null && t > due))) return 'closed';
  if (opens != null && t < opens) return 'scheduled';
  if (due != null && t > due) return 'overdue';
  if (due != null && sameLocalDay(new Date(due), new Date(t))) return 'due_today';
  return 'open';
}

/** "09-15-26": numeric mm-dd-yy, as the web chip writes it (T-150). */
export function formatDay(date: number | Date): string {
  const d = new Date(toMs(date));
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}-${String(d.getFullYear()).slice(-2)}`;
}

/** "8:00 AM", "11:59 PM", "12:00 AM". */
export function formatTime(date: number | Date): string {
  const d = new Date(toMs(date));
  const h = d.getHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const formatDayTime = (date: number | Date) => `${formatDay(date)}, ${formatTime(date)}`;

/** The chip sentence for a quiz's window -- the web's describeWindow() minus the task branch. */
export function describeWindow(d: QuizDeliverable, now: number | Date = Date.now()): string {
  switch (stateOf(d, now)) {
    case 'done':
      return 'Done';
    case 'scheduled':
      return `Opens ${formatDayTime(d.opensAt!)}`;
    case 'due_today':
      return `Due today, ${formatTime(d.dueAt!)}`;
    case 'overdue':
      return `Overdue since ${formatDay(d.dueAt!)}`;
    case 'closed':
      return d.dueAt && !(d.closedByTeacher && toMs(now) <= toMs(d.dueAt))
        ? `Closed ${formatDay(d.dueAt)}`
        : 'Closed';
    default:
      return d.dueAt ? `Due ${formatDayTime(d.dueAt)}` : 'No deadline';
  }
}
