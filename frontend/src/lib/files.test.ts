import { describe, expect, it } from 'vitest';
import { fileKind, MAX_UPLOAD_BYTES, precheckUpload } from './files';

function fakeFile(name: string, size: number): File {
  const file = new File(['x'], name);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('precheckUpload', () => {
  it('accepts allowed types within limit', () => {
    expect(precheckUpload(fakeFile('report.PDF', 1000))).toBeNull();
    expect(precheckUpload(fakeFile('photo.jpeg', MAX_UPLOAD_BYTES))).toBeNull();
  });
  it('rejects disallowed extensions, oversized and empty files', () => {
    expect(precheckUpload(fakeFile('evil.exe', 10))).toMatch(/not allowed/);
    expect(precheckUpload(fakeFile('noext', 10))).toMatch(/not allowed/);
    expect(precheckUpload(fakeFile('big.pdf', MAX_UPLOAD_BYTES + 1))).toMatch(/20 MB/);
    expect(precheckUpload(fakeFile('empty.txt', 0))).toMatch(/empty/);
  });
});

describe('fileKind', () => {
  it('maps content types', () => {
    expect(fileKind('application/pdf')).toBe('pdf');
    expect(fileKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('sheet');
    expect(fileKind('image/png')).toBe('image');
    expect(fileKind('application/octet-stream', 'a.csv')).toBe('csv');
    expect(fileKind(null)).toBe('other');
  });
});
