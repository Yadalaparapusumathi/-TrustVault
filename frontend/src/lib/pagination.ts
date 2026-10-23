/** Returns page indices with `null` gaps, e.g. [0, null, 4, 5, 6, null, 19]. */
export function pageWindow(page: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
  const result: (number | null)[] = [0];
  const start = Math.max(1, page - 1);
  const end = Math.min(totalPages - 2, page + 1);
  if (start > 1) result.push(null);
  for (let i = start; i <= end; i++) result.push(i);
  if (end < totalPages - 2) result.push(null);
  result.push(totalPages - 1);
  return result;
}

export const DEFAULT_PAGE_SIZES = [10, 20, 50, 100] as const;
