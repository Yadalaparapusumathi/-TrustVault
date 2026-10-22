import { describe, expect, it } from 'vitest';
import { readCookie } from './cookies';

describe('readCookie', () => {
  const jar = 'theme=dark; XSRF-TOKEN=abc%2D123; other-XSRF-TOKEN=nope;  spaced = yes ';
  it('reads and decodes an exact cookie name', () => {
    expect(readCookie('XSRF-TOKEN', jar)).toBe('abc-123');
  });
  it('does not match suffixes of other cookie names', () => {
    expect(readCookie('XSRF-TOKEN', 'other-XSRF-TOKEN=nope')).toBeNull();
  });
  it('returns null when missing or jar empty', () => {
    expect(readCookie('missing', jar)).toBeNull();
    expect(readCookie('XSRF-TOKEN', '')).toBeNull();
  });
});
