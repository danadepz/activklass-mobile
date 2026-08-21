/**
 * How much of their result a student is allowed to see, and when.
 *
 * This is a port of activklass-web src/lib/quizFeedback.js. A rule enforced on
 * one client and not the other is not a rule: the web page could hold back the
 * answer key until the last attempt, and a student would simply open the phone
 * app and read it there. Keep the two files in step; the web copy is the
 * original.
 *
 * Why it exists: the feedback screens revealed everything, unconditionally and
 * immediately -- including the correct answer for every item the student got
 * wrong, on every attempt, with `attempts_allowed` going up to 10. Attempt one
 * was the answer key; attempt two was transcription.
 */

/** When the result becomes readable. */
export const RELEASE_IMMEDIATE = 'immediate';
export const RELEASE_AFTER_CLOSE = 'after_close';
export const RELEASE_AFTER_ATTEMPTS = 'after_attempts';
export const RELEASE_NEVER = 'never';

/** How much of it is readable once it is. */
export const DETAIL_SCORE = 'score';
export const DETAIL_WRONG_ITEMS = 'wrong_items';
export const DETAIL_ANSWERS = 'answers';
export const DETAIL_RATIONALE = 'rationale';

export interface FeedbackQuiz {
  feedback_release?: string;
  feedback_detail?: string;
  closes_at?: string | null;
  attempts_allowed?: number | string;
  [key: string]: any;
}

export interface FeedbackVisibility {
  released: boolean;
  waitingOn: string | null;
  showScore: boolean;
  showItems: boolean;
  showCorrectAnswers: boolean;
  showRationale: boolean;
}

/** Detail levels are cumulative; this is their order. */
const DETAIL_RANK: Record<string, number> = {
  [DETAIL_SCORE]: 0,
  [DETAIL_WRONG_ITEMS]: 1,
  [DETAIL_ANSWERS]: 2,
  [DETAIL_RATIONALE]: 3,
};

/**
 * What this student may see of this attempt, right now.
 *
 * `attemptCount` is how many attempts they have already submitted, including
 * this one. `now` is injected rather than read so the caller can be tested.
 *
 * Unknown or missing settings fall back to the pre-existing behaviour
 * (immediate, full detail) rather than to the strictest reading. A quiz saved
 * before these fields existed was written by a teacher who saw full feedback on
 * the page, and quietly hiding it later would change their assessment without
 * telling them.
 */
export function feedbackVisibility({
  quiz,
  attemptCount = 1,
  now = Date.now(),
}: {
  quiz?: FeedbackQuiz | null;
  attemptCount?: number;
  now?: number;
} = {}): FeedbackVisibility {
  const release = quiz?.feedback_release ?? RELEASE_IMMEDIATE;
  const detail = quiz?.feedback_detail ?? DETAIL_RATIONALE;
  const rank = DETAIL_RANK[detail] ?? DETAIL_RANK[DETAIL_RATIONALE];

  let released = true;
  let waitingOn: string | null = null;

  if (release === RELEASE_NEVER) {
    released = false;
    waitingOn =
      'Your teacher is not releasing results for this quiz — they will go through it with your class.';
  } else if (release === RELEASE_AFTER_CLOSE) {
    const closesAt = quiz?.closes_at ? new Date(quiz.closes_at).getTime() : null;
    released = closesAt != null && now > closesAt;
    if (!released) {
      waitingOn = closesAt
        ? `Results open when this quiz closes on ${new Date(closesAt).toLocaleString()}.`
        : 'Results open when your teacher closes this quiz.';
    }
  } else if (release === RELEASE_AFTER_ATTEMPTS) {
    const allowed = Number(quiz?.attempts_allowed) || 1;
    released = attemptCount >= allowed;
    if (!released) {
      const left = allowed - attemptCount;
      waitingOn = `Results open after your last attempt — you have ${left} more.`;
    }
  }

  return {
    released,
    waitingOn,
    // The score is the floor: every released result shows it. Withholding the
    // score as well is what RELEASE_NEVER is for.
    showScore: released,
    showItems: released && rank >= DETAIL_RANK[DETAIL_WRONG_ITEMS],
    showCorrectAnswers: released && rank >= DETAIL_RANK[DETAIL_ANSWERS],
    showRationale: released && rank >= DETAIL_RANK[DETAIL_RATIONALE],
  };
}
