import { useState } from 'react';
import { FileSearch, FolderOpen, Info, LayoutGrid, List, Share2, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
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
import { Select } from '@/components/ui/Input';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { TabPanel, Tabs, type TabItem } from '@/components/ui/Tabs';
import { formatNumber } from '@/lib/format';
import { DocumentFilters } from './DocumentFilters';
import { DocumentsTable, type RowActions } from './DocumentsTable';
import { DocumentsGrid } from './DocumentsGrid';
import { useDocuments, useDownload, usePurgeDocument, useRestoreDocument, useTrashDocument } from './hooks';
import { UploadDialog } from './UploadDialog';
import { PAGE_SIZE, useLibraryParams } from './useLibraryParams';

const SORT_OPTIONS = [
  { label: 'Recently updated', field: 'updatedAt', direction: 'desc' },
  { label: 'Oldest updated', field: 'updatedAt', direction: 'asc' },
  { label: 'Name A-Z', field: 'name', direction: 'asc' },
  { label: 'Name Z-A', field: 'name', direction: 'desc' },
  { label: 'Newest created', field: 'createdAt', direction: 'desc' },
  { label: 'Oldest created', field: 'createdAt', direction: 'asc' },
  { label: 'Largest first', field: 'sizeBytes', direction: 'desc' },
  { label: 'Smallest first', field: 'sizeBytes', direction: 'asc' },
] as const;

export function DocumentsLibrary() {
  const me = useMe();
  const isOwnerRole = me.role === 'OWNER';
  const { filters, apiParams, hasFilters, setFilter, clearFilters, setScope, setPage, toggleSort, setSort } = useLibraryParams();
  const scope: DocumentScope = !isOwnerRole && (filters.scope === 'owned' || filters.scope === 'trash') ? 'all' : filters.scope;
  const docs = useDocuments({ ...apiParams, scope });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
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
  const rowActions: RowActions = {
    onDownload: (d) => void download.run(d.id, () => documentsApi.download(d.id, d.name)),
    onTrash: setTrashTarget,
    onRestore: (d) => restore.mutate({ id: d.id, name: d.name }),
    onPurge: setPurgeTarget,
  };

  return (
    <>
      <PageHeader
        eyebrow="Organised. Protected. Yours."
        title={scope === 'trash' ? 'Trash & recovery' : scope === 'shared' ? 'Shared with me' : scope === 'owned' ? 'My documents' : 'Document library'}
        description="One place for your confidential work. Every file has its own boundaries."
        actions={
          isOwnerRole && (
            <Button variant="primary" leftIcon={<Upload className="h-4 w-4" />} onClick={() => setUploadOpen(true)}>
              Upload document
            </Button>
          )
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 px-5 py-4">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" strokeWidth={1.5} /><p className="text-xs leading-relaxed text-brand-800">{me.role === 'ADMIN' ? 'Your admin role manages the system, not document access. Only explicitly shared files appear here.' : isOwnerRole ? 'New files are private. Open a document to manage versions, named access and its activity trail.' : 'Only files explicitly shared with you appear here. Open a file for downloads, versions and any editing permissions.'}</p></div>
        {me.role === 'ADMIN' && <Link to="/admin" className="shrink-0 text-xs font-medium text-brand-700 underline">Go to admin overview</Link>}
      </div>

      <Tabs items={tabs} value={scope} onChange={setScope} label="Document scope" idPrefix="library" className="mb-4" />

      <TabPanel idPrefix="library" value={scope}>
        <Card className="overflow-hidden">
          <DocumentFilters filters={filters} hasFilters={hasFilters} onChange={setFilter} onClear={clearFilters} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <p className="text-xs text-slate-500">{docs.isPending ? 'Loading documents...' : docs.isError ? 'Documents unavailable' : <><span className="font-semibold text-ink">{formatNumber(page?.totalElements ?? 0)}</span> {hasFilters ? 'matching documents' : 'documents'}<span className="ml-2 hidden text-slate-400 sm:inline">/ {scope === 'all' ? 'All accessible' : scope === 'owned' ? 'Owned by you' : scope === 'trash' ? 'Recovery' : 'Shared with you'}</span></>}</p>
            <div className="flex items-center gap-3">
              <Select aria-label="Sort documents" className="h-9 border-0 bg-transparent text-xs shadow-none" value={`${filters.sortField},${filters.sortDir}`} onChange={(e) => {
                const option = SORT_OPTIONS.find((o) => `${o.field},${o.direction}` === e.target.value);
                if (option) setSort(option.field, option.direction);
              }}>{SORT_OPTIONS.map((o) => <option key={o.label} value={`${o.field},${o.direction}`}>{o.label}</option>)}</Select>
              <div className="flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label="Document view">
                <Button size="icon-sm" variant={view === 'grid' ? 'primary' : 'ghost'} aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid className="h-3.5 w-3.5" /></Button>
                <Button size="icon-sm" variant={view === 'list' ? 'primary' : 'ghost'} aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><List className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
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
              {view === 'grid' ? <DocumentsGrid documents={content} scope={scope} downloadingId={download.pendingKey} actions={rowActions} /> : <DocumentsTable
                documents={content}
                scope={scope}
                sortField={filters.sortField}
                sortDir={filters.sortDir}
                onSort={toggleSort}
                downloadingId={download.pendingKey}
                actions={rowActions}
              />}
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
