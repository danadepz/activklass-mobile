/**
 * Guardian codes and links, read and written straight against Firestore.
 *
 * Why not the Flask API
 * ---------------------
 * A guardian has no account when they type their child's code, and
 * /api/guardian-links/redeem is gated on the parent role — so the code could
 * only ever be checked AFTER the account existed. That is what produced the
 * old flow, where a wrong code still let someone register and then failed.
 * Checking a code before sign-up needs a store the unauthenticated device can
 * read, and Firestore is already the system of record.
 *
 * The document id IS the code
 * ---------------------------
 * `guardian_codes/{CODE}` rather than a `code` field, for two reasons:
 *   1. Security rules cannot run a query, only get() a known path. A rule can
 *      rebuild this path; it could never resolve a where-clause.
 *   2. Uniqueness comes free. Firestore `create` only applies when the document
 *      is absent, so two students can never hold the same code.
 *
 * Reading one is therefore a capability check: you must already know the six
 * characters, and there is no way to list or enumerate them (firestore.rules
 * allows `get`, never `list`). That is the same property the code has when a
 * student reads it aloud to a parent.
 *
 * Trusting `is_minor`
 * -------------------
 * It is derived on the student's device from the `birthdate` on their profile,
 * and it decides whether a guardian unlocks on redeem or waits for approval.
 * What makes that safe is not this file: firestore.rules lets a student change
 * only `photo_url` on their own profile, so birthdate is registrar data owned
 * by their teacher and a student cannot move their own age gate. The rules then
 * re-derive status and scopes from the code document rather than believing what
 * the guardian app writes. See firestore.rules (guardian_codes, guardian_links)
 * in activklass-backend.
 */
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  arrayUnion,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import type { GuardianScopes, LinkStatus } from './parent';

/** Omits O/0/I/1 — these codes get read aloud and copied by hand. Matches
 *  SHARE_CODE_ALPHABET in the backend's app/models/identity.py. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

const AGE_OF_MAJORITY = 18;

/** Normalises what the user typed: codes are shown in groups and read aloud. */
export function normaliseCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

/** A student's share code. Publicly readable BY ID only — see the file note. */
export interface GuardianCodeDoc {
  code: string;
  student_uid: string;
  /** Shown back to the guardian so they can confirm they typed the right code. */
  student_name: string;
  student_number: string | null;
  grade_level: string | null;
  /** null when the birthdate is unknown, which resolves to the adult path. */
  is_minor: boolean | null;
}

export interface GuardianLinkDoc {
  link_id: string;
  student_uid: string;
  guardian_uid: string;
  guardian_name: string | null;
  guardian_email: string | null;
  relationship_type: string | null;
  status: LinkStatus;
  scopes: GuardianScopes;
  is_minor: boolean;
  /** Denormalised so a guardian can name their child without reading the
   *  student's profile — which the rules deny until the link is approved. */
  student_name: string;
  student_number: string | null;
  grade_level: string | null;
}

export const ALL_SCOPES_ON: GuardianScopes = {
  can_view_grades: true,
  can_view_quiz_scores: true,
  can_view_attendance: true,
  can_view_analytics: true,
};

export const ALL_SCOPES_OFF: GuardianScopes = {
  can_view_grades: false,
  can_view_quiz_scores: false,
  can_view_attendance: false,
  can_view_analytics: false,
};

/** The four toggles, in the order the student's panel renders them. */
export const SCOPE_LABELS: { key: keyof GuardianScopes; label: string }[] = [
  { key: 'can_view_grades', label: 'Grades' },
  { key: 'can_view_quiz_scores', label: 'Quiz & activity scores' },
  { key: 'can_view_attendance', label: 'Attendance record' },
  { key: 'can_view_analytics', label: 'Subject analytics' },
];

export class GuardianCodeError extends Error {
  code: 'invalid_format' | 'not_found' | 'already_linked' | 'own_code' | 'permission';

