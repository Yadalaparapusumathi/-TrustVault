import { describe, expect, it } from 'vitest';
import { pageWindow } from './pagination';

describe('pageWindow', () => {
  it('lists all pages when few', () => {
    expect(pageWindow(0, 3)).toEqual([0, 1, 2]);
    expect(pageWindow(0, 0)).toEqual([]);
  });
  it('adds gaps around the current page', () => {
    expect(pageWindow(5, 20)).toEqual([0, null, 4, 5, 6, null, 19]);
    expect(pageWindow(0, 20)).toEqual([0, 1, null, 19]);
    expect(pageWindow(19, 20)).toEqual([0, null, 18, 19]);
  });
});
