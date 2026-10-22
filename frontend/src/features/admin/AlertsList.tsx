import { BellRing, ShieldCheck } from 'lucide-react';
import type { DashboardAlert } from '@/api/types';
import { SeverityBadge } from '@/components/domain/badges';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { cn } from '@/lib/cn';
import { humanizeEnum } from '@/lib/format';

const accent = { HIGH: 'border-l-red-500', MEDIUM: 'border-l-amber-400', LOW: 'border-l-sky-400' } as const;
const order = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

export function AlertsList({ alerts }: { alerts: DashboardAlert[] }) {
  const sorted = [...alerts].sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
  return (
    <Card className="flex flex-col">
      <CardHeader title="Alerts" description="Unusual patterns detected in the audit trail." icon={<BellRing className="h-4 w-4" />} />
      {sorted.length === 0 ? (
        <EmptyState className="py-10" icon={<ShieldCheck className="h-5 w-5" />} title="No alerts" description="Nothing unusual right now." />
      ) : (
        <ul className="max-h-[22rem] space-y-2 overflow-y-auto p-3">
          {sorted.map((a, i) => (
            <li key={`${a.type}-${a.since}-${i}`} className={cn('rounded-lg border border-l-4 border-slate-200 bg-white px-3.5 py-3', accent[a.severity])}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SeverityBadge value={a.severity} />
                  <span className="text-xs font-medium text-slate-500">{humanizeEnum(a.type)}</span>
                </div>
                <span className="text-xs text-slate-400">
                  since <RelativeTime value={a.since} />
                </span>
              </div>
              <p className="mt-1.5 text-sm text-slate-800">{a.message}</p>
              <p className="mt-1 text-xs text-slate-500">
                {a.actor ? (
                  <>
                    {a.actor.displayName} <span className="text-slate-400">@{a.actor.username}</span> ·{' '}
                  </>
                ) : null}
                {a.count.toLocaleString()} occurrence{a.count === 1 ? '' : 's'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
