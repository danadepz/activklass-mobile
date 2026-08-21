/**
 * Teacher display names, by uid.
 *
 * Both class lists needed this and both had their own copy, which is how the
 * same bug shipped twice: each ran a QUERY — `users where('id','==',teacherId)`
 * — to fetch one document. That is a list operation, and the rule letting a
 * student see a teacher tests `resource.data.role`, so the query was denied
 * outright and every card silently fell back to a hardcoded "Mrs. Santos". It
 * also depended on a redundant `id` field inside the document when the uid is
 * already the document id.
 *
 * A get by id is what the rules actually permit, and it needs no index.
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

/** Process-wide, because a student's classes are usually a handful of teachers
 *  and both screens re-resolve the same people on every snapshot. */
const cache = new Map<string, string>();

export const TEACHER_FALLBACK = 'Your teacher';

export async function teacherNameFor(teacherId: string | null | undefined): Promise<string> {
  if (!teacherId) return TEACHER_FALLBACK;

  const hit = cache.get(teacherId);
  if (hit) return hit;

  try {
    const snap = await getDoc(doc(db, 'users', teacherId));
    const data = snap.data();
    const name = data ? `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() : '';
    if (!name) return TEACHER_FALLBACK;
    cache.set(teacherId, name);
    return name;
  } catch {
    // A missing or unreadable profile is not worth a console error on every
    // snapshot — the fallback already reads sensibly on the card.
    return TEACHER_FALLBACK;
  }
}
