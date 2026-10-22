import { Download, History } from 'lucide-react';
import { documentsApi } from '@/api/documents';
import type { DocumentDetail } from '@/api/types';
import { UserCell } from '@/components/domain/UserCell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { formatBytes, shortHash } from '@/lib/format';
import { useDownload, useVersions } from './hooks';

export function VersionsTab({ doc }: { doc: DocumentDetail }) {
  const versions = useVersions(doc.id);
  const download = useDownload();

  return (
    <Card className="overflow-hidden">
      {versions.isPending ? (
        <SkeletonRows rows={3} cols={5} />
      ) : versions.isError ? (
        <ErrorState error={versions.error} onRetry={() => void versions.refetch()} />
      ) : versions.data.length === 0 ? (
        <EmptyState icon={<History className="h-5 w-5" />} title="No versions" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Version</TH>
              <TH>Uploaded by</TH>
              <TH>Date</TH>
              <TH className="hidden sm:table-cell">Size</TH>
              <TH className="hidden md:table-cell">SHA-256</TH>
              <th scope="col" className="w-16">
                <span className="sr-only">Download</span>
              </th>
            </tr>
          </THead>
          <TBody>
            {versions.data.map((v) => {
              const key = `v${v.versionNo}`;
              return (
                <TR key={v.versionNo}>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="font-medium tabular-nums text-slate-900">v{v.versionNo}</span>
                      {v.versionNo === doc.currentVersion && <Badge tone="brand">Current</Badge>}
                    </div>
                    <span className="block max-w-[14rem] truncate text-xs text-slate-500" title={v.originalFilename}>
                      {v.originalFilename}
                    </span>
                  </TD>
                  <TD>
                    <UserCell user={v.uploadedBy} size="xs" subtitle={null} />
                  </TD>
                  <TD className="whitespace-nowrap text-slate-500">
                    <RelativeTime value={v.createdAt} />
                  </TD>
                  <TD className="hidden whitespace-nowrap tabular-nums text-slate-500 sm:table-cell">{formatBytes(v.sizeBytes)}</TD>
                  <TD className="hidden md:table-cell">
                    <code className="font-mono text-xs text-slate-500" title={v.sha256}>
                      {shortHash(v.sha256)}
                    </code>
                  </TD>
                  <TD className="text-right">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Download version ${v.versionNo}`}
                      title={`Download v${v.versionNo}`}
                      loading={download.pendingKey === key}
                      onClick={() => void download.run(key, () => documentsApi.downloadVersion(doc.id, v.versionNo, v.originalFilename))}
                    >
                      {download.pendingKey !== key && <Download className="h-4 w-4" />}
                    </Button>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
