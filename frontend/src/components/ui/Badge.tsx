import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'brand' | 'violet' | 'emerald' | 'sky' | 'amber' | 'rose' | 'green' | 'red' | 'orange';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-500/15',
  brand: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  green: 'bg-green-50 text-green-700 ring-green-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/20',
};

const dots: Record<BadgeTone, string> = {
  neutral: 'bg-slate-400',
  brand: 'bg-brand-500',
  violet: 'bg-violet-500',
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  green: 'bg-green-500',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
};

export interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
  title?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', dot, icon, className, title, children }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', dots[tone])} />}
      {icon}
      {children}
    </span>
  );
}
