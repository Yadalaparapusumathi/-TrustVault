import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, HelpCircle, Menu, ShieldCheck } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '@/components/domain/Logo';
import { useMe } from '@/auth/AuthContext';
import { RoleBadge } from '@/components/domain/badges';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Sidebar, SidebarContent } from './Sidebar';
import { WorkspaceGuide } from './WorkspaceGuide';

export function AppLayout({ children }: { children?: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const me = useMe();
  const location = useLocation();
  const section = location.pathname.startsWith('/documents/') ? 'Document details'
    : location.pathname === '/documents' ? 'Document library'
      : location.pathname === '/admin/users' ? 'People & roles'
        : location.pathname === '/admin/audit' ? 'Audit trail'
          : location.pathname === '/change-password' ? 'Account security' : 'Overview';

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-pop"
      >
        Skip to content
      </a>
      <Sidebar />
      <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between gap-3 border-b border-slate-200/70 bg-canvas/95 px-4 backdrop-blur-md sm:px-7 lg:ml-[268px] lg:px-9">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <Link to={me.role === 'ADMIN' ? '/admin' : '/workspace'} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden">
            <Logo />
          </Link>
          <div className="hidden items-center gap-3 text-xs sm:flex">
            <span className="text-slate-400">{me.role === 'ADMIN' ? 'Administration' : 'My workspace'}</span>
            <ChevronRight className="h-3 w-3 text-slate-300" />
            <span className="font-medium text-slate-700">{section}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="mr-2 hidden items-center gap-1.5 text-xs text-brand-700 xl:flex"><ShieldCheck className="h-3.5 w-3.5" /> Per-document access</span>
          <Button variant="ghost" size="icon" aria-label="Open workspace guide" title="Workspace guide" onClick={() => setGuideOpen(true)}><HelpCircle className="h-[18px] w-[18px]" /></Button>
          <div className="hidden border-l border-slate-200 pl-4 sm:block"><RoleBadge value={me.role} /></div>
          <Avatar name={me.displayName} seed={me.id} size="sm" />
        </div>
      </header>
      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} side="left" width="max-w-[18rem]" title="Navigation">
        <SidebarContent onNavigate={() => setMobileOpen(false)} />
      </Drawer>
      <WorkspaceGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
      <main id="main" tabIndex={-1} className="min-w-0 focus:outline-none lg:pl-[268px]">
        <div className="mx-auto w-full max-w-[1600px] animate-fade-in px-4 py-7 sm:px-7 lg:px-9 lg:py-8">
          {children ?? <Outlet />}
        </div>
        <footer className="mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 py-5 text-[11px] text-slate-400 sm:mx-7 lg:mx-9">
          <span>TrustVault / Confidential document workspace</span><span>Private by default. Accountable by design.</span>
        </footer>
      </main>
    </div>
  );
}
