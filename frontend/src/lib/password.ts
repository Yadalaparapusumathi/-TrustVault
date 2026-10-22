const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+?';
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

/** Unbiased random index in [0, max) using rejection sampling over crypto.getRandomValues. */
function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0] ?? 0;
    if (v < limit) return v % max;
  }
}

function pick(chars: string): string {
  return chars.charAt(randomIndex(chars.length));
}

/** Generates a strong random password containing every character class. */
export function generatePassword(length = 20): string {
  const size = Math.max(length, 12);
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < size) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    const tmp = chars[i] as string;
    chars[i] = chars[j] as string;
    chars[j] = tmp;
  }
  return chars.join('');
}

export const MIN_PASSWORD_LENGTH = 12;

export interface PasswordStrength {
  /** 0 (very weak) .. 4 (strong) */
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Very weak' | 'Weak' | 'Fair' | 'Good' | 'Strong';
}

const LABELS: PasswordStrength['label'][] = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];

/** Heuristic strength estimate for UX only; the server enforces the real policy. */
export function estimateStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: 'Very weak' };
  let points = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) points += 1;
  if (password.length >= 16) points += 1;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes >= 3) points += 1;
  if (classes === 4 && password.length >= 14) points += 1;
  if (/(.)\1{2,}/.test(password) || /^(?:password|qwerty|letmein|welcome|admin)/i.test(password)) {
    points = Math.max(0, points - 2);
  }
  if (password.length < MIN_PASSWORD_LENGTH) points = Math.min(points, 1);
  const score = Math.min(4, points) as PasswordStrength['score'];
  return { score, label: LABELS[score] ?? 'Very weak' };
}
