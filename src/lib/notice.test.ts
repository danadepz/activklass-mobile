import { expect, it, vi } from 'vitest';
import { getNotice, showNotice, subscribeNotice } from './notice';

it('gives each notice three seconds, including a repeated report', () => {
  vi.useFakeTimers();
  const listener = vi.fn();
  const unsubscribe = subscribeNotice(listener);
  try {
    showNotice('Error', 'Could not save.');
    vi.advanceTimersByTime(2900);
    showNotice('Error', 'Could not save.');
    vi.advanceTimersByTime(2999);
    expect(getNotice()).toBe('Error. Could not save.');
    vi.advanceTimersByTime(1);
    expect(getNotice()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
  } finally {
    unsubscribe();
    vi.useRealTimers();
  }
});
