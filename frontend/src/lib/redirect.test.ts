import { describe, expect, it } from 'vitest';
import { isSafeNext, loginPathWithNext, safeNext } from './redirect';

describe('isSafeNext', () => {
  it.each(['/documents', '/documents/123?tab=access', '/admin/audit?outcome=DENIED#x', '/%0a'])('accepts same-origin path %s', (v) => {
    expect(isSafeNext(v)).toBe(true);
  });

  it.each([
    null,
    undefined,
    '',
    'documents',
    '//evil.example',
    '/\\evil.example',
    '/\\/evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    '/foo\nbar',
  ])('rejects %s', (v) => {
    expect(isSafeNext(v)).toBe(false);
  });
});

describe('safeNext', () => {
  it('falls back for unsafe or auth targets', () => {
    expect(safeNext('//evil.example')).toBe('/documents');
    expect(safeNext('/login?next=/x')).toBe('/documents');
    expect(safeNext(null, '/home')).toBe('/home');
  });
  it('returns safe targets unchanged', () => {
    expect(safeNext('/documents/1?tab=versions')).toBe('/documents/1?tab=versions');
  });
});

describe('loginPathWithNext', () => {
  it('encodes the current location', () => {
    expect(loginPathWithNext('/documents?scope=shared')).toBe('/login?next=%2Fdocuments%3Fscope%3Dshared');
  });
  it('omits next for root, login, and unsafe paths', () => {
    expect(loginPathWithNext('/')).toBe('/login');
    expect(loginPathWithNext('/login')).toBe('/login');
    expect(loginPathWithNext('//evil')).toBe('/login');
  });
});
