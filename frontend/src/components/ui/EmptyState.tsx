import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  tone = 'neutral',
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div
        className={cn(
          'mb-5 flex h-16 w-16 items-center justify-center rounded-2xl ring-8 ring-inset',
          tone === 'danger' ? 'bg-rose-100 text-rose-600 ring-rose-50' : 'bg-brand-100 text-brand-700 ring-brand-50',
        )}
      >
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
