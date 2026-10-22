import type { UserSummary } from '@/api/types';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/cn';

export function UserCell({ user, subtitle, size = 'sm', className }: { user: Pick<UserSummary, 'id' | 'displayName' | 'username'>; subtitle?: React.ReactNode; size?: 'xs' | 'sm' | 'md'; className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <Avatar name={user.displayName || user.username} seed={user.id} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-slate-800">{user.displayName || user.username}</span>
        {subtitle !== undefined ? (
          subtitle && <span className="block truncate text-xs text-slate-500">{subtitle}</span>
        ) : (
          <span className="block truncate text-xs text-slate-500">@{user.username}</span>
        )}
      </span>
    </span>
  );
}
