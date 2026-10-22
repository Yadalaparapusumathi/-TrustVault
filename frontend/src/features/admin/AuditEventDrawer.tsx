import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AuditEvent } from '@/api/types';
import { ActionIcon, DetailsJson } from '@/components/domain/audit';
import { OutcomeBadge, RoleBadge } from '@/components/domain/badges';
import { CopyButton } from '@/components/ui/CopyButton';
import { Drawer } from '@/components/ui/Drawer';
import { formatDateTime, humanizeEnum } from '@/lib/format';

function Row({ label, children, copy }: { label: string; children: ReactNode; copy?: string | null }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="col-span-2 flex min-w-0 items-start gap-1 text-sm text-slate-800">
        <span className="min-w-0 flex-1 break-all">{children}</span>
        {copy && <CopyButton value={copy} label={`Copy ${label}`} />}
      </dd>
    </div>
  );
}

export function AuditEventDrawer({ event, onClose }: { event: AuditEvent | null; onClose: () => void }) {
  return (
    <Drawer open={event !== null} onClose={onClose} title={event ? `Event #${event.seq}` : ''} description={event ? humanizeEnum(event.action) : undefined}>
      {event && (
        <div className="space-y-6 p-5">
          <div className="flex items-center gap-3">
            <ActionIcon action={event.action} outcome={event.outcome} />
            <div>
              <p className="font-mono text-sm font-medium text-slate-900">{event.action}</p>
              <div className="mt-1">
                <OutcomeBadge value={event.outcome} />
              </div>
            </div>
          </div>
          <dl className="divide-y divide-slate-100">
            <Row label="Time">
              <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time>
              <span className="block font-mono text-xs text-slate-500">{event.occurredAt}</span>
            </Row>
            <Row label="Actor" copy={event.actor?.id}>
              {event.actor ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="font-medium">{event.actor.username}</span>
                  <RoleBadge value={event.actor.role} />
                </span>
              ) : (
                <span className="italic text-slate-400">system</span>
              )}
            </Row>
            <Row label="Target" copy={event.targetId}>
              {event.targetType || event.targetId ? (
                <>
                  <span className="block text-xs text-slate-500">{event.targetType ?? '—'}</span>
                  <span className="font-mono text-xs">{event.targetId ?? '—'}</span>
                </>
              ) : (
                '—'
              )}
            </Row>
            <Row label="Document" copy={event.documentId}>
              {event.documentId ? (
                <Link
                  to={`/admin/audit?documentId=${encodeURIComponent(event.documentId)}`}
                  onClick={onClose}
                  className="font-mono text-xs text-brand-600 hover:underline"
                  title="Show all events for this document"
                >
                  {event.documentId}
                </Link>
              ) : (
                '—'
              )}
            </Row>
            <Row label="IP address">{event.ip ? <span className="font-mono text-xs">{event.ip}</span> : '—'}</Row>
            <Row label="Request ID" copy={event.requestId}>
              {event.requestId ? <span className="font-mono text-xs">{event.requestId}</span> : '—'}
            </Row>
            <Row label="User agent">{event.userAgent ? <span className="text-xs text-slate-600">{event.userAgent}</span> : '—'}</Row>
          </dl>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Details</h3>
            <DetailsJson details={event.details} />
          </div>
        </div>
      )}
    </Drawer>
  );
}
