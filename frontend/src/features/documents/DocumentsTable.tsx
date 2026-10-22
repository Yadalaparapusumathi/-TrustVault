import { ArchiveRestore, Download, ExternalLink, MoreHorizontal, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { DocumentScope, DocumentSortField, DocumentSummary, SortDirection } from '@/api/types';
import { ClassificationBadge, PermissionBadge } from '@/components/domain/badges';
import { FileIcon } from '@/components/domain/FileIcon';
import { UserCell } from '@/components/domain/UserCell';
import { Button } from '@/components/ui/Button';
import { DropdownMenu, type MenuItem } from '@/components/ui/DropdownMenu';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { Spinner } from '@/components/ui/Spinner';
import { SortableTH, Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { formatBytes } from '@/lib/format';

export interface RowActions {
  onDownload: (doc: DocumentSummary) => void;
  onTrash: (doc: DocumentSummary) => void;
  onRestore: (doc: DocumentSummary) => void;
  onPurge: (doc: DocumentSummary) => void;
}

export function DocumentsTable({
  documents,
  scope,
  sortField,
  sortDir,
  onSort,
  actions,
  downloadingId,
}: {
  documents: DocumentSummary[];
  scope: DocumentScope;
  sortField: DocumentSortField;
  sortDir: SortDirection;
  onSort: (field: DocumentSortField) => void;
  actions: RowActions;
  downloadingId: string | null;
}) {
  const navigate = useNavigate();
  const inTrash = scope === 'trash';
  const sortProps = (field: DocumentSortField) => ({ active: sortField === field, direction: sortDir, onSort: () => onSort(field) });

  return (
    <Table>
      <THead>
        <tr>
          <SortableTH label="Name" {...sortProps('name')} className="min-w-[16rem]" />
          <TH>Classification</TH>
          <TH className="hidden md:table-cell">Owner</TH>
          <TH className="hidden lg:table-cell">Access</TH>
          <TH className="hidden xl:table-cell">Version</TH>
          <SortableTH label="Size" {...sortProps('sizeBytes')} className="hidden sm:table-cell" />
          {inTrash ? (
            <TH>Deleted</TH>
          ) : (
            <SortableTH label="Updated" {...sortProps('updatedAt')} />
          )}
          <th scope="col" className="w-12">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </THead>
      <TBody>
        {documents.map((doc) => {
          const href = `/documents/${encodeURIComponent(doc.id)}`;
          const items: MenuItem[] = inTrash
            ? [
                { key: 'restore', label: 'Restore', icon: <ArchiveRestore className="h-4 w-4" />, onSelect: () => actions.onRestore(doc) },
                { key: 'purge', label: 'Delete permanently', icon: <Trash2 className="h-4 w-4" />, danger: true, separated: true, onSelect: () => actions.onPurge(doc) },
              ]
            : [
                { key: 'download', label: 'Download', icon: <Download className="h-4 w-4" />, onSelect: () => actions.onDownload(doc) },
                { key: 'open', label: 'Open', icon: <ExternalLink className="h-4 w-4" />, onSelect: () => navigate(href) },
                ...(doc.myPermission === 'OWNER'
                  ? [{ key: 'trash', label: 'Move to trash', icon: <Trash2 className="h-4 w-4" />, danger: true, separated: true, onSelect: () => actions.onTrash(doc) }]
                  : []),
              ];
          return (
            <TR
              key={doc.id}
              interactive={!inTrash}
              onClick={inTrash ? undefined : () => navigate(href)}
            >
              <TD>
                <div className="flex min-w-0 items-center gap-3">
                  <FileIcon contentType={doc.contentType} />
                  <div className="min-w-0">
                    {inTrash ? (
                      <span className="block truncate font-medium text-slate-900">{doc.name}</span>
                    ) : (
                      <Link
                        to={href}
                        onClick={(e) => e.stopPropagation()}
                        className="block max-w-[22rem] truncate rounded font-medium text-slate-900 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        {doc.name}
                      </Link>
                    )}
                    <span className="block truncate text-xs text-slate-500">{doc.category}</span>
                  </div>
                </div>
              </TD>
              <TD>
                <ClassificationBadge value={doc.classification} />
              </TD>
              <TD className="hidden md:table-cell">
                <UserCell user={doc.owner} size="xs" subtitle={null} />
              </TD>
              <TD className="hidden lg:table-cell">
                <PermissionBadge value={doc.myPermission} />
              </TD>
              <TD className="hidden tabular-nums text-slate-500 xl:table-cell">v{doc.currentVersion}</TD>
              <TD className="hidden whitespace-nowrap tabular-nums text-slate-500 sm:table-cell">{formatBytes(doc.sizeBytes)}</TD>
              <TD className="whitespace-nowrap text-slate-500">
                {inTrash ? (
                  <div className="flex flex-col">
                    <RelativeTime value={doc.deletedAt} />
                    {doc.purgeAfter && (
                      <span className="text-xs text-rose-600">
                        Purges <RelativeTime value={doc.purgeAfter} />
                      </span>
                    )}
                  </div>
                ) : (
                  <RelativeTime value={doc.updatedAt} />
                )}
              </TD>
              <TD className="w-12 pr-3 text-right">
                {downloadingId === doc.id ? (
                  <span className="inline-flex h-8 w-8 items-center justify-center">
                    <Spinner size="sm" label="Downloading" />
                  </span>
                ) : (
                  <DropdownMenu
                    items={items}
                    trigger={(props) => (
                      <Button {...props} variant="ghost" size="icon-sm" aria-label={`Actions for ${doc.name}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    )}
                  />
                )}
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
