import { useState } from 'react';
import { Activity, FileQuestion, FileText, History, Users } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { documentsApi } from '@/api/documents';
import { ApiError } from '@/api/errors';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { TabPanel, Tabs, type TabItem } from '@/components/ui/Tabs';
import { AccessTab } from './AccessTab';
import { ActivityTab } from './ActivityTab';
import { DocumentHeader } from './DocumentHeader';
import { useDocument, useDownload, useTrashDocument } from './hooks';
import { OverviewTab } from './OverviewTab';
import { UploadVersionDialog } from './UploadVersionDialog';
import { VersionsTab } from './VersionsTab';

type DetailTab = 'overview' | 'versions' | 'access' | 'activity';
const ALL_TABS: DetailTab[] = ['overview', 'versions', 'access', 'activity'];

export function DocumentDetailView({ id }: { id: string }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const doc = useDocument(id);
  const download = useDownload();
  const trash = useTrashDocument();
  const [versionOpen, setVersionOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);

  if (doc.isPending) return <DetailSkeleton />;
  if (doc.isError) {
    if (doc.error instanceof ApiError && doc.error.status === 404) return <DocumentNotFound />;
    return <ErrorState error={doc.error} onRetry={() => void doc.refetch()} title="Could not load document" />;
  }

  const d = doc.data;
  const isOwner = d.myPermission === 'OWNER';
  const tabs: TabItem<DetailTab>[] = [
    { value: 'overview', label: 'Overview', icon: <FileText className="h-4 w-4" /> },
    { value: 'versions', label: 'Versions', icon: <History className="h-4 w-4" />, count: d.currentVersion },
    ...(isOwner
      ? [
          { value: 'access' as const, label: 'Access', icon: <Users className="h-4 w-4" /> },
          { value: 'activity' as const, label: 'Activity', icon: <Activity className="h-4 w-4" /> },
        ]
      : []),
  ];
  const requested = params.get('tab') as DetailTab | null;
  const tab: DetailTab = requested && ALL_TABS.includes(requested) && tabs.some((t) => t.value === requested) ? requested : 'overview';
  const setTab = (t: DetailTab) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (t === 'overview') next.delete('tab');
        else next.set('tab', t);
        return next;
      },
      { replace: true },
    );

  return (
    <>
      <DocumentHeader
        doc={d}
        downloading={download.pendingKey === 'current'}
        onDownload={() => void download.run('current', () => documentsApi.download(d.id, d.originalFilename))}
        onUploadVersion={() => setVersionOpen(true)}
        onTrash={() => setTrashOpen(true)}
      />
      <Tabs items={tabs} value={tab} onChange={setTab} label="Document sections" idPrefix="doc" className="mb-6" />
      <TabPanel idPrefix="doc" value={tab}>
        {tab === 'overview' && <OverviewTab doc={d} onReload={() => doc.refetch()} />}
        {tab === 'versions' && <VersionsTab doc={d} />}
        {tab === 'access' && isOwner && <AccessTab doc={d} />}
        {tab === 'activity' && isOwner && <ActivityTab doc={d} />}
      </TabPanel>

      <UploadVersionDialog doc={d} open={versionOpen} onClose={() => setVersionOpen(false)} />
      <ConfirmDialog
        open={trashOpen}
        tone="danger"
        title="Move to trash?"
        description={
          <>
            <span className="font-medium text-slate-700">{d.name}</span> will be moved to the trash. Everyone you shared it with loses
            access immediately. It is purged automatically after 30 days.
          </>
        }
        confirmLabel="Move to trash"
        loading={trash.isPending}
        onClose={() => setTrashOpen(false)}
        onConfirm={() =>
          trash.mutate(
            { id: d.id, name: d.name },
            {
              onSuccess: () => navigate('/documents', { replace: true }),
              onSettled: () => setTrashOpen(false),
            },
          )
        }
      />
    </>
  );
}

function DocumentNotFound() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <EmptyState
        icon={<FileQuestion className="h-5 w-5" />}
        title="Document not found or you don't have access"
        description="The link may be wrong, the document may have been deleted, or access may have been revoked. If you think you should have access, ask the document owner to share it with you."
        action={
          <Link
            to="/documents"
            className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white shadow-sm hover:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Back to documents
          </Link>
        }
      />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading document">
      <Skeleton className="mb-6 h-4 w-24" />
      <div className="mb-8 flex items-start gap-4">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <Skeleton className="mb-6 h-9 w-80" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
