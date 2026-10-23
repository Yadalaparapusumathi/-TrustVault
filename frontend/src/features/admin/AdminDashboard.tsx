import { ArrowUpRight, Ban, BarChart3, Download, FileText, KeyRound, ScrollText, ShieldAlert, ShieldCheck, Trash2, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMe } from '@/auth/AuthContext';
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
  const me = useMe();

  return (
    <>
      <PageHeader
        eyebrow="Administration / Overview"
        title="The bigger picture."
        description={`Welcome back, ${me.displayName.split(' ')[0]}. Here is what is happening across TrustVault.`}
        actions={
          <>
            <Link to="/admin/users" className="route-link"><Users className="h-4 w-4" /> Manage users</Link>
            <Link to="/admin/audit" className="route-link">Explore audit trail <ArrowUpRight className="h-4 w-4" /></Link>
          </>
        }
      />
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
              <section className="workspace-hero flex flex-col justify-between gap-6 p-7 sm:flex-row sm:items-center">
                <div className="max-w-xl"><p className="eyebrow mb-3 text-lime">Oversight without overreach</p><h2 className="text-2xl font-medium tracking-tight">Know what happened.<br />Prove who was there.</h2><p className="mt-3 text-sm leading-relaxed text-white/60">Monitor activity, manage people and inspect the evidence. Your admin role never gives you implicit access to their documents.</p></div>
                <div className="flex shrink-0 items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.05] p-5">
                  <ShieldCheck className="h-9 w-9 text-lime" strokeWidth={1.3} /><div><p className="font-display text-2xl font-medium text-white">{formatNumber(totals.events24h)}</p><p className="mt-1 text-xs text-white/50">events recorded in 24 hours</p></div>
                </div>
              </section>
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
                    <CardHeader title="The activity pulse" description="Uploads, downloads, permission changes and denials over 14 days." icon={<BarChart3 className="h-4 w-4" />} />
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
