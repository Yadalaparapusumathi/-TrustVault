import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-y border-slate-100 bg-canvas/80">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

export function TH({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th scope="col" className={cn('whitespace-nowrap px-5 py-3.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500', className)} {...rest}>
      {children}
    </th>
  );
}

export type SortDir = 'asc' | 'desc';

export function SortableTH({
  label,
  active,
  direction,
  onSort,
  className,
}: {
  label: string;
  active: boolean;
  direction: SortDir;
  onSort: () => void;
  className?: string;
}) {
  const Icon = !active ? ChevronsUpDown : direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('whitespace-nowrap px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500', className)}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          '-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 uppercase tracking-wide hover:bg-slate-100 hover:text-slate-800',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
          active && 'text-slate-900',
        )}
      >
        {label}
        <Icon className={cn('h-3.5 w-3.5', !active && 'opacity-50')} aria-hidden />
      </button>
    </th>
  );
}

export function TR({ className, interactive, ...rest }: HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      className={cn('group transition-colors', interactive && 'cursor-pointer hover:bg-brand-50/40 focus-within:bg-brand-50/40', className)}
      {...rest}
    />
  );
}

export function TD({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-5 py-4 align-middle text-slate-700', className)} {...rest} />;
}
