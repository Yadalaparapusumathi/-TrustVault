import { useState } from 'react';
import { FileSearch, FolderOpen, Info, Share2, Trash2, Upload } from 'lucide-react';
import type { DocumentScope, DocumentSummary } from '@/api/types';
import { documentsApi } from '@/api/documents';
import { useMe } from '@/auth/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { TabPanel, Tabs, type TabItem } from '@/components/ui/Tabs';
import { formatNumber } from '@/lib/format';
import { DocumentFilters } from './DocumentFilters';
import { DocumentsTable } from './DocumentsTable';
import { useDocuments, useDownload, usePurgeDocument, useRestoreDocument, useTrashDocument } from './hooks';
import { UploadDialog } from './UploadDialog';
import { PAGE_SIZE, useLibraryParams } from './useLibraryParams';

export function DocumentsLibrary() {
  const me = useMe();
  const isOwnerRole = me.role === 'OWNER';
  const { filters, apiParams, hasFilters, setFilter, clearFilters, setScope, setPage, toggleSort } = useLibraryParams();
  const scope: DocumentScope = !isOwnerRole && (filters.scope === 'owned' || filters.scope === 'trash') ? 'all' : filters.scope;
  const docs = useDocuments({ ...apiParams, scope });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [trashTarget, setTrashTarget] = useState<DocumentSummary | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<DocumentSummary | null>(null);
  const trash = useTrashDocument();
  const restore = useRestoreDocument();
  const purge = usePurgeDocument();
  const download = useDownload();

  const tabs: TabItem<DocumentScope>[] = [
    { value: 'all', label: 'All accessible', icon: <FolderOpen className="h-4 w-4" /> },
    ...(isOwnerRole ? [{ value: 'owned' as const, label: 'My documents', icon: <FileSearch className="h-4 w-4" /> }] : []),
    { value: 'shared', label: 'Shared with me', icon: <Share2 className="h-4 w-4" /> },
    ...(isOwnerRole ? [{ value: 'trash' as const, label: 'Trash', icon: <Trash2 className="h-4 w-4" /> }] : []),
  ];

  const page = docs.data;
  const content = page?.content ?? [];

  return (
    <>
      <PageHeader
        title="Documents"
        description="Confidential files you own or that were explicitly shared with you."
        actions={
          isOwnerRole && (
            <Button variant="primary" leftIcon={<Upload className="h-4 w-4" />} onClick={() => setUploadOpen(true)}>
              Upload document
            </Button>
          )
        }
      />

      {me.role === 'VIEWER' && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-sky-200/70 bg-sky-50/70 px-4 py-3 text-sm text-sky-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>You can see documents that have been shared with you.</p>
        </div>
      )}

      <Tabs items={tabs} value={scope} onChange={setScope} label="Document scope" idPrefix="library" className="mb-4" />

      <TabPanel idPrefix="library" value={scope}>
        <Card className="overflow-hidden">
          <DocumentFilters filters={filters} hasFilters={hasFilters} onChange={setFilter} onClear={clearFilters} />
          {scope === 'trash' && (
            <div className="flex items-center gap-2 border-b border-slate-100 bg-amber-50/50 px-4 py-2.5 text-xs text-amber-800">
              <Info className="h-3.5 w-3.5" aria-hidden />
              Documents in the trash are visible only to you and are purged automatically after 30 days. Grantees lost access when they were trashed.
            </div>
          )}
          {docs.isPending ? (
            <SkeletonRows rows={8} cols={7} />
          ) : docs.isError ? (
            <ErrorState error={docs.error} onRetry={() => void docs.refetch()} title="Could not load documents" />
          ) : content.length === 0 ? (
            <LibraryEmpty scope={scope} hasFilters={hasFilters} onClear={clearFilters} canUpload={isOwnerRole} onUpload={() => setUploadOpen(true)} />
          ) : (
            <div className={docs.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              <DocumentsTable
                documents={content}
                scope={scope}
                sortField={filters.sortField}
                sortDir={filters.sortDir}
                onSort={toggleSort}
                downloadingId={download.pendingKey}
                actions={{
                  onDownload: (d) => void download.run(d.id, () => documentsApi.download(d.id, d.name)),
                  onTrash: setTrashTarget,
                  onRestore: (d) => restore.mutate({ id: d.id, name: d.name }),
                  onPurge: setPurgeTarget,
                }}
              />
              {page && (
                <div className="border-t border-slate-100">
                  <Pagination
                    page={page.page}
                    size={page.size || PAGE_SIZE}
                    totalPages={page.totalPages}
                    totalElements={page.totalElements}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </div>
          )}
        </Card>
        {page && page.totalElements > 0 && (
          <p className="sr-only" aria-live="polite">
            {formatNumber(page.totalElements)} documents
          </p>
        )}
      </TabPanel>

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />

      <ConfirmDialog
        open={trashTarget !== null}
        tone="danger"
        title="Move to trash?"
        description={
          <>
            <span className="font-medium text-slate-700">{trashTarget?.name}</span> will be moved to the trash. Everyone you shared it
            with loses access immediately. It is purged automatically after 30 days.
          </>
        }
        confirmLabel="Move to trash"
        loading={trash.isPending}
        onClose={() => setTrashTarget(null)}
        onConfirm={() => {
          if (trashTarget) trash.mutate({ id: trashTarget.id, name: trashTarget.name }, { onSettled: () => setTrashTarget(null) });
        }}
      />

      <ConfirmDialog
        open={purgeTarget !== null}
        tone="danger"
        title="Delete permanently?"
        description="This destroys every version and all grants. It cannot be undone. The audit trail keeps a record of the deletion."
        requireText={purgeTarget?.name ?? ''}
        confirmLabel="Delete permanently"
        loading={purge.isPending}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => {
          if (purgeTarget) purge.mutate({ id: purgeTarget.id, name: purgeTarget.name }, { onSettled: () => setPurgeTarget(null) });
        }}
      />
    </>
  );
}

function LibraryEmpty({
  scope,
  hasFilters,
  onClear,
  canUpload,
  onUpload,
}: {
  scope: DocumentScope;
  hasFilters: boolean;
  onClear: () => void;
  canUpload: boolean;
  onUpload: () => void;
}) {
  if (hasFilters) {
    return (
      <EmptyState
        icon={<FileSearch className="h-5 w-5" />}
        title="No documents match your filters"
        description="Try a different search term or clear the filters."
        action={
          <Button variant="secondary" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        }
      />
    );
  }
  if (scope === 'trash') {
    return <EmptyState icon={<Trash2 className="h-5 w-5" />} title="Trash is empty" description="Documents you move to the trash appear here for 30 days." />;
  }
  if (scope === 'shared') {
    return (
      <EmptyState
        icon={<Share2 className="h-5 w-5" />}
        title="Nothing shared with you yet"
        description="When someone grants you access to a document, it shows up here."
      />
    );
  }
  return (
    <EmptyState
      icon={<FolderOpen className="h-5 w-5" />}
      title={scope === 'owned' ? 'You have not uploaded any documents' : 'No documents yet'}
      description={canUpload ? 'Upload your first confidential document. Only you can see it until you share it.' : 'Documents shared with you will appear here.'}
      action={
        canUpload && (
          <Button variant="primary" size="sm" leftIcon={<Upload className="h-4 w-4" />} onClick={onUpload}>
            Upload document
          </Button>
        )
      }
    />
  );
}
