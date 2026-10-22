import { Ban, BarChart3, Download, FileText, KeyRound, ScrollText, ShieldAlert, Trash2, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatNumber } from '@/lib/format';
import { ActivityChart } from './ActivityChart';
import { AlertsList } from './AlertsList';
import { EventList, ViewAllLink } from './EventList';
import { useDashboard } from './hooks';
import { IntegrityCard } from './IntegrityCard';
import { StatCard } from './StatCard';

export function AdminDashboard() {
  const dashboard = useDashboard();

  return (
    <>
      <PageHeader eyebrow="Administration" title="Dashboard" description="Security posture and activity across TrustVault." />
      {dashboard.isPending ? (
        <DashboardSkeleton />
      ) : dashboard.isError ? (
        <Card>
          <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} title="Could not load dashboard" />
        </Card>
      ) : (
        (() => {
          const { totals, integrity, alerts, activityByDay, recentDenied, recentPermissionChanges } = dashboard.data;
          return (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Users"
                  value={totals.users}
                  icon={<Users className="h-4 w-4" />}
                  tone="brand"
                  hint={`${formatNumber(totals.activeUsers)} active`}
                />
                <StatCard
                  label="Documents"
                  value={totals.documents}
                  icon={<FileText className="h-4 w-4" />}
                  hint={
                    <span className="inline-flex items-center gap-1">
                      <Trash2 className="h-3 w-3" aria-hidden /> {formatNumber(totals.trashedDocuments)} in trash
                    </span>
                  }
                />
                <StatCard label="Active grants" value={totals.activeGrants} icon={<KeyRound className="h-4 w-4" />} tone="success" />
                <StatCard
                  label="Events (24h)"
                  value={totals.events24h}
                  icon={<ScrollText className="h-4 w-4" />}
                  hint={
                    <span className="inline-flex flex-wrap items-center gap-x-3">
                      <span className="inline-flex items-center gap-1">
                        <Download className="h-3 w-3" aria-hidden /> {formatNumber(totals.downloads24h)} downloads
                      </span>
                      <span className={totals.denied24h > 0 ? 'inline-flex items-center gap-1 font-medium text-rose-600' : 'inline-flex items-center gap-1'}>
                        <Ban className="h-3 w-3" aria-hidden /> {formatNumber(totals.denied24h)} denied
                      </span>
                    </span>
                  }
                  tone={totals.denied24h > 0 ? 'danger' : 'neutral'}
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-3">
                <div className="space-y-6 xl:col-span-2">
                  <IntegrityCard report={integrity} />
                  <Card>
                    <CardHeader title="Activity" description="Last 14 days" icon={<BarChart3 className="h-4 w-4" />} />
                    <CardBody>
                      <ActivityChart data={activityByDay} />
                    </CardBody>
                  </Card>
                </div>
                <AlertsList alerts={alerts} />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader
                    title="Recent permission changes"
                    icon={<KeyRound className="h-4 w-4" />}
                    actions={<ViewAllLink to="/admin/audit" />}
                  />
                  <EventList events={recentPermissionChanges} emptyIcon={<KeyRound className="h-5 w-5" />} emptyTitle="No recent permission changes" />
                </Card>
                <Card>
                  <CardHeader
                    title="Recent denied attempts"
                    icon={<ShieldAlert className="h-4 w-4" />}
                    actions={<ViewAllLink to="/admin/audit?outcome=DENIED" />}
                  />
                  <EventList events={recentDenied} emptyIcon={<ShieldAlert className="h-5 w-5" />} emptyTitle="No denied attempts" />
                </Card>
              </div>
            </div>
          );
        })()
      )}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-96 rounded-xl xl:col-span-2" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}
