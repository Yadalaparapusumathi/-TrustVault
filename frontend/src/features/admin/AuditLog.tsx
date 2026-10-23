import { useMemo, useState } from 'react';
import { ArrowUpRight, FileDown, Fingerprint, ScrollText, Search, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminApi } from '@/api/admin';
import { AUDIT_OUTCOMES, type AuditEvent, type AuditOutcome, type AuditSearchParams } from '@/api/types';
import { actorLabel, targetLabel } from '@/lib/audit';
import { OutcomeBadge } from '@/components/domain/badges';
import { ActionIcon } from '@/components/domain/audit';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DebouncedInput } from '@/components/ui/DebouncedInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input, Select } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { formatDateTime, humanizeEnum } from '@/lib/format';
import { notifyError } from '@/lib/notify';
import { AuditEventDrawer } from './AuditEventDrawer';
import { useAuditActions, useAuditEvents } from './hooks';

const SIZE = 50;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
type FilterKey = 'actor' | 'action' | 'outcome' | 'documentId' | 'from' | 'to';
const FILTER_KEYS: FilterKey[] = ['actor', 'action', 'outcome', 'documentId', 'from', 'to'];

export function AuditLog() {
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [exporting, setExporting] = useState(false);
  const actions = useAuditActions();

  const filters = useMemo(() => {
    const outcome = params.get('outcome') ?? '';
    const from = params.get('from') ?? '';
    const to = params.get('to') ?? '';
    const page = Number.parseInt(params.get('page') ?? '0', 10);
    return {
      actor: params.get('actor') ?? '',
      action: params.get('action') ?? '',
      outcome: ((AUDIT_OUTCOMES as readonly string[]).includes(outcome) ? outcome : '') as AuditOutcome | '',
      documentId: params.get('documentId') ?? '',
      from: DATE_RE.test(from) ? from : '',
      to: DATE_RE.test(to) ? to : '',
      page: Number.isFinite(page) && page >= 0 ? page : 0,
    };
  }, [params]);

  const query: Omit<AuditSearchParams, 'page' | 'size'> = {
    actor: filters.actor.trim() || undefined,
    action: filters.action || undefined,
    outcome: filters.outcome || undefined,
    documentId: filters.documentId.trim() || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  };
  const events = useAuditEvents({ ...query, page: filters.page, size: SIZE });
  const hasFilters = FILTER_KEYS.some((k) => filters[k] !== '');

  const update = (changes: Partial<Record<FilterKey | 'page', string | number>>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === '' || v === undefined || (k === 'page' && v === 0)) next.delete(k);
          else next.set(k, String(v));
        }
        if (!('page' in changes)) next.delete('page');
        return next;
      },
      { replace: true },
    );

  const exportCsv = async () => {
    setExporting(true);
    try {
      await adminApi.exportAudit(query);
    } catch (e) {
      notifyError(e, 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const content = events.data?.content ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Administration / Evidence"
        title="Nothing happens unnoticed."
        description="The audit trail: a tamper-evident record of actions, access and refused attempts."
        actions={
          <Button variant="secondary" leftIcon={<FileDown className="h-4 w-4" />} onClick={() => void exportCsv()} loading={exporting}>
            Export CSV
          </Button>
        }
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-100 bg-brand-50/70 p-5">
        <div className="flex items-start gap-3"><Fingerprint className="h-6 w-6 shrink-0 text-brand-600" strokeWidth={1.5} /><div><p className="text-sm font-medium text-brand-900">Evidence, not just an event list.</p><p className="mt-1 text-xs leading-relaxed text-brand-800/75">Events are append-only and HMAC-chained. Open a row for the actor, request and recorded details.</p></div></div>
        <Link to="/admin" className="inline-flex items-center gap-1.5 rounded text-xs font-medium text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500">Verify integrity in overview <ArrowUpRight className="h-3.5 w-3.5" /></Link>
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div><h2 className="text-sm font-semibold text-ink">Audit events</h2><p className="mt-1 text-xs text-slate-400">Newest first. Filters apply to CSV exports too.</p></div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick audit filters">
            <Button size="sm" variant={!filters.action && !filters.outcome ? 'primary' : 'secondary'} onClick={() => update({ action: '', outcome: '' })}>All activity</Button>
            <Button size="sm" variant={filters.outcome === 'DENIED' ? 'primary' : 'secondary'} onClick={() => update({ action: '', outcome: 'DENIED' })}>Denied attempts</Button>
            <Button size="sm" variant={filters.action === 'GRANT_REVOKED' ? 'primary' : 'secondary'} onClick={() => update({ action: 'GRANT_REVOKED', outcome: '' })}>Revocations</Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 lg:grid-cols-12" role="search" aria-label="Filter audit events">
          <div className="lg:col-span-2">
            <DebouncedInput
              aria-label="Actor username"
              placeholder="Actor username…"
              leftIcon={<Search className="h-4 w-4" />}
              value={filters.actor}
              onCommit={(v) => update({ actor: v })}
            />
          </div>
          <div className="lg:col-span-3">
            <Select aria-label="Action" value={filters.action} onChange={(e) => update({ action: e.target.value })}>
              <option value="">All actions</option>
              {(actions.data ?? []).map((a) => (
                <option key={a} value={a}>
                  {humanizeEnum(a)}
                </option>
              ))}
            </Select>
          </div>
          <div className="lg:col-span-2">
            <Select aria-label="Outcome" value={filters.outcome} onChange={(e) => update({ outcome: e.target.value })}>
              <option value="">All outcomes</option>
              {AUDIT_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {humanizeEnum(o)}
                </option>
              ))}
            </Select>
          </div>
          <div className="lg:col-span-5">
            <DebouncedInput
              aria-label="Document ID"
              placeholder="Document ID…"
              value={filters.documentId}
              onCommit={(v) => update({ documentId: v })}
              spellCheck={false}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-6 [&>div]:flex-1">
            <Input type="date" aria-label="From date" title="From" value={filters.from} max={filters.to || undefined} onChange={(e) => update({ from: e.target.value })} />
            <span className="text-xs text-slate-400">to</span>
            <Input type="date" aria-label="To date" title="To" value={filters.to} min={filters.from || undefined} onChange={(e) => update({ to: e.target.value })} />
            {hasFilters && (
              <Button
                variant="ghost"
                onClick={() => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])))}
                leftIcon={<X className="h-4 w-4" />}
                title="Clear all filters"
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {events.isPending ? (
          <SkeletonRows rows={10} cols={6} />
        ) : events.isError ? (
          <ErrorState error={events.error} onRetry={() => void events.refetch()} title="Could not load audit events" />
        ) : content.length === 0 ? (
          <EmptyState icon={<ScrollText className="h-5 w-5" />} title="No events" description={hasFilters ? 'No audit events match these filters.' : 'The audit log is empty.'} />
        ) : (
          <div className={events.isPlaceholderData ? 'opacity-60' : undefined}>
            <Table>
              <THead>
                <tr>
                  <TH className="w-20">Seq</TH>
                  <TH>Time</TH>
                  <TH>Actor</TH>
                  <TH>Action</TH>
                  <TH>Outcome</TH>
                  <TH className="hidden lg:table-cell">Target</TH>
                  <TH className="hidden md:table-cell">IP</TH>
                </tr>
              </THead>
              <TBody>
                {content.map((e) => (
                  <TR
                    key={e.seq}
                    interactive
                    tabIndex={0}
                    aria-label={`Event ${e.seq}: ${humanizeEnum(e.action)}`}
                    onClick={() => setSelected(e)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        setSelected(e);
                      }
                    }}
                    className="focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                  >
                    <TD className="font-mono text-xs tabular-nums text-slate-500">{e.seq}</TD>
                    <TD className="whitespace-nowrap text-xs text-slate-600">
                      <time dateTime={e.occurredAt}>{formatDateTime(e.occurredAt)}</time>
                    </TD>
                    <TD className="whitespace-nowrap">
                      <span className={e.actor ? 'font-medium text-slate-800' : 'italic text-slate-400'}>{actorLabel(e)}</span>
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-slate-700"><span className="flex items-center gap-2"><ActionIcon action={e.action} outcome={e.outcome} /><span>{humanizeEnum(e.action)}</span></span></TD>
                    <TD>
                      <OutcomeBadge value={e.outcome} />
                    </TD>
                    <TD className="hidden max-w-[16rem] truncate text-xs text-slate-500 lg:table-cell" title={targetLabel(e)}>
                      {targetLabel(e)}
                    </TD>
                    <TD className="hidden whitespace-nowrap font-mono text-xs text-slate-500 md:table-cell">{e.ip ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {events.data && (
              <div className="border-t border-slate-100">
                <Pagination
                  page={events.data.page}
                  size={events.data.size || SIZE}
                  totalPages={events.data.totalPages}
                  totalElements={events.data.totalElements}
                  onPageChange={(p) => update({ page: p })}
                />
              </div>
            )}
          </div>
        )}
      </Card>
      <AuditEventDrawer event={selected} onClose={() => setSelected(null)} />
    </>
  );
}
