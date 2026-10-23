import { ArrowUpRight, FileText, FolderLock, KeyRound, LayoutDashboard, ScrollText, Share2, ShieldCheck, Trash2, Users } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useMe } from '@/auth/AuthContext';
import { Logo } from '@/components/domain/Logo';
import { cn } from '@/lib/cn';
import { UserMenu } from './UserMenu';

interface NavItem {
  to: string;
  label: string;
  icon: typeof FileText;
}

const adminNav: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/audit', label: 'Audit trail', icon: ScrollText },
  { to: '/admin/users', label: 'People & roles', icon: Users },
];

function NavSection({ title, items, onNavigate }: { title?: string; items: NavItem[]; onNavigate?: () => void }) {
  const location = useLocation();
  const currentScope = new URLSearchParams(location.search).get('scope') || 'all';
  return (
    <div>
      {title && <p className="eyebrow mb-3 px-3.5 text-white/40">{title}</p>}
      <ul className="space-y-1">
        {items.map((item) => {
          const [path, query] = item.to.split('?');
          const scope = new URLSearchParams(query).get('scope') || 'all';
          const isActive = path === '/documents'
            ? (location.pathname === path && currentScope === scope) || (location.pathname.startsWith('/documents/') && scope === 'all')
            : location.pathname === path;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
                className={cn('nav-link group', isActive ? 'bg-lime text-brand-950 shadow-soft' : 'text-white/65 hover:bg-white/[0.07] hover:text-white')}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} aria-hidden />
                <span className="flex-1">{item.label}</span>
                {isActive && <span className="h-1.5 w-1.5 rounded-full bg-brand-900" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const me = useMe();
  const mainNav: NavItem[] = [
    ...(me.role !== 'ADMIN' ? [{ to: '/workspace', label: 'Overview', icon: LayoutDashboard }] : []),
    { to: '/documents', label: 'All documents', icon: FileText },
    ...(me.role === 'OWNER' ? [{ to: '/documents?scope=owned', label: 'My documents', icon: FolderLock }] : []),
    { to: '/documents?scope=shared', label: 'Shared with me', icon: Share2 },
    ...(me.role === 'OWNER' ? [{ to: '/documents?scope=trash', label: 'Trash & recovery', icon: Trash2 }] : []),
  ];
  return (
    <div className="flex min-h-full flex-col bg-ink lg:h-full">
      <div className="flex h-24 shrink-0 items-center px-7">
        <Link to={me.role === 'ADMIN' ? '/admin' : '/workspace'} onClick={onNavigate} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime">
          <Logo inverted />
        </Link>
      </div>
      <div className="mx-5 mb-7 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-lime"><FolderLock className="h-4 w-4" /></div>
        <div><p className="text-sm font-medium text-white">Private workspace</p><p className="mt-0.5 text-[11px] text-white/45">Your access. Your boundaries.</p></div>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-7 overflow-y-auto px-4 pb-6">
        {me.role === 'ADMIN' && <NavSection title="Administration" items={adminNav} onNavigate={onNavigate} />}
        <NavSection title="Workspace" items={mainNav} onNavigate={onNavigate} />
        <NavSection title="Account" items={[{ to: '/change-password', label: 'Password & security', icon: KeyRound }]} onNavigate={onNavigate} />
      </nav>
      <div className="mx-5 mb-5 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-transparent p-4">
        <ShieldCheck className="mb-3 h-5 w-5 text-lime" strokeWidth={1.5} />
        <p className="text-xs font-medium text-white">Private by design</p>
        <p className="mt-1.5 text-xs leading-relaxed text-white/50">Named access. Every request checked. Every decision recorded.</p>
        <Link to="/documents?scope=shared" onClick={onNavigate} className="mt-3 inline-flex items-center gap-1 text-xs text-lime hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime">
          Your shared documents <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="border-t border-white/10 p-4">
        <UserMenu />
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[268px] bg-ink lg:block">
      <SidebarContent />
    </aside>
  );
}
