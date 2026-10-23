import { ArchiveRestore, Download, FileCheck2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DocumentScope, DocumentSummary } from '@/api/types';
import { ClassificationBadge, PermissionBadge } from '@/components/domain/badges';
import { FileIcon } from '@/components/domain/FileIcon';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { formatBytes } from '@/lib/format';
import { DocumentActions, type RowActions } from './DocumentsTable';

export function DocumentsGrid({ documents, scope, actions, downloadingId }: { documents: DocumentSummary[]; scope: DocumentScope; actions: RowActions; downloadingId: string | null }) {
  const inTrash = scope === 'trash';
  return (
    <ul className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 sm:p-5" aria-label="Documents">
      {documents.map((doc) => (
        <li key={doc.id} className="min-w-0">
          <Card className="group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-pop">
            <div className="flex items-center justify-between px-4 pt-4">
              <ClassificationBadge value={doc.classification} />
              <DocumentActions doc={doc} inTrash={inTrash} actions={actions} downloading={downloadingId === doc.id} />
            </div>
            <div className="mx-4 mt-3 flex h-28 items-center justify-center rounded-xl border border-slate-100 bg-canvas">
              <div className="-rotate-6 rounded-2xl bg-white p-4 shadow-card transition-transform group-hover:rotate-0"><FileIcon contentType={doc.contentType} size="lg" /></div>
            </div>
            <div className="flex-1 px-4 pb-4 pt-4">
              <p className="eyebrow mb-1.5 truncate text-slate-400">{doc.category}</p>
              {inTrash ? <h3 className="line-clamp-2 text-sm font-medium leading-6 text-ink">{doc.name}</h3> : <Link to={`/documents/${encodeURIComponent(doc.id)}`} className="line-clamp-2 rounded font-display text-sm font-medium leading-6 text-ink hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{doc.name}</Link>}
              <p className="mt-2 flex items-center gap-2 text-[11px] text-slate-400"><FileCheck2 className="h-3 w-3" />{formatBytes(doc.sizeBytes)} <span>&middot;</span> Version {doc.currentVersion}</p>
              <div className="mt-4 flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500"><Avatar name={doc.owner.displayName} seed={doc.owner.id} size="xs" /><span className="truncate">{doc.owner.displayName}</span></span><PermissionBadge value={doc.myPermission} /></div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
              <span className="text-[11px] text-slate-400">{inTrash ? <>Purges <RelativeTime value={doc.purgeAfter} /></> : <>Updated <RelativeTime value={doc.updatedAt} /></>}</span>
              <Button size="icon-sm" variant="ghost" aria-label={`${inTrash ? 'Restore' : 'Download'} ${doc.name}`} loading={!inTrash && downloadingId === doc.id} onClick={() => inTrash ? actions.onRestore(doc) : actions.onDownload(doc)}>
                {inTrash ? <ArchiveRestore className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              </Button>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
