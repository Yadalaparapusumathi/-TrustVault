import { useMemo, useState } from 'react';
import type { PaginationProps } from './Pagination';

export interface UsePaginationOptions {
  initialSize?: number;
  /** Changing this value (e.g. a filter string) returns to the first page. */
  resetKey?: unknown;
}

/** Client-side paging for lists that are already fully loaded. Pair with `<Pagination {...pagination} />`. */
export function usePagination<T>(items: readonly T[], { initialSize = 20, resetKey }: UsePaginationOptions = {}) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(initialSize);
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (!Object.is(lastResetKey, resetKey)) {
    setLastResetKey(resetKey);
    setPage(0);
  }

  const totalElements = items.length;
  const totalPages = Math.max(1, Math.ceil(totalElements / size));
  // Clamp so removing the last row of the final page never strands the view on an empty page.
  const current = Math.min(page, totalPages - 1);
  const pageItems = useMemo(() => items.slice(current * size, (current + 1) * size), [items, current, size]);

  const pagination: Omit<PaginationProps, 'className' | 'itemLabel'> = {
    page: current,
    size,
    totalPages,
    totalElements,
    onPageChange: setPage,
    onSizeChange: (next) => {
      setSize(next);
      setPage(0);
    },
  };
  return { pageItems, pagination };
}
