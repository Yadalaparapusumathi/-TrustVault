import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  icon: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'brand' | 'danger' | 'success';
}) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-600',
    brand: 'bg-brand-50 text-brand-600',
    danger: 'bg-rose-50 text-rose-600',
    success: 'bg-emerald-50 text-emerald-600',
  } as const;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', tones[tone])}>{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-slate-900">{formatNumber(value)}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}
