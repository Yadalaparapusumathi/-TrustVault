import { RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { IntegrityReport } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { cn } from '@/lib/cn';
import { formatNumber, shortHash } from '@/lib/format';
import { notifyError } from '@/lib/notify';
import { useVerifyIntegrity } from './hooks';

export function IntegrityCard({ report }: { report: IntegrityReport }) {
  const verify = useVerifyIntegrity();
  const ok = report.valid;
  return (
    <Card className={cn('overflow-hidden', ok ? 'ring-1 ring-emerald-100' : 'ring-1 ring-rose-200')}>
      <div className={cn('flex items-start gap-4 p-5', ok ? 'bg-gradient-to-br from-emerald-50/80 to-white' : 'bg-gradient-to-br from-rose-50 to-white')}>
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset',
            ok ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-rose-100 text-rose-700 ring-rose-200',
          )}
        >
          {ok ? <ShieldCheck className="h-6 w-6" aria-hidden /> : <ShieldAlert className="h-6 w-6" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Audit integrity</p>
          <p role="status" className={cn('mt-0.5 text-base font-semibold', ok ? 'text-emerald-800' : 'text-rose-700')}>
            {ok
              ? `Chain verified – ${formatNumber(report.checkedEvents)} events`
              : `Tampering detected at seq ${report.firstBrokenSeq ?? '?'}`}
          </p>
          {report.message && <p className="mt-1 text-sm text-slate-600">{report.message}</p>}
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
            <div>
              <dt className="inline">Verified </dt>
              <dd className="inline">
                <RelativeTime value={report.verifiedAt} />
              </dd>
            </div>
            {report.headSeq !== null && (
              <div>
                <dt className="inline">Head seq </dt>
                <dd className="inline font-mono">{report.headSeq}</dd>
              </div>
            )}
            {report.headHash && (
              <div>
                <dt className="inline">Head hash </dt>
                <dd className="inline font-mono" title={report.headHash}>
                  {shortHash(report.headHash, 16)}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
      <div className="flex justify-end border-t border-slate-100 px-5 py-3">
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          loading={verify.isPending}
          onClick={() => verify.mutate(undefined, { onError: (e) => notifyError(e) })}
        >
          Re-verify now
        </Button>
      </div>
    </Card>
  );
}
