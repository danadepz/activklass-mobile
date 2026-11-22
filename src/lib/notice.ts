export const NOTICE_DURATION_MS = 3000;

let message: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export function subscribeNotice(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getNotice() {
  return message;
}

function publish(value: string | null) {
  message = value;
  listeners.forEach(listener => listener());
}

export function showNotice(title: string, detail: string) {
  clearTimeout(timer);
  publish(`${title}. ${detail}`);
  timer = setTimeout(() => publish(null), NOTICE_DURATION_MS);
}