  constructor(message: string, code: GuardianCodeError['code']) {
    super(message);
    this.name = 'GuardianCodeError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Age
// ---------------------------------------------------------------------------

/**
 * Whole years, or null when the birthdate is missing or unparseable.
 * Mirrors age_from_birthdate in the backend's services/guardian_access.py.
 */
export function ageFromBirthdate(value: unknown, today = new Date()): number | null {
  if (value == null || value === '') return null;

  let born: Date | null = null;
  if (value instanceof Timestamp) born = value.toDate();
  else if (value instanceof Date) born = value;
  else {
    const text = String(value).trim();
    // 'YYYY-MM-DD' parsed by hand: new Date('2005-03-04') is UTC midnight, which
    // is the previous day in UTC+8 and shifts every birthday by one.
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (iso) born = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    else {
      const parsed = new Date(text);
      born = Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  if (born == null || Number.isNaN(born.getTime())) return null;

  let age = today.getFullYear() - born.getFullYear();
  const beforeBirthday =
    today.getMonth() < born.getMonth() ||
    (today.getMonth() === born.getMonth() && today.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

/**
 * True / False, or null when we cannot tell.
 *
 * null matters: an unknown birthdate must NOT be treated as under-18, because
 * that would unlock a guardian's access with nobody consenting. Callers resolve
 * null to the adult path, which gates on the student approving instead.
 */
export function isMinor(birthdate: unknown, today = new Date()): boolean | null {
  const age = ageFromBirthdate(birthdate, today);
  return age == null ? null : age < AGE_OF_MAJORITY;
}

// ---------------------------------------------------------------------------
// Student side: minting and rotating the code
// ---------------------------------------------------------------------------

/**
 * A code is the credential that attaches a guardian to a child's records, so
 * it is drawn from crypto rather than Math.random where the runtime offers it.
 * Kept in step with the web copy in activklass-web/src/lib/guardianCodes.js.
 *
 * CODE_ALPHABET is exactly 32 characters and 256 divides evenly by 32, so
 * `byte % 32` is unbiased. An alphabet of any other size would need rejection
 * sampling -- do not shorten it without changing this.
 *
 * The Math.random branch is a fallback for a runtime without
 * crypto.getRandomValues, and is no weaker than what it replaces. It is not
 * expected to run on Expo SDK 57.
 */
function randomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  const webCrypto = (globalThis as any).crypto;
  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new GuardianCodeError('You are signed out. Please sign in again.', 'permission');
  return uid;
}

function displayName(profile: Record<string, any>): string {
  const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
  return name || profile.email || 'Student';
}

function codePayload(
  uid: string,
  code: string,
  profile: Record<string, any>,
  carriedRevocations: string[] = [],
) {
  return {
    code,
    student_uid: uid,
    student_name: displayName(profile),
    student_number: profile.student_number ?? null,
    grade_level: profile.grade_level ?? profile.year_level ?? null,
    is_minor: isMinor(profile.birthdate),
    // Starting permissions for a guardian this student later approves. Kept on
    // the code document because it is the only thing a student owns before any
    // guardian exists -- their users/{uid} profile is write-locked to
    // photo_url. Open by default: redeeming a code the student handed over is
    // itself the grant, and they narrow from there.
    default_scopes: { ...ALL_SCOPES_ON },
    // Guardians removed under the PREVIOUS code stay removed -- see
    // rotateMyGuardianCode for why this is carried rather than reset.
    revoked_guardian_uids: [...carriedRevocations],
    created_at: serverTimestamp(),
  };
}

/**
 * Write a fresh code document, retrying past the rare id collision.
 *
 * `create` is enforced by the rules, not requested here: setDoc on an existing
 * document is an update, and the update rule denies it unless the caller owns
 * that document. So a collision surfaces as permission-denied, which is what we
 * retry on. Any other permission-denied would have failed on the first attempt
 * too, and falls out of the loop.
 */
async function mintCode(
  uid: string,
  profile: Record<string, any>,
  carriedRevocations: string[] = [],
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = randomCode();
    try {
      await setDoc(
        doc(db, 'guardian_codes', candidate),
        codePayload(uid, candidate, profile, carriedRevocations),
      );
      return candidate;
    } catch (err: any) {
      if (err?.code !== 'permission-denied' || attempt === 7) throw err;
    }
  }
  throw new GuardianCodeError('Could not allocate a code. Please try again.', 'permission');
}

/**
 * The code this student already holds, if any.
 *
 * Found by querying rather than by a pointer field on users/{uid}: students may
 * write only `photo_url` on their own profile, and widening that allowlist so a
 * student could store a code pointer would be a worse trade than one indexed
 * equality query. The rules allow this list only for the caller's own code.
 */
async function findMyCode(uid: string): Promise<string | null> {
  const snap = await getDocs(
    query(collection(db, 'guardian_codes'), where('student_uid', '==', uid))
  );
  const ids = snap.docs
    .map((d) => d.id)
    .filter((id) => CODE_PATTERN.test(id))
    /* Sorted explicitly rather than trusting the order Firestore returns: the
       WEB and the MOBILE copy of this function must pick the SAME survivor, or
       a student would read one code off their laptop and a different one off
       their phone. Sorting is the cheapest rule both can apply uncoordinated. */
    .sort();
  if (!ids.length) return null;

  /* A student must have exactly ONE live code, so the losers are deleted here
     rather than left redeemable. Duplicates arise if a rotation fails between
     minting and deleting, or if two devices mint at the same instant. Reading
     is the only moment both platforms reliably pass through, which makes it
     the place to converge. Failures are ignored: handing back a working code
     matters more than the tidy-up, and the next read tries again. */
  ids.slice(1).forEach((stale) => {
    deleteDoc(doc(db, 'guardian_codes', stale)).catch(() => {});
  });
  return ids[0];
}

/** This student's code, creating one on first call. */
export async function ensureMyGuardianCode(): Promise<string> {
  const uid = requireUid();
  const existing = await findMyCode(uid);
  if (existing) return existing;

  const profileSnap = await getDoc(doc(db, 'users', uid));
  return mintCode(uid, profileSnap.data() ?? {});
}

/**
 * Mint a new code and retire the old one.
 *
 * Guardians already connected stay connected — their link document is what
 * grants access, and it does not reference the code. Rotating only stops
 * anyone still holding the old six characters from redeeming them.
 */
export async function rotateMyGuardianCode(): Promise<string> {
  const uid = requireUid();
  const profileSnap = await getDoc(doc(db, 'users', uid));
  const previous = await findMyCode(uid);

  // Revocations survive rotation. A fresh code document starts with an empty
  // list, so rotating for an unrelated reason -- a code the student thinks has
  // leaked -- would otherwise quietly readmit every guardian anyone had
  // removed, including ones a teacher removed for a minor.
  //
  // Best effort by necessity: the rules cannot enforce the carry-forward,
  // because the create rule cannot see the document being replaced.
  const carried = previous
    ? (((await getDoc(doc(db, 'guardian_codes', previous))).data()
        ?.revoked_guardian_uids as string[] | undefined) ?? [])
    : [];

  const code = await mintCode(uid, profileSnap.data() ?? {}, carried);

  // Retire last. The new code is already live, so a failure here leaves the
  // student with two working codes rather than none — the safer half to fail.
  if (previous && previous !== code) {
    try {
      await deleteDoc(doc(db, 'guardian_codes', previous));
    } catch {
      /* a stale document is not worth failing the rotation over */
    }
  }
  return code;
}

// ---------------------------------------------------------------------------
// Guardian side: checking a code, then redeeming it
// ---------------------------------------------------------------------------

/**
 * Look up a code WITHOUT an account. This is the check the code screen runs
 * before it lets anyone reach the registration form.
 *
 * Throws rather than returning null for a bad code, so the caller has one
 * message-bearing failure path instead of two.
 */
export async function lookupGuardianCode(rawCode: string): Promise<GuardianCodeDoc> {
  const code = normaliseCode(rawCode);
  if (!CODE_PATTERN.test(code)) {
    throw new GuardianCodeError(
      'That code does not look right. It is 6 characters — letters and numbers, with no O, 0, I or 1.',
      'invalid_format'
    );
  }

  const snap = await getDoc(doc(db, 'guardian_codes', code));
  if (!snap.exists()) {
    throw new GuardianCodeError(
      'No student has that code. Check the six characters with your child — codes can be regenerated, so an old one stops working.',
      'not_found'
    );
  }

  const data = snap.data() as any;
  // A signed-in student typing their own code would otherwise be walked into a
  // sign-up form they cannot complete.
  if (auth.currentUser && data.student_uid === auth.currentUser.uid) {
    throw new GuardianCodeError('That is your own code. Give it to your guardian instead.', 'own_code');
  }

  return {
    code,
    student_uid: data.student_uid,
    student_name: data.student_name ?? 'Your child',
    student_number: data.student_number ?? null,
    grade_level: data.grade_level ?? null,
    is_minor: typeof data.is_minor === 'boolean' ? data.is_minor : null,
  };
}

/** '<student_uid>_<guardian_uid>' — the id a security rule can rebuild. */
export function linkDocId(studentUid: string, guardianUid: string): string {
  return `${studentUid}_${guardianUid}`;
}

/**
 * Create the link. Called once the guardian's account exists, because the
 * document records who they are.
 *
 * The status is NOT the client's decision even though the client writes it:
 * firestore.rules re-reads the code document and rejects any status other than
 * the one `is_minor` implies. A minor's guardian is the legal representative
 * and unlocks at once; everyone else waits for the student to approve.
 */
export async function createGuardianLink(
  codeDoc: GuardianCodeDoc,
  guardian: { uid: string; name: string; email: string },
  relationshipType?: string
): Promise<GuardianLinkDoc> {
  const minor = codeDoc.is_minor === true;
  const status: LinkStatus = minor ? 'approved' : 'pending';

  const payload: GuardianLinkDoc & { code: string } = {
    link_id: linkDocId(codeDoc.student_uid, guardian.uid),
    code: codeDoc.code,
    student_uid: codeDoc.student_uid,
    guardian_uid: guardian.uid,
    guardian_name: guardian.name || null,
    guardian_email: guardian.email || null,
    relationship_type: relationshipType?.trim() || null,
    status,
    // Redeeming the code is itself the grant, so an approved link starts wide
    // open and the student narrows down. A pending link sees nothing at all —
    // the rules read this map, so it cannot be left optimistic.
    scopes: minor ? { ...ALL_SCOPES_ON } : { ...ALL_SCOPES_OFF },
    is_minor: minor,
    student_name: codeDoc.student_name,
    student_number: codeDoc.student_number,
    grade_level: codeDoc.grade_level,
  };

  /* Check for an existing link by LISTING our own, not by reading the link
     document directly. The read rule tests `resource.data.guardian_uid`, and
     for a document that does not exist `resource` is null — so the rule errors
     and the read is denied. A getDoc here would therefore throw
     permission-denied on the ordinary path where there is nothing to find,
     and report "already linked" as a permission problem. Listing our own
     children is a query the rules do allow. */
  const mine = await listMyChildren();
  if (mine.some((link) => link.student_uid === codeDoc.student_uid)) {
    throw new GuardianCodeError(
      'You are already connected to this student. Open your dashboard to see them.',
      'already_linked'
    );
  }

  await setDoc(doc(db, 'guardian_links', payload.link_id), {
    ...payload,
    linked_at: serverTimestamp(),
  });
  return payload;
}

// ---------------------------------------------------------------------------
// Reading links back
// ---------------------------------------------------------------------------

function toLink(id: string, data: any): GuardianLinkDoc {
  return {
    link_id: id,
    student_uid: data.student_uid,
    guardian_uid: data.guardian_uid,
    guardian_name: data.guardian_name ?? null,
    guardian_email: data.guardian_email ?? null,
    relationship_type: data.relationship_type ?? null,
    status: (data.status ?? 'pending') as LinkStatus,
    scopes: { ...ALL_SCOPES_OFF, ...(data.scopes ?? {}) },
    is_minor: data.is_minor === true,
    student_name: data.student_name ?? 'Your child',
    student_number: data.student_number ?? null,
    grade_level: data.grade_level ?? null,
  };
}

/** Every student this guardian is connected to, pending ones included. */
export async function listMyChildren(): Promise<GuardianLinkDoc[]> {
  const uid = requireUid();
  const snap = await getDocs(
    query(collection(db, 'guardian_links'), where('guardian_uid', '==', uid))
  );
  return snap.docs.map((d) => toLink(d.id, d.data()));
}

/** Every guardian connected to this student. */
export async function listMyGuardians(): Promise<GuardianLinkDoc[]> {
  const uid = requireUid();
  const snap = await getDocs(
    query(collection(db, 'guardian_links'), where('student_uid', '==', uid))
  );
  return snap.docs.map((d) => toLink(d.id, d.data()));
}

// ---------------------------------------------------------------------------
// Student side: approving, narrowing, revoking
// ---------------------------------------------------------------------------

/**
 * May this student manage their own guardians?
 *
 * Adults yes; minors no; unknown birthdate yes — an unknown age takes the
 * privacy-protective path, which is the one requiring the student's consent.
 */
export function canManageOwnLinks(birthdate: unknown): boolean {
  return isMinor(birthdate) !== true;
}

/**
 * Approve a pending guardian, granting the student's chosen defaults.
 *
 * The rules allow any scopes map on this write, so the defaults are applied
 * here rather than server-side -- they are the student's own preference about
 * their own records, not a privilege boundary.
 */
export async function approveGuardianLink(
  linkId: string,
  scopes: GuardianScopes = ALL_SCOPES_ON
): Promise<void> {
  await updateDoc(doc(db, 'guardian_links', linkId), {
    status: 'approved',
    scopes: { ...scopes },
    approved_at: serverTimestamp(),
  });
}

/** The student's starting permissions for the next guardian they approve. */
export async function getDefaultScopes(code: string): Promise<GuardianScopes> {
  const snap = await getDoc(doc(db, 'guardian_codes', code));
  return { ...ALL_SCOPES_ON, ...((snap.data()?.default_scopes ?? {}) as Partial<GuardianScopes>) };
}

/** Only field on the code document a student may edit -- see firestore.rules. */
export async function setDefaultScopes(code: string, scopes: GuardianScopes): Promise<void> {
  await updateDoc(doc(db, 'guardian_codes', code), { default_scopes: { ...scopes } });
}

export async function setGuardianLinkScopes(
  linkId: string,
  scopes: GuardianScopes
): Promise<void> {
  await updateDoc(doc(db, 'guardian_links', linkId), { scopes });
}

/**
 * Revoking is a delete, so access stops the moment the document goes.
 *
 * The guardian is also recorded on the CODE. The code outlives the link --
 * there is no consumed flag and revoking does not rotate one -- so without
 * this a removed guardian could retype the same six characters, and for a
 * minor createGuardianLink auto-approves, restoring every scope with nobody
 * approving it. firestore.rules refuses anyone on that list.
 *
 * Marked before the delete: aborting with the guardian still attached is
 * visible and retryable, whereas deleting first and failing to mark would
 * look like a clean revoke while leaving the way back in.
 *
 * Kept in step with the web copy in activklass-web/src/lib/guardianCodes.js.
 */
export async function revokeGuardianLink(linkId: string): Promise<void> {
  const linkRef = doc(db, 'guardian_links', linkId);
  const link = (await getDoc(linkRef)).data() as { code?: string; guardian_uid?: string } | undefined;

  if (link?.code && link?.guardian_uid) {
    const codeRef = doc(db, 'guardian_codes', link.code);
    // An already-rotated code is dead to everyone; nothing to block.
    if ((await getDoc(codeRef)).exists()) {
      await updateDoc(codeRef, { revoked_guardian_uids: arrayUnion(link.guardian_uid) });
    }
  }

  await deleteDoc(linkRef);
}

/**
 * Profiles for a set of students, for the guardian dashboard.
 *
 * One getDoc per student rather than a single `documentId() in [...]` query.
 * The users read rule resolves a guardian through get()s on the link document,
 * and a query evaluates that rule once per document returned against a shared
 * allowance — so the batched version starts failing as a parent adds children,
 * while individual reads each get their own budget.
 *
 * A denial is expected, not exceptional: the rules refuse a PENDING guardian
 * the student's profile, which is the whole point of pending. Those fall back
 * to the name denormalised onto the link document.
 */
export async function fetchStudentProfiles(
  uids: string[]
): Promise<Record<string, Record<string, any>>> {
  const unique = Array.from(new Set(uids.filter(Boolean)));
  const out: Record<string, Record<string, any>> = {};

  const snaps = await Promise.all(
    unique.map((uid) =>
      getDoc(doc(db, 'users', uid)).catch(() => null)
    )
  );
  snaps.forEach((snap, i) => {
    if (snap?.exists()) out[unique[i]] = snap.data();
  });
  return out;
}
