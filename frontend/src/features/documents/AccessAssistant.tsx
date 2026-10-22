import { Check, Sparkles, X } from 'lucide-react';
import type { DocumentDetail, Suggestion } from '@/api/types';
import { PermissionBadge, RoleBadge } from '@/components/domain/badges';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { notifyError } from '@/lib/notify';
import { useCreateGrant, useDismissSuggestion, useSuggestions } from './hooks';

export function AccessAssistant({ doc, excludeIds }: { doc: DocumentDetail; excludeIds: string[] }) {
  const suggestions = useSuggestions(doc.id);
  const grant = useCreateGrant(doc.id);
  const dismiss = useDismissSuggestion(doc.id);
  const pending = (suggestions.data ?? []).filter((s) => s.status === 'PENDING' && !excludeIds.includes(s.user.id));

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Access assistant"
        icon={<Sparkles className="h-4 w-4 text-violet-600" />}
        description="Suggests people who may need this document, based on how similar documents are shared."
        actions={
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Sparkles className="h-3.5 w-3.5" />}
            loading={suggestions.isFetching}
            onClick={suggestions.request}
          >
            {suggestions.requested ? 'Refresh' : 'Suggest people'}
          </Button>
        }
      />
      <div className="border-b border-violet-100 bg-violet-50/50 px-5 py-2.5 text-xs leading-relaxed text-violet-900">
        Suggestions never change access. You decide, and both the suggestion and your decision are recorded in the audit trail.
      </div>
      <CardBody>
        {!suggestions.requested ? (
          <p className="py-2 text-sm text-slate-500">Click “Suggest people” to get recommendations.</p>
        ) : suggestions.isFetching && !suggestions.data ? (
          <div className="space-y-3" role="status" aria-label="Loading suggestions">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : suggestions.isError ? (
          <ErrorState error={suggestions.error} onRetry={suggestions.request} />
        ) : pending.length === 0 ? (
          <EmptyState className="py-8" icon={<Sparkles className="h-5 w-5" />} title="No suggestions right now" description="There is nobody new we would recommend for this document." />
        ) : (
          <ul className="space-y-3">
            {pending.map((s) => (
              <SuggestionItem
                key={s.id}
                suggestion={s}
                granting={grant.isPending && grant.variables?.suggestionId === s.id}
                dismissing={dismiss.isPending && dismiss.variables?.id === s.id}
                onGrant={() =>
                  grant.mutate({ userId: s.user.id, permission: s.permission, suggestionId: s.id }, { onError: (e) => notifyError(e) })
                }
                onDismiss={() => dismiss.mutate(s)}
              />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function SuggestionItem({
  suggestion: s,
  granting,
  dismissing,
  onGrant,
  onDismiss,
}: {
  suggestion: Suggestion;
  granting: boolean;
  dismissing: boolean;
  onGrant: () => void;
  onDismiss: () => void;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, s.score)) * 100);
  return (
    <li className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={s.user.displayName} seed={s.user.id} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium text-slate-900">{s.user.displayName}</span>
              <RoleBadge value={s.user.role} />
            </div>
            <p className="text-xs text-slate-500">@{s.user.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-11 sm:pl-0">
          <span className="text-xs text-slate-500">Suggested</span>
          <PermissionBadge value={s.permission} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="w-16 shrink-0 text-xs text-slate-500">Confidence</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Suggestion score">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-brand-600" style={{ width: `${pct}%` }} />
        </div>
        <span className="w-10 text-right text-xs font-medium tabular-nums text-slate-700">{pct}%</span>
      </div>
      {s.reasons.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600 marker:text-slate-300">
          {s.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="ghost" leftIcon={<X className="h-3.5 w-3.5" />} loading={dismissing} disabled={granting} onClick={onDismiss}>
          Dismiss
        </Button>
        <Button size="sm" variant="primary" leftIcon={<Check className="h-3.5 w-3.5" />} loading={granting} disabled={dismissing} onClick={onGrant}>
          Grant {s.permission === 'EDIT' ? 'edit' : 'read'} access
        </Button>
      </div>
    </li>
  );
}
