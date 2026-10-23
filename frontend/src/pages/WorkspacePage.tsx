import { useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, FileText, FolderLock, History, Share2, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import type { DocumentScope } from '@/api/types';
import { useMe } from '@/auth/AuthContext';
import { ClassificationBadge, PermissionBadge } from '@/components/domain/badges';
import { FileIcon } from '@/components/domain/FileIcon';
import { VaultIllustration } from '@/components/domain/VaultIllustration';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDocuments } from '@/features/documents/hooks';
import { UploadDialog } from '@/features/documents/UploadDialog';
import { formatBytes, formatNumber } from '@/lib/format';

export default function WorkspacePage() {
  const me = useMe();
  if (me.role === 'ADMIN') return <Navigate to="/admin" replace />;
  return <PersonalWorkspace />;
}

function PersonalWorkspace() {
  const me = useMe();
  const owner = me.role === 'OWNER';
  const recent = useDocuments({ scope: 'all', size: 6, page: 0, sort: 'updatedAt,desc' });
  const [uploadOpen, setUploadOpen] = useState(false);
  const name = me.displayName.split(' ')[0] || me.username;

  return (
    <>
      <PageHeader eyebrow="Your workspace, at a glance" title={`Welcome back, ${name}.`} description="A little clarity for your confidential work." actions={<span className="text-xs text-slate-500">{new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date())}</span>} />
      <section className="workspace-hero mb-6 flex items-center justify-between gap-4 px-6 py-8 sm:px-8">
        <div className="relative z-10 max-w-xl">
          <p className="eyebrow mb-3 text-lime">{owner ? 'A secure home for important work' : 'Shared with you. And only you.'}</p>
          <h2 className="max-w-md whitespace-pre-line text-2xl font-medium leading-snug tracking-[-0.04em] sm:text-[30px]">{owner ? 'Keep it confidential.\nKeep it in your control.' : 'The documents you need.\nThe access you were given.'}</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/60">{owner ? 'Upload, organise and share with named people. You decide who gets access, and you can take it back.' : 'Find your shared files, follow version history and download securely. Your permissions are checked on every request.'}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {owner ? <Button variant="accent" onClick={() => setUploadOpen(true)} leftIcon={<Upload className="h-4 w-4" />}>Upload document</Button> : <Link className="route-link border border-lime bg-lime text-brand-950 hover:bg-lime/90" to="/documents?scope=shared">Open shared documents <ArrowRight className="h-4 w-4" /></Link>}
            <Link to="/documents" className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime">Explore the library <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </div>
        <VaultIllustration className="hidden max-w-[280px] shrink-0 lg:block xl:max-w-[340px]" />
      </section>

      <div className={`mb-7 grid gap-4 sm:grid-cols-2 ${owner ? 'xl:grid-cols-4' : ''}`}>
        <DocumentMetric scope="all" title="Accessible documents" description="Only files you can reach" icon={FileText} />
        {owner && <DocumentMetric scope="owned" title="Owned by you" description="Your files, your decisions" icon={FolderLock} />}
        <DocumentMetric scope="shared" title="Shared with you" description="Explicitly granted access" icon={Share2} />
        {owner && <DocumentMetric scope="trash" title="In recovery" description="Restore from your trash" icon={Trash2} />}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader title="Recently updated" description="The latest changes to documents you can access." actions={<Link to="/documents" className="flex items-center gap-1 rounded text-xs font-medium text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500">View all <ArrowUpRight className="h-3.5 w-3.5" /></Link>} />
          {recent.isPending ? <div className="space-y-4 p-5">{[1, 2, 3].map((n) => <Skeleton key={n} className="h-14 w-full" />)}</div>
            : recent.isError ? <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />
              : recent.data.content.length === 0 ? <EmptyState icon={<FolderLock className="h-6 w-6" />} title="Your workspace starts here" description={owner ? 'Upload your first document. It stays private until you decide to share it.' : 'Documents appear here when an owner grants you access.'} action={owner && <Button variant="primary" onClick={() => setUploadOpen(true)}>Upload document</Button>} />
                : <ul className="divide-y divide-slate-100">
                  {recent.data.content.map((doc) => (
                    <li key={doc.id}>
                      <Link to={`/documents/${encodeURIComponent(doc.id)}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500">
                        <FileIcon contentType={doc.contentType} />
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink group-hover:text-brand-700">{doc.name}</p><p className="mt-1 text-xs text-slate-400">{doc.category} <span className="mx-1.5">&middot;</span> {formatBytes(doc.sizeBytes)} <span className="mx-1.5">&middot;</span> <RelativeTime value={doc.updatedAt} /></p></div>
                        <div className="hidden sm:block"><ClassificationBadge value={doc.classification} /></div>
                        <div className="hidden md:block"><PermissionBadge value={doc.myPermission} /></div>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-brand-600" />
                      </Link>
                    </li>
                  ))}
                </ul>}
        </Card>
        <div className="space-y-5">
          <Card className="p-5">
            <p className="eyebrow mb-4 text-slate-400">A simpler way to work</p>
            <div className="space-y-5">
              {(owner ? [
                { icon: Share2, title: 'Share intentionally', text: 'Open a file, then Access. Give a named person Read or Edit.', to: '/documents?scope=owned' },
                { icon: History, title: 'Follow the history', text: 'Versions and Activity live inside each document you own.', to: '/documents?scope=owned' },
                { icon: Trash2, title: 'Room to recover', text: 'Restore trashed files before their 30-day purge.', to: '/documents?scope=trash' },
              ] : [
                { icon: ArrowDownToLine, title: 'Download securely', text: 'Open a shared file to download its current or previous versions.', to: '/documents?scope=shared' },
                { icon: History, title: 'Edit when invited', text: 'An Edit grant also lets you update details and upload a new version.', to: '/documents?scope=shared' },
              ]).map((item) => <Link key={item.title} to={item.to} className="group flex gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><item.icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand-600" /><div><p className="text-sm font-medium text-ink group-hover:text-brand-700">{item.title}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{item.text}</p></div></Link>)}
            </div>
          </Card>
          <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-5">
            <ShieldCheck className="mb-3 h-6 w-6 text-brand-600" strokeWidth={1.5} />
            <h3 className="text-sm font-semibold text-brand-900">Access is never assumed.</h3>
            <p className="mt-2 text-xs leading-relaxed text-brand-800/75">No public links. No inherited permissions. Removing access stops the next request, and refusals are recorded too.</p>
          </div>
        </div>
      </div>
      {owner && <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />}
    </>
  );
}

function DocumentMetric({ scope, title, description, icon: Icon }: { scope: DocumentScope; title: string; description: string; icon: typeof FileText }) {
  const result = useDocuments({ scope, size: 1, page: 0 });
  return (
    <Card className="relative p-5">
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-slate-500">{title}</p><Icon className="h-[18px] w-[18px] text-brand-600" strokeWidth={1.5} /></div>
      {result.isPending ? <Skeleton className="my-3 h-9 w-16" /> : result.isError
        ? <button type="button" onClick={() => void result.refetch()} className="my-3 block text-sm text-rose-700 underline">Count unavailable. Retry</button>
        : <p className="my-2 font-display text-3xl font-semibold tracking-tight text-ink">{formatNumber(result.data.totalElements)}</p>}
      <Link to={`/documents${scope === 'all' ? '' : `?scope=${scope}`}`} className="flex items-center justify-between gap-2 rounded text-xs text-slate-400 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{description}<ArrowUpRight className="h-3.5 w-3.5" /></Link>
    </Card>
  );
}
