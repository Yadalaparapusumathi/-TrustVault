import { describe, expect, it } from 'vitest';
import { parseContentDispositionFilename, sanitizeFilename } from './contentDisposition';

describe('parseContentDispositionFilename', () => {
  it('prefers RFC 5987 filename* over filename', () => {
    const h = `attachment; filename="fallback.pdf"; filename*=UTF-8''Q3%20R%C3%A9sum%C3%A9%20%E2%82%AC.pdf`;
    expect(parseContentDispositionFilename(h)).toBe('Q3 Résumé €.pdf');
  });
  it('parses quoted filenames with escapes', () => {
    expect(parseContentDispositionFilename('attachment; filename="board \\"final\\".docx"')).toBe('board "final".docx');
  });
  it('parses unquoted filenames', () => {
    expect(parseContentDispositionFilename('attachment; filename=report.csv')).toBe('report.csv');
  });
  it('falls back to filename when filename* is malformed', () => {
    expect(parseContentDispositionFilename(`attachment; filename*=UTF-8''%E0%A4%A; filename="ok.txt"`)).toBe('ok.txt');
  });
  it('neutralises path traversal', () => {
    expect(parseContentDispositionFilename('attachment; filename="../../etc/passwd"')).toBe('.._.._etc_passwd');
    expect(parseContentDispositionFilename(`attachment; filename*=UTF-8''..%2F..%5Csecret.txt`)).toBe('.._.._secret.txt');
  });
  it('returns null when absent', () => {
    expect(parseContentDispositionFilename(null)).toBeNull();
    expect(parseContentDispositionFilename('inline')).toBeNull();
  });
});

describe('sanitizeFilename', () => {
  it('strips control characters and dot names', () => {
    expect(sanitizeFilename('a\u0000b\u001f.txt')).toBe('ab.txt');
    expect(sanitizeFilename('..')).toBe('');
  });
});
