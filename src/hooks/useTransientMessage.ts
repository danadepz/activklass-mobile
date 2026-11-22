import { useCallback, useEffect, useState } from 'react';
import { NOTICE_DURATION_MS } from '../lib/notice';

export function useTransientMessage() {
  const [notice, setNotice] = useState<{ message: string } | null>(null);
  const show = useCallback((message: string | null) => setNotice(message ? { message } : null), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(current => current === notice ? null : current), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  return [notice?.message ?? null, show] as const;
}
