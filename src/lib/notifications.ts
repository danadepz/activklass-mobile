/**
 * The signed-in user's notifications.
 *
 * Written by teachers from the web app (activklass-web src/lib/notifications.js
 * `notifyStudents`) — one document per recipient, which is what lets a rule
 * scope a read to `resource.data.user_id == request.auth.uid`. Mobile had no
 * way to see them at all until now.
 *
 * The rules allow the recipient exactly one write: flipping `read`. Everything
 * else on the document belongs to whoever created it.
 */
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';

export interface AppNotification {
  id: string;
  type: string | null;
  message: string;
  class_id: string | null;
  link: string | null;
  read: boolean;
  /** Millis since epoch, or null while the server timestamp is still pending. */
  created_at: number | null;
}

function toNotification(id: string, data: any): AppNotification {
  return {
    id,
    type: data.type ?? null,
    message: data.message ?? '',
    class_id: data.class_id ?? null,
    link: data.link ?? null,
    read: data.read === true,
    created_at: data.created_at?.toMillis?.() ?? null,
  };
}

/** Newest first. Sorted here rather than with orderBy so the query needs no
 *  composite index alongside the user_id filter. */
function byNewest(a: AppNotification, b: AppNotification) {
  return (b.created_at ?? 0) - (a.created_at ?? 0);
}

/**
 * Live subscription, so the bell's badge updates without a refresh.
 * Returns the unsubscribe function; callers must invoke it on unmount.
 */
export function watchMyNotifications(
  onChange: (items: AppNotification[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};

  return onSnapshot(
    query(collection(db, 'notifications'), where('user_id', '==', uid)),
    (snap) => onChange(snap.docs.map((d) => toNotification(d.id, d.data())).sort(byNewest)),
    (err) => onError?.(err)
  );
}

export async function listMyNotifications(): Promise<AppNotification[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const snap = await getDocs(query(collection(db, 'notifications'), where('user_id', '==', uid)));
  return snap.docs.map((d) => toNotification(d.id, d.data())).sort(byNewest);
}

export async function markRead(id: string): Promise<void> {
  await updateDoc(doc(db, 'notifications', id), { read: true });
}

/** Chunked at 500, the writeBatch limit — past it commit() rejects and nothing
 *  is marked at all. */
export async function markAllRead(items: AppNotification[]): Promise<void> {
  const unread = items.filter((n) => !n.read);
  for (let i = 0; i < unread.length; i += 500) {
    const batch = writeBatch(db);
    unread.slice(i, i + 500).forEach((n) => {
      batch.update(doc(db, 'notifications', n.id), { read: true });
    });
    await batch.commit();
  }
}
