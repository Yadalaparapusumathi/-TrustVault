import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePagination } from './usePagination';

const items = Array.from({ length: 25 }, (_, i) => i);

describe('usePagination', () => {
  it('slices the current page and resizes from the first page', () => {
    const { result } = renderHook(() => usePagination(items, { initialSize: 10 }));
    expect(result.current.pageItems).toEqual(items.slice(0, 10));
    expect(result.current.pagination.totalPages).toBe(3);
    act(() => result.current.pagination.onPageChange(2));
    expect(result.current.pageItems).toEqual([20, 21, 22, 23, 24]);
    act(() => result.current.pagination.onSizeChange?.(20));
    expect(result.current.pagination.page).toBe(0);
    expect(result.current.pageItems).toHaveLength(20);
  });

  it('clamps to the last page when rows are removed and resets when the reset key changes', () => {
    const { result, rerender } = renderHook(({ list, key }) => usePagination(list, { initialSize: 10, resetKey: key }), {
      initialProps: { list: items, key: 'a' },
    });
    act(() => result.current.pagination.onPageChange(2));
    rerender({ list: items.slice(0, 20), key: 'a' });
    expect(result.current.pagination.page).toBe(1);
    expect(result.current.pageItems).toEqual(items.slice(10, 20));
    rerender({ list: items.slice(0, 20), key: 'b' });
    expect(result.current.pagination.page).toBe(0);
  });
});
