import { ChevronsUpDown, KeyRound, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useMe } from '@/auth/AuthContext';
import { RoleBadge } from '@/components/domain/badges';
import { Avatar } from '@/components/ui/Avatar';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { notifyError } from '@/lib/notify';

export function UserMenu() {
  const me = useMe();
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <DropdownMenu
      align="start"
      placement="top"
      className="w-56"
      header={
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{me.displayName}</p>
          <p className="truncate text-xs text-slate-500">{me.email ?? `@${me.username}`}</p>
        </div>
      }
      items={[
        { key: 'pw', label: 'Change password', icon: <KeyRound className="h-4 w-4" />, onSelect: () => navigate('/change-password') },
        {
          key: 'logout',
          label: 'Sign out',
          icon: <LogOut className="h-4 w-4" />,
          separated: true,
          onSelect: () => {
            logout().catch(notifyError);
          },
        },
      ]}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label="Account menu"
          className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
        >
          <Avatar name={me.displayName} seed={me.id} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">{me.displayName}</span>
            <span className="mt-0.5 block">
              <RoleBadge value={me.role} />
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        </button>
      )}
    />
  );
}
