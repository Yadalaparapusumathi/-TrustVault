import { ChevronLeft, Download, FileUp, ShieldCheck, Trash2, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DocumentDetail } from '@/api/types';
import { ClassificationBadge, PermissionBadge } from '@/components/domain/badges';
import { FileIcon } from '@/components/domain/FileIcon';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { RelativeTime } from '@/components/ui/RelativeTime';

export function DocumentHeader({
  doc,
  downloading,
  onDownload,
  onUploadVersion,
  onTrash,
}: {
  doc: DocumentDetail;
  downloading: boolean;
  onDownload: () => void;
  onUploadVersion: () => void;
  onTrash: () => void;
}) {
  const canEdit = doc.myPermission === 'OWNER' || doc.myPermission === 'EDIT';
  const isOwner = doc.myPermission === 'OWNER';
  return (
    <div className="mb-6">
      <Link
        to="/documents"
        className="mb-4 inline-flex items-center gap-1 rounded text-sm text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden /> Documents
      </Link>
      <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-card sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <FileIcon contentType={doc.contentType} filename={doc.originalFilename} size="lg" />
            <div className="min-w-0">
              <p className="eyebrow mb-2 text-brand-600">{doc.category} / Document workspace</p>
              <h1 className="break-words text-2xl font-semibold tracking-[-0.04em] text-ink">{doc.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-500">
                <ClassificationBadge value={doc.classification} />
                <PermissionBadge value={doc.myPermission} />
                <span className="inline-flex items-center gap-1.5">
                  <Avatar name={doc.owner.displayName} seed={doc.owner.id} size="xs" />
                  <span>
                    Owned by <span className="font-medium text-slate-700">{doc.owner.displayName}</span>
                  </span>
                </span>
                <span aria-hidden className="text-slate-300">
                  ·
                </span>
                <span>
                  v{doc.currentVersion} · updated <RelativeTime value={doc.updatedAt} />
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 xl:max-w-[22rem] xl:justify-end">
            {isOwner && (
              <Button variant="outline-danger" leftIcon={<Trash2 className="h-4 w-4" />} onClick={onTrash}>
                Move to trash
              </Button>
            )}
            {canEdit && (
              <Button variant="secondary" leftIcon={<FileUp className="h-4 w-4" />} onClick={onUploadVersion}>
                Upload new version
              </Button>
            )}
            {isOwner && (
              <Link to="?tab=access" className="route-link">
                <Users className="h-4 w-4" /> Manage access
              </Link>
            )}
            <Button variant="primary" leftIcon={<Download className="h-4 w-4" />} onClick={onDownload} loading={downloading}>
              Download
            </Button>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand-600" />{isOwner ? 'You control who can access this document.' : canEdit ? 'You have access to read, download and edit this document.' : 'You have read and download access to this document.'}</span>
          <span className="text-slate-400">Access checked on every request</span>
        </div>
      </div>
    </div>
  );
}
