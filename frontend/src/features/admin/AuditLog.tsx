import { useMemo, useState } from 'react';
import { FileDown, ScrollText, Search, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '@/api/admin';
import { AUDIT_OUTCOMES, type AuditEvent, type AuditOutcome, type AuditSearchParams } from '@/api/types';
import { actorLabel, targetLabel } from '@/lib/audit';
import { OutcomeBadge } from '@/components/domain/badges';
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
        eyebrow="Administration"
        title="Audit log"
        description="Tamper-evident record of every security-relevant event, newest first."
        actions={
          <Button variant="secondary" leftIcon={<FileDown className="h-4 w-4" />} onClick={() => void exportCsv()} loading={exporting}>
            Export CSV
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 gap-2.5 border-b border-slate-100 p-3 sm:grid-cols-2 lg:grid-cols-12" role="search" aria-label="Filter audit events">
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
                    <TD className="whitespace-nowrap font-mono text-xs text-slate-700">{e.action}</TD>
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
