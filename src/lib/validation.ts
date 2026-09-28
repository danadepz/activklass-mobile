/**
 * Shared field validation.
 *
 * Direct TypeScript port from activklass-web/src/lib/validation.js.
 * Keeps exact parity with the web application's validation rules and error wording.
 */

/* Letters (including accented characters -- Peña, Muñoz, San José are real
   roster names), spaces, hyphens, apostrophes and periods (for "Ma." and
   generational suffixes like "Jr."). Must contain at least one letter, so
   "..." or "-" cannot pass. \p{L} needs the u flag. */
const NAME_RE = /^[\p{L}][\p{L}\s'.-]*$/u;

/**
 * A person-name part (first, middle or last).
 */
export function nameError(value: unknown, { label = 'Name', required = true } = {}): string {
  const text = String(value ?? '').trim();
  if (!text) return required ? `${label} is required.` : '';
  if (!NAME_RE.test(text)) {
    return `${label} can only contain letters, spaces, hyphens, apostrophes and periods.`;
  }
  return '';
}

export const MIN_PASSWORD = 8;

/** One line stating the full rule, for placeholders and hints. */
export const PASSWORD_RULE =
  `At least ${MIN_PASSWORD} characters, with an uppercase and lowercase letter, a number and a symbol.`;

/**
 * Password strength. Firebase Auth itself only requires 6 characters, and
 * "at least 8" alone let `12345678` through -- every pilot tester flagged it.
 * Policy (owner's call, 2026-08-25): length plus all four character classes.
 * Checks run in the order a reader would fix them, one message at a time.
 */
export function passwordError(value: unknown): string {
  const text = String(value ?? '');
  if (text.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (!/[A-Z]/.test(text)) return 'Password must contain an uppercase letter.';
  if (!/[a-z]/.test(text)) return 'Password must contain a lowercase letter.';
  if (!/\d/.test(text)) return 'Password must contain a number.';
  if (!/[^A-Za-z0-9\s]/.test(text)) return 'Password must contain a special character (like ! @ # $).';
  return '';
}

/**
 * Admin-ISSUED temporary passwords: length only. The person must replace it
 * anyway (is_temp_password gates them), and the full character-class rule
 * above would forbid the standing default `pass1234`. User-chosen passwords
 * keep going through passwordError.
 */
export function tempPasswordError(value: unknown, { required = true } = {}): string {
  const text = String(value ?? '');
  if (!text) return required ? 'Password is required.' : '';
  if (text.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  return '';
}

/* "Grade 7" (K-12, grades 1-12) or "1st Year" / "3rd" (college, years 1-5).
   Case-insensitive; "Year" optional on the college form since the class form
   placeholder has always suggested bare "3rd". */
const GRADE_RE = /^grade\s*([1-9]|1[0-2])$/i;
const YEAR_RE = /^(1st|2nd|3rd|4th|5th)(\s+year)?$/i;

export const GRADE_LEVELS = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);
export const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];

/**
 * Grade/year level.
 */
export function yearLevelError(
  value: unknown,
  { level, required = true }: { level?: 'school' | 'college'; required?: boolean } = {}
): string {
  const text = String(value ?? '').trim();
  if (!text) {
    return required ? (level === 'college' ? 'Year level is required.' : 'Grade level is required.') : '';
  }
  const isGrade = GRADE_RE.test(text);
  const isYear = YEAR_RE.test(text);
  if (level === 'college') {
    return isYear ? '' : 'Enter a year level like "1st Year" (1st to 5th).';
  }
  if (level === 'school') {
    return isGrade ? '' : 'Enter a grade level like "Grade 7" (Grade 1 to 12).';
  }
  return isGrade || isYear ? '' : 'Enter a level like "Grade 10" or "1st Year".';
}

export const SEMESTERS = [
  { value: '1st', label: '1st Semester' },
  { value: '2nd', label: '2nd Semester' },
  { value: 'summer', label: 'Midyear / Summer' },
];
export const SEMESTER_VALUES = SEMESTERS.map((s) => s.value);

export function semesterLabel(value: unknown): string {
  if (value === 'summer') return 'Midyear';
  return SEMESTER_VALUES.includes(value as string) ? `${value} Sem` : '';
}

export function semesterError(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return 'Semester is required for a college class.';
  return SEMESTER_VALUES.includes(text) ? '' : 'Pick a semester from the list.';
}

const ID_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;

export function idNumberError(value: unknown, { label = 'ID number', required = true } = {}): string {
  const text = String(value ?? '').trim();
  if (!text) return required ? `${label} is required.` : '';
  if (!ID_NUMBER_RE.test(text)) {
    return `${label} can only contain letters, digits, dots and hyphens.`;
  }
  return '';
}

const PRC_LICENSE_RE = /^\d{7}$/;

export function prcLicenseError(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return 'PRC license number is required.';
  if (!PRC_LICENSE_RE.test(text)) return 'A PRC license number is exactly 7 digits, like 1234567.';
  return '';
}

export function verificationIdError(value: unknown, idType: string): string {
  return idType === 'prc' ? prcLicenseError(value) : idNumberError(value);
}

export function lrnError(value: unknown, { required = true, collegePath = '' } = {}): string {
  const text = String(value ?? '').trim();
  if (!text) return required ? 'LRN is required.' : '';
  if (!/^\d{12}$/.test(text)) {
    return 'LRN must be exactly 12 digits. A learner with no LRN (college) '
      + (collegePath ? `— ${collegePath} and use the student number instead.` : 'uses the student number instead.');
  }
  return '';
}

export function passingPercentError(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return 'A passing score is required.';
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    return 'The passing score must be a whole number from 1 to 99.';
  }
  return '';
}

