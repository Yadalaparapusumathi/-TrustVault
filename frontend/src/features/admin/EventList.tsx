import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AuditEvent } from '@/api/types';
import { ActionIcon } from '@/components/domain/audit';
import { actorLabel, targetLabel } from '@/lib/audit';
import { OutcomeBadge } from '@/components/domain/badges';
import { EmptyState } from '@/components/ui/EmptyState';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { humanizeEnum } from '@/lib/format';

export function EventList({ events, emptyIcon, emptyTitle }: { events: AuditEvent[]; emptyIcon: ReactNode; emptyTitle: string }) {
  if (events.length === 0) return <EmptyState className="py-10" icon={emptyIcon} title={emptyTitle} />;
  return (
    <ul className="divide-y divide-slate-100">
      {events.map((e) => (
        <li key={e.seq} className="flex items-start gap-3 px-5 py-3">
          <ActionIcon action={e.action} outcome={e.outcome} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-900">{humanizeEnum(e.action)}</span>
              {e.outcome !== 'SUCCESS' && <OutcomeBadge value={e.outcome} />}
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              <span className="font-medium text-slate-700">{actorLabel(e)}</span> · {targetLabel(e)}
            </p>
          </div>
          <RelativeTime value={e.occurredAt} className="shrink-0 text-xs text-slate-400" />
        </li>
      ))}
    </ul>
  );
}

export function ViewAllLink({ to }: { to: string }) {
  return (
    <Link to={to} className="rounded text-xs font-medium text-brand-600 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      View all
    </Link>
  );
}
