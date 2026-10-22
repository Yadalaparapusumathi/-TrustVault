/** Reads a (non-HttpOnly) cookie value. Returns null when absent. */
export function readCookie(name: string, cookieString: string = document.cookie): string | null {
  if (!cookieString) return null;
  for (const part of cookieString.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    const raw = part.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}