export function loginPrefixError(value: unknown): string {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return 'A login prefix is required.';
  if (!/^[a-z0-9]{2,12}$/.test(text)) {
    return 'The prefix must be 2–12 letters or digits, like "snhs".';
  }
  return '';
}

export function schoolNameError(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return 'The school’s full name is required.';
  if (text.length < 3 || !/\p{L}/u.test(text)) {
    return 'Enter the school’s full name, like "University of Cebu-Banilad".';
  }
  if (text.length > 120) return 'The school name is too long (120 characters at most).';
  return '';
}

const SCHOOL_ABBR_RE = /^[A-Za-z0-9]{2,12}$/;

export function schoolAbbrError(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return 'An abbreviation is required.';
  if (!SCHOOL_ABBR_RE.test(text)) {
    return 'The abbreviation must be 2–12 letters or digits, like "UCB".';
  }
  return '';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const KNOWN_MAIL_PROVIDERS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];

function isOneLetterSlip(a: string, b: string): boolean {
  if (a === b) return false;
  const lenDiff = Math.abs(a.length - b.length);
  if (lenDiff > 1) return false;
  if (a.length === b.length) {
    let firstDiff = -1;
    let diffCount = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        diffCount++;
        if (firstDiff === -1) firstDiff = i;
      }
    }
    if (diffCount === 1) return true;
    if (diffCount === 2 && firstDiff < a.length - 1) {
      return (
        a[firstDiff] === b[firstDiff + 1] &&
        a[firstDiff + 1] === b[firstDiff] &&
        a.slice(firstDiff + 2) === b.slice(firstDiff + 2)
      );
    }
    return false;
  }
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] !== longer[j]) {
      if (skipped) return false;
      skipped = true;
      j++;
    } else {
      i++;
      j++;
    }
  }
  return true;
}

function suggestedProviderDomain(domain: string): string {
  for (const provider of KNOWN_MAIL_PROVIDERS) {
    if (domain === provider) return '';
    const providerName = provider.slice(0, provider.indexOf('.'));
    const dot = domain.indexOf('.');
    const domainName = dot === -1 ? domain : domain.slice(0, dot);
    if (domainName === providerName) return provider;
    if (isOneLetterSlip(domainName, providerName)) return provider;
  }
  return '';
}

export function emailError(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return 'Email is required.';
  if (!EMAIL_RE.test(text)) return 'Enter a valid email address, like name@school.edu.ph.';
  const at = text.lastIndexOf('@');
  const localPart = text.slice(0, at);
  const domain = text.slice(at + 1).toLowerCase();
  const suggestion = suggestedProviderDomain(domain);
  if (suggestion) return `Did you mean ${localPart}@${suggestion}?`;
  return '';
}

export const BIRTHDATE_HINT = 'Needed before the student can set up guardian access.';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function birthdateError(value: unknown, { required = true } = {}): string {
  const text = String(value ?? '').trim();
  if (!text) return required ? 'Birthdate is required — the student cannot set up guardian access without it.' : '';
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!ISO_DATE_RE.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    return 'Enter the birthdate as YYYY-MM-DD.';
  }
  if (text > new Date().toISOString().slice(0, 10)) return 'Birthdate cannot be in the future.';
  return '';
}

const PHONE_CHARS_RE = /^\+?[\d\s()-]+$/;

export function phoneError(value: unknown, { required = true } = {}): string {
  const text = String(value ?? '').trim();
  if (!text) return required ? 'Phone number is required.' : '';
  const digits = text.replace(/\D/g, '');
  if (!PHONE_CHARS_RE.test(text) || digits.length < 7 || digits.length > 13) {
    return 'Enter a valid phone number, like 0917 123 4567.';
  }
  return '';
}

export function normalizePhone(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.startsWith('63') ? `0${digits.slice(2)}` : digits;
}

export const PHONE_IN_USE_ERROR =
  'That phone number is already on another account. Double-check what you typed, or use a different number.';

export function linkError(value: unknown, { label = 'Link' } = {}): string {
  const text = String(value ?? '').trim();
  if (!text) return `${label} is required.`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return `${label} must be a full web address starting with https://.`;
  }
  if (url.protocol !== 'https:' || !url.hostname.includes('.')) {
    return `${label} must be a full web address starting with https://.`;
  }
  return '';
}

export const SUBMISSION_NOTE_MAX = 500;
export function submissionNoteError(value: unknown): string {
  const text = String(value ?? '').trim();
  if (text.length > SUBMISSION_NOTE_MAX) return `The note is too long (${SUBMISSION_NOTE_MAX} characters at most).`;
  return '';
}
