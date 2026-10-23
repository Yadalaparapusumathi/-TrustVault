import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-slate-200/70 bg-white shadow-card', className)} {...rest} />;
}

export function CardHeader({
  title,
  description,
  icon,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-5 py-5', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">{icon}</div>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h2>
          {description && <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...rest} />;
}
