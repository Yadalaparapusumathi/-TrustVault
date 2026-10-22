import { useState } from 'react';
import { ChevronDown, Globe, History } from 'lucide-react';
import type { AuditEvent, DocumentDetail } from '@/api/types';
import { ActionIcon, DetailsJson } from '@/components/domain/audit';
import { OutcomeBadge, RoleBadge } from '@/components/domain/badges';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { humanizeEnum } from '@/lib/format';
import { useActivity } from './hooks';

const SIZE = 20;

export function ActivityTab({ doc }: { doc: DocumentDetail }) {
  const [page, setPage] = useState(0);
  const activity = useActivity(doc.id, page, SIZE);

  return (
    <Card className="overflow-hidden">
      {activity.isPending ? (
        <SkeletonRows rows={6} cols={3} />
      ) : activity.isError ? (
        <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />
      ) : activity.data.content.length === 0 ? (
        <EmptyState icon={<History className="h-5 w-5" />} title="No activity yet" />
      ) : (
        <>
          <ol className={cn('px-5 py-4', activity.isPlaceholderData && 'opacity-60')} aria-label="Document activity">
            {activity.data.content.map((event, i) => (
              <TimelineItem key={event.seq} event={event} last={i === activity.data.content.length - 1} />
            ))}
          </ol>
          <div className="border-t border-slate-100">
            <Pagination
              page={activity.data.page}
              size={activity.data.size || SIZE}
              totalPages={activity.data.totalPages}
              totalElements={activity.data.totalElements}
              onPageChange={setPage}
            />
          </div>
        </>
      )}
    </Card>
  );
}

function TimelineItem({ event, last }: { event: AuditEvent; last: boolean }) {
  const [open, setOpen] = useState(false);
  const hasDetails = event.details && Object.keys(event.details).length > 0;
  const panelId = `activity-details-${event.seq}`;
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!last && <span aria-hidden className="absolute left-4 top-9 h-[calc(100%-2.25rem)] w-px bg-slate-200" />}
      <ActionIcon action={event.action} outcome={event.outcome} />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-slate-900">{humanizeEnum(event.action)}</span>
          <OutcomeBadge value={event.outcome} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>
            by <span className="font-medium text-slate-700">{event.actor ? event.actor.username : 'system'}</span>
          </span>
          {event.actor && <RoleBadge value={event.actor.role} />}
          <span aria-hidden>·</span>
          <RelativeTime value={event.occurredAt} />
          {event.ip && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1 font-mono">
                <Globe className="h-3 w-3" aria-hidden />
                {event.ip}
              </span>
            </>
          )}
        </div>
        {hasDetails && (
          <div className="mt-2">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded text-xs font-medium text-brand-600 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
              {open ? 'Hide details' : 'Show details'}
            </button>
            {open && (
              <div id={panelId} className="mt-2">
                <DetailsJson details={event.details} />
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
