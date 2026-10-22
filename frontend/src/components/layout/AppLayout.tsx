import { useEffect, useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '@/components/domain/Logo';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Sidebar, SidebarContent } from './Sidebar';

export function AppLayout({ children }: { children?: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-pop"
      >
        Skip to content
      </a>
      <Sidebar />
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur lg:hidden">
        <Link to="/documents" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <Logo />
        </Link>
        <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
      </header>
      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} side="left" width="max-w-[18rem]" title="Navigation">
        <SidebarContent onNavigate={() => setMobileOpen(false)} />
      </Drawer>
      <main id="main" tabIndex={-1} className="focus:outline-none lg:pl-64">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children ?? <Outlet />}
        </div>
      </main>
    </div>
  );
}
