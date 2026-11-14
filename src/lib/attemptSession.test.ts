import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../config/firebase', () => ({ db: {} }));
vi.mock('./api', () => ({ api: vi.fn(async () => ({})) }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  collection: vi.fn((_db, name) => name),
  addDoc: vi.fn(async () => ({ collection: 'quiz_attempts', id: 'attempt' })),
  getDoc: vi.fn(),
  updateDoc: vi.fn(async () => {}),
  serverTimestamp: () => 'server-time',
  arrayUnion: vi.fn(), increment: vi.fn(),
}));
import { addDoc, getDoc, updateDoc } from 'firebase/firestore';
import { api } from './api';
import { finishAttempt, startAttempt } from './attemptSession';

const input = {
  quiz: { id: 'quiz', class_ids: ['class-other', 'class-selected'] },
  classId: 'class-selected', studentId: 'student', questions: [{ id: 'q1' }], attemptNumber: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDoc).mockImplementation(async (ref: any) => ({
    exists: () => true,
    data: () => ref.collection === 'classes'
      ? { student_ids: ['student'] }
      : { class_id: 'class-selected', started_at: { toMillis: () => 1000 } },
  } as any));
});

it('stores the actual selected class, never the first class in a shared quiz', async () => {
  await startAttempt(input);
  expect(getDoc).toHaveBeenCalledWith({ collection: 'classes', id: 'class-selected' });
  expect(addDoc).toHaveBeenCalledWith('quiz_attempts', expect.objectContaining({
    class_id: 'class-selected', quiz_id: 'quiz', student_id: 'student',
    status: 'in_progress', question_ids: ['q1'], started_at: 'server-time',
  }));
});

it('requires launch context even if only one array assignment exists', async () => {
  await expect(startAttempt({ ...input, classId: null, quiz: { id: 'quiz', class_ids: ['class-selected'] } }))
    .rejects.toThrow('assigned class');
  expect(addDoc).not.toHaveBeenCalled();
});

it('does not guess from the array when class context is missing', async () => {
  await expect(startAttempt({ ...input, classId: null })).rejects.toThrow('assigned class');
  expect(addDoc).not.toHaveBeenCalled();
});

it('rejects an arbitrary class even when the student is enrolled there', async () => {
  await expect(startAttempt({ ...input, classId: 'unassigned' })).rejects.toThrow('assigned class');
  expect(addDoc).not.toHaveBeenCalled();
});

it('canonical empty assignments override a stale legacy scalar', async () => {
  await expect(startAttempt({ ...input, quiz: { id: 'quiz', class_ids: [], class_id: 'class-selected' } }))
    .rejects.toThrow('assigned class');
  expect(addDoc).not.toHaveBeenCalled();
});

it('supports an unambiguous legacy scalar after checking enrollment', async () => {
  await startAttempt({ ...input, classId: null, quiz: { id: 'quiz', class_id: 'class-selected' } });
  expect(addDoc).toHaveBeenCalledWith('quiz_attempts', expect.objectContaining({ class_id: 'class-selected' }));
});

it.each([false, true])('refuses missing classes or missing enrollment before writing (exists=%s)', async (exists) => {
  vi.mocked(getDoc).mockResolvedValue({ exists: () => exists, data: () => ({ student_ids: ['someone-else'] }) } as any);
  await expect(startAttempt(input)).rejects.toThrow('not enrolled');
  expect(addDoc).not.toHaveBeenCalled();
});

it('does not write if the class cannot be read', async () => {
  vi.mocked(getDoc).mockRejectedValue(new Error('permission-denied'));
  await expect(startAttempt(input)).rejects.toThrow('permission-denied');
  expect(addDoc).not.toHaveBeenCalled();
});

it('preserves server-anchored timing and server-side submission without keys or client grades', async () => {
  await startAttempt({ ...input, quiz: { ...input.quiz, time_limit_minutes: 2 } });
  expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { expires_at_ms: 121000 });
  const payload = vi.mocked(addDoc).mock.calls[0][1];
  expect(payload).not.toHaveProperty('score');
  expect(payload).not.toHaveProperty('answer_key');
  await finishAttempt('attempt', { answers: { q1: 'option' } });
  expect(api).toHaveBeenCalledWith('/quiz_attempts/attempt/submit', {
    method: 'POST', body: { answers: { q1: 'option' }, expired: false },
  });
});
