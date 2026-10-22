/**
 * Extracts the filename from a Content-Disposition header.
 * Prefers RFC 5987 `filename*=UTF-8''…` over the plain `filename=` parameter.
 * The result is sanitised so it can never contain path separators or control characters.
 */
export function parseContentDispositionFilename(header: string | null | undefined): string | null {
  if (!header) return null;

  const star = /filename\*\s*=\s*([^;]+)/i.exec(header);
  if (star?.[1]) {
    const value = star[1].trim().replace(/^"(.*)"$/, '$1');
    const match = /^([\w!#$%&+^`{}~.-]*)'[^']*'(.*)$/.exec(value);
    const charset = match?.[1]?.toLowerCase() ?? '';
    const encoded = match ? match[2] : value;
    if (!match || charset === 'utf-8' || charset === '') {
      try {
        const decoded = decodeURIComponent(encoded ?? '');
        const clean = sanitizeFilename(decoded);
        if (clean) return clean;
      } catch {
        // fall through to plain filename
      }
    }
  }

  const quoted = /filename\s*=\s*"((?:\\.|[^"\\])*)"/i.exec(header);
  if (quoted?.[1] !== undefined) {
    const clean = sanitizeFilename(quoted[1].replace(/\\(.)/g, '$1'));
    if (clean) return clean;
  }

  const plain = /filename\s*=\s*([^;"\s]+)/i.exec(header);
  if (plain?.[1]) {
    const clean = sanitizeFilename(plain[1]);
    if (clean) return clean;
  }
  return null;
}

export function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[/\\]/g, '_').trim();
  if (cleaned === '.' || cleaned === '..') return '';
  return cleaned.slice(0, 255);
}
