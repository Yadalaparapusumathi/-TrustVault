import { FileText, LayoutDashboard, ScrollText, Users } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useMe } from '@/auth/AuthContext';
import { Logo } from '@/components/domain/Logo';
import { cn } from '@/lib/cn';
import { UserMenu } from './UserMenu';

interface NavItem {
  to: string;
  label: string;
  icon: typeof FileText;
  end?: boolean;
}

const mainNav: NavItem[] = [{ to: '/documents', label: 'Documents', icon: FileText }];
const adminNav: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
  { to: '/admin/users', label: 'Users', icon: Users },
];

function NavSection({ title, items, onNavigate }: { title?: string; items: NavItem[]; onNavigate?: () => void }) {
  return (
    <div>
      {title && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>}
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  isActive ? 'bg-white text-slate-900 shadow-soft ring-1 ring-slate-200' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cn('h-4 w-4', isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600')} aria-hidden />
                  {item.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const me = useMe();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <NavLink to="/documents" onClick={onNavigate} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <Logo />
        </NavLink>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <NavSection items={mainNav} onNavigate={onNavigate} />
        {me.role === 'ADMIN' && <NavSection title="Admin" items={adminNav} onNavigate={onNavigate} />}
      </nav>
      <div className="border-t border-slate-200/80 p-3">
        <UserMenu />
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200/80 bg-slate-50/80 backdrop-blur lg:block">
      <SidebarContent />
    </aside>
  );
}
