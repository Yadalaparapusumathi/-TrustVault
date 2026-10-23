import type { Role } from '@/api/types';

export const DEFAULT_AFTER_LOGIN = '/documents';

export function homeForRole(role: Role): string {
  return role === 'ADMIN' ? '/admin' : '/workspace';
}

/**
 * Validates a `next` redirect target to prevent open redirects.
 * Only same-origin absolute paths are allowed: they must start with a single "/" and
 * must not start with "//" or "/\" (which browsers treat as protocol-relative URLs).
 */
export function isSafeNext(next: string | null | undefined): next is string {
  if (!next || typeof next !== 'string') return false;
  if (!next.startsWith('/')) return false;
  if (next.startsWith('//') || next.startsWith('/\\')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return false;
  try {
    const base = 'http://trustvault.invalid';
    const url = new URL(next, base);
    return url.origin === base;
  } catch {
    return false;
  }
}

export function safeNext(next: string | null | undefined, fallback: string = DEFAULT_AFTER_LOGIN): string {
  if (!isSafeNext(next)) return fallback;
  // Never bounce back to auth pages.
  if (next === '/login' || next.startsWith('/login?')) return fallback;
  return next;
}

/** Builds `/login?next=…` from the current location, dropping unsafe values. */
export function loginPathWithNext(current: string): string {
  if (!isSafeNext(current) || current.startsWith('/login') || current === '/') return '/login';
  return `/login?next=${encodeURIComponent(current)}`;
}
