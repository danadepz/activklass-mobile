/**
 * Institution-issued logins.
 *
 * Port of activklass-web/src/lib/logins.js. Keep the two in step.
 *
 * ActivKlass has no mail domain, so the login a student sees and types is just
 * `<prefix>-<last 6 digits>` — the prefix the school's admin configured plus
 * the last six digits of the student's LRN, e.g. `srnhs-200012`. Firebase Auth
 * only signs in by email, so INTERNAL_LOGIN_SUFFIX is appended behind the
 * scenes: by the server when the account is created, and by the sign-in screen
 * when someone types an issued login. The suffix is never shown to anyone.
 *
 * This screen used to refuse anything without an `@` outright, which locked
 * every school-issued student account out of the app — including the demo
 * student. A guardian, who registers with a real address, was never affected,
 * which is why it went unnoticed.
 */
export const INTERNAL_LOGIN_SUFFIX = '@activklass.internal';

/**
 * What signInWithEmailAndPassword needs: a real email passes through, an
 * issued login gets the internal suffix appended.
 */
export function toAuthEmail(loginOrEmail: unknown): string {
  const text = String(loginOrEmail ?? '').trim();
  return text.includes('@') ? text : `${text.toLowerCase()}${INTERNAL_LOGIN_SUFFIX}`;
}

/**
 * True for the shape a school-issued login always has: the school's prefix
 * (2–12 letters or digits) then a hyphen then exactly six digits. The backend
 * mints them with the same rule, so a login ID that does not match this was
 * never issued by anyone.
 */
export function isIssuedLoginId(loginOrEmail: unknown): boolean {
  return /^[a-z0-9]{2,12}-\d{6}$/.test(String(loginOrEmail ?? '').trim().toLowerCase());
}

/**
 * What to say when Firebase rejects the credentials.
 *
 * The field takes two different things — a guardian uses their email address,
 * a student uses the login ID their school issued — and the client cannot tell
 * a wrong password from a wrong identifier: Firebase deliberately returns the
 * same code for both. So the guidance names both kinds of account and lets the
 * reader pick their own half, rather than guessing for them.
 *
 * The one thing that IS knowable is the identifier's shape: text with no `@`
 * that is not an issued login ("carlo", "s1") is neither credential, and
 * `toAuthEmail` will have sent it to an account that cannot exist. That case
 * says so instead of blaming the password.
 */
export function wrongCredentialMessage(loginOrEmail: unknown): string {
  const text = String(loginOrEmail ?? '').trim();
  const opening =
    text.includes('@') || isIssuedLoginId(text)
      ? 'Incorrect login or password.'
      : 'That is not an email address or a login ID.';
  return (
    `${opening} If you are a parent, sign in with the email address you registered with; ` +
    'if your school set up your account, use the login ID it gave you, like snhs-123456.'
  );
}
