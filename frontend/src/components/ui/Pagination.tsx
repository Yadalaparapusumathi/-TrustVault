import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { pageWindow } from '@/lib/pagination';
import { Button } from './Button';

export interface PaginationProps {
  /** 0-based page */
  page: number;
  size: number;
  totalPages: number;
  totalElements: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, size, totalPages, totalElements, onPageChange, className }: PaginationProps) {
  if (totalElements === 0) return null;
  const from = page * size + 1;
  const to = Math.min(totalElements, (page + 1) * size);
  const pages = pageWindow(page, totalPages);
  return (
    <nav aria-label="Pagination" className={'flex flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row ' + (className ?? '')}>
      <p className="text-xs text-slate-500">
        Showing <span className="font-medium text-slate-700">{formatNumber(from)}</span>–
        <span className="font-medium text-slate-700">{formatNumber(to)}</span> of{' '}
        <span className="font-medium text-slate-700">{formatNumber(totalElements)}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" aria-label="Previous page" disabled={page <= 0} onClick={() => onPageChange(page - 1)}>
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
              aria-current={p === page ? 'page' : undefined}
              aria-label={`Page ${p + 1}`}
              className={
                'h-7 min-w-7 rounded-md px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ' +
                (p === page ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')
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
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
