/**
 * Flask API client.
 *
 * The parent portal reads through this rather than hitting Firestore directly.
 * That is not a style preference — attendance documents hold a records map for
 * the WHOLE class, and a Firestore rule can only allow or deny an entire
 * document, so the backend is the only place the data can be filtered down to
 * one child. See firestore.rules (classes/{id}/attendance) in activklass-backend.
 *
 * Every request carries the Firebase ID token; the backend resolves the
 * guardian link and the visibility scopes from it.
 */
import { auth } from '../config/firebase';

// Static dot notation only — Expo inlines process.env.EXPO_PUBLIC_* at build
// time and bracket access or destructuring is NOT replaced.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

/** Backend error codes worth branching on (see docs/07 §3). */
export type ApiErrorCode =
  | 'not_linked'
  | 'awaiting_approval'
  | 'scope_denied'
  | 'not_enrolled'
  | 'invalid_code'
  | 'minor_consent_locked'
  | 'firestore_unavailable'
  | 'unauthorized'
  | 'forbidden'
  | 'not_registered'
  | 'network'
  | 'unknown';

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  /** Which visibility toggle was off, when code === 'scope_denied'. */
  scope?: string;

  constructor(message: string, code: ApiErrorCode, status: number, scope?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.scope = scope;
  }
}

function requireBaseUrl(): string {
  if (!BASE_URL) {
    throw new ApiError(
      'The app is not configured to reach the server. Set EXPO_PUBLIC_API_URL in .env.',
      'unknown',
      0
    );
  }
  return BASE_URL.replace(/\/+$/, '');
}

async function authHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiError('You are signed out. Please sign in again.', 'unauthorized', 401);
  }
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Query string values; undefined/null entries are dropped. */
  params?: Record<string, string | undefined | null>;
}

export async function api<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params } = options;
  const base = requireBaseUrl();

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value != null && value !== '') query.append(key, value);
  }
  const qs = query.toString();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}${qs ? `?${qs}` : ''}`;

  const headers: Record<string, string> = { ...(await authHeader()) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch only rejects on transport failure, so this is genuinely "no network"
    // — worth its own code because the fix is the user's, not ours.
    throw new ApiError(
      'Could not reach the server. Check your connection and try again.',
      'network',
      0
    );
  }

  // A misconfigured URL returns an HTML error page, not JSON; parsing it as
  // JSON would surface a confusing SyntaxError instead of the real problem.
  const raw = await response.text();
  let payload: any = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.message || payload?.error || `Request failed (${response.status})`,
      (payload?.error as ApiErrorCode) || 'unknown',
      response.status,
      payload?.scope
    );
  }

  return payload as T;
}

/** True when the guardian is linked but the student has not approved yet. */
export function isAwaitingApproval(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code === 'awaiting_approval';
}

/** True when the student has switched this particular section off. */
export function isScopeDenied(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code === 'scope_denied';
}

export function errorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
