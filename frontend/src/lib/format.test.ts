import { describe, expect, it } from 'vitest';
import { fileBaseName, fileExtension, formatBytes, formatRelative, humanizeEnum, initials, parseIsoDate, shortHash } from './format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1,023 B'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [20 * 1024 * 1024, '20 MB'],
    [-1, '—'],
  ])('%d -> %s', (input, expected) => {
    expect(formatBytes(input, 'en-US')).toBe(expected);
  });
});

describe('formatRelative', () => {
  const now = Date.parse('2026-03-01T12:00:00Z');
  it('formats past and future offsets', () => {
    expect(formatRelative('2026-03-01T11:59:50Z', now, 'en')).toBe('just now');
    expect(formatRelative('2026-03-01T09:00:00Z', now, 'en')).toBe('3 hours ago');
    expect(formatRelative('2026-02-28T12:00:00Z', now, 'en')).toBe('yesterday');
    expect(formatRelative('2026-03-03T12:00:00Z', now, 'en')).toBe('in 2 days');
    expect(formatRelative('2026-03-01T11:55:00Z', now, 'en')).toBe('5 minutes ago');
  });
  it('handles invalid input', () => {
    expect(formatRelative('not a date', now, 'en')).toBe('—');
  });
});

describe('misc helpers', () => {
  it('initials', () => {
    expect(initials('Alice Owner')).toBe('AO');
    expect(initials('jean-luc picard')).toBe('JP');
    expect(initials('bob')).toBe('B');
    expect(initials('   ')).toBe('?');
  });
  it('humanizeEnum', () => {
    expect(humanizeEnum('DOCUMENT_DOWNLOADED')).toBe('Document downloaded');
  });
  it('shortHash', () => {
    expect(shortHash('a'.repeat(64), 8)).toBe('aaaaaaaa…');
    expect(shortHash('abc')).toBe('abc');
  });
  it('file name helpers', () => {
    expect(fileBaseName('Q3 plan.final.xlsx')).toBe('Q3 plan.final');
    expect(fileBaseName('.env')).toBe('.env');
    expect(fileExtension('Photo.JPG')).toBe('jpg');
  });
  it('parseIsoDate uses local calendar dates', () => {
    const d = parseIsoDate('2026-01-31');
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(0);
    expect(d?.getDate()).toBe(31);
    expect(parseIsoDate('31/01/2026')).toBeNull();
  });
});
