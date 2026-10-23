import { useId } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { DEFAULT_PAGE_SIZES, pageWindow } from '@/lib/pagination';
import { Button } from './Button';


export interface PaginationProps {
  /** 0-based page */
  page: number;
  size: number;
  totalPages: number;
  totalElements: number;
  onPageChange: (page: number) => void;
  /** When provided, a "Rows per page" selector is shown. */
  onSizeChange?: (size: number) => void;
  sizeOptions?: readonly number[];
  /** Noun used in the summary, e.g. "documents". */
  itemLabel?: string;
  className?: string;
}

export function Pagination({
  page,
  size,
  totalPages,
  totalElements,
  onPageChange,
  onSizeChange,
  sizeOptions = DEFAULT_PAGE_SIZES,
  itemLabel,
  className,
}: PaginationProps) {
  const sizeId = useId();
  if (totalElements === 0) return null;
  const pageCount = Math.max(totalPages, 1);
  const current = Math.min(Math.max(page, 0), pageCount - 1);
  const from = current * size + 1;
  const to = Math.min(totalElements, (current + 1) * size);
  const pages = pageWindow(current, pageCount);
  const options = sizeOptions.includes(size) ? sizeOptions : [...sizeOptions, size].sort((a, b) => a - b);

  return (
    <nav aria-label="Pagination" className={cn('flex flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-xs text-slate-500">
          Showing <span className="font-medium text-slate-700">{formatNumber(from)}</span>–
          <span className="font-medium text-slate-700">{formatNumber(to)}</span> of{' '}
          <span className="font-medium text-slate-700">{formatNumber(totalElements)}</span>
          {itemLabel ? ` ${itemLabel}` : ''}
        </p>
        {onSizeChange && (
          <div className="flex items-center gap-2">
            <label htmlFor={sizeId} className="text-xs text-slate-500">
              Rows per page
            </label>
            <select
              id={sizeId}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              value={size}
              onChange={(e) => onSizeChange(Number(e.target.value))}
            >
              {options.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" aria-label="Previous page" disabled={current <= 0} onClick={() => onPageChange(current - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pages.map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-current={p === current ? 'page' : undefined}
              aria-label={`Page ${p + 1}`}
              className={
                'h-7 min-w-7 rounded-md px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ' +
                (p === current ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')
              }
            >
              {p + 1}
            </button>
          ),
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Next page"
          disabled={current >= pageCount - 1}
          onClick={() => onPageChange(current + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
