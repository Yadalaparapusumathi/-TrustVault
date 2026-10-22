import { useMemo, useState } from 'react';
import { ArrowRightLeft, KeyRound, LogOut, MoreHorizontal, Pencil, Search, UserCheck, UserPlus, Users, UserX } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminUser } from '@/api/types';
import { useMe } from '@/auth/AuthContext';
import { RoleBadge } from '@/components/domain/badges';
import { UserCell } from '@/components/domain/UserCell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DropdownMenu, type MenuItem } from '@/components/ui/DropdownMenu';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { useNow } from '@/lib/useNow';
import { notifyError } from '@/lib/notify';
import { useAdminUsers, useRevokeSessions, useUpdateUser } from './hooks';
import { CreateUserDialog, EditUserDialog, ResetPasswordDialog, TransferDocumentsDialog } from './UserDialogs';

type Action =
  | { kind: 'edit' | 'deactivate' | 'reactivate' | 'reset' | 'revoke' | 'transfer'; user: AdminUser }
  | { kind: 'create' }
  | null;

function UserStatus({ user, now }: { user: AdminUser; now: number }) {
  if (!user.active) return <Badge tone="neutral" dot>Inactive</Badge>;
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > now) {
    return (
      <Badge tone="amber" dot title={`Locked until ${new Date(user.lockedUntil).toLocaleString()}`}>
        Locked
      </Badge>
    );
  }
  return (
    <Badge tone="emerald" dot>
      Active
    </Badge>
  );
}

export function UsersAdmin() {
  const me = useMe();
  const now = useNow();
  const users = useAdminUsers();
  const update = useUpdateUser();
  const revoke = useRevokeSessions();
  const [action, setAction] = useState<Action>(null);
  const [filter, setFilter] = useState('');
  const close = () => setAction(null);

  const list = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const all = users.data ?? [];
    const filtered = term
      ? all.filter((u) => [u.username, u.displayName, u.email ?? '', u.role].some((v) => v.toLowerCase().includes(term)))
      : all;
    return [...filtered].sort((a, b) => Number(b.active) - Number(a.active) || a.displayName.localeCompare(b.displayName));
  }, [users.data, filter]);

  const userFor = (kind: NonNullable<Action>['kind']): AdminUser | null => (action && action.kind === kind && 'user' in action ? action.user : null);

  const setActive = (user: AdminUser, active: boolean) =>
    update.mutate(
      { id: user.id, body: { active } },
      {
        onSuccess: (u) => toast.success(active ? `@${u.username} reactivated` : `@${u.username} deactivated — all sessions terminated`),
        onError: (e) => notifyError(e),
        onSettled: close,
      },
    );

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Accounts, roles and sessions. Changes take effect on the user's very next request."
        actions={
          <Button variant="primary" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setAction({ kind: 'create' })}>
            New user
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-3">
          <div className="max-w-sm">
            <Input
              type="search"
              aria-label="Filter users"
              placeholder="Filter by name, username, email or role…"
              leftIcon={<Search className="h-4 w-4" />}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>
        {users.isPending ? (
          <SkeletonRows rows={6} cols={7} />
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={() => void users.refetch()} title="Could not load users" />
        ) : list.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title={filter ? 'No users match your filter' : 'No users yet'} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH className="hidden lg:table-cell">Email</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH className="hidden md:table-cell">Last login</TH>
                <TH className="hidden sm:table-cell text-right">Owned docs</TH>
                <TH className="hidden sm:table-cell text-right">Sessions</TH>
                <th scope="col" className="w-12">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </THead>
            <TBody>
              {list.map((u) => {
                const isSelf = u.id === me.id;
                const items: MenuItem[] = [
                  { key: 'edit', label: 'Edit', icon: <Pencil className="h-4 w-4" />, onSelect: () => setAction({ kind: 'edit', user: u }) },
                  { key: 'reset', label: 'Reset password', icon: <KeyRound className="h-4 w-4" />, onSelect: () => setAction({ kind: 'reset', user: u }) },
                  {
                    key: 'revoke',
                    label: 'Revoke sessions',
                    icon: <LogOut className="h-4 w-4" />,
                    disabled: u.activeSessions === 0,
                    onSelect: () => setAction({ kind: 'revoke', user: u }),
                  },
                  {
                    key: 'transfer',
                    label: 'Transfer documents',
                    icon: <ArrowRightLeft className="h-4 w-4" />,
                    disabled: u.ownedDocuments === 0,
                    onSelect: () => setAction({ kind: 'transfer', user: u }),
                  },
                  u.active
                    ? {
                        key: 'deactivate',
                        label: 'Deactivate',
                        icon: <UserX className="h-4 w-4" />,
                        danger: true,
                        separated: true,
                        disabled: isSelf,
                        onSelect: () => setAction({ kind: 'deactivate', user: u }),
                      }
                    : {
                        key: 'reactivate',
                        label: 'Reactivate',
                        icon: <UserCheck className="h-4 w-4" />,
                        separated: true,
                        onSelect: () => setAction({ kind: 'reactivate', user: u }),
                      },
                ];
                return (
                  <TR key={u.id} className={!u.active ? 'bg-slate-50/50' : undefined}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <UserCell user={u} className={!u.active ? 'opacity-60' : undefined} />
                        {isSelf && <Badge tone="brand">You</Badge>}
                        {u.mustChangePassword && (
                          <span title="Must change password at next sign-in">
                            <KeyRound className="h-3.5 w-3.5 text-amber-500" aria-label="Must change password" />
                          </span>
                        )}
                      </div>
                    </TD>
                    <TD className="hidden max-w-[14rem] truncate text-slate-500 lg:table-cell">{u.email ?? '—'}</TD>
                    <TD>
                      <RoleBadge value={u.role} />
                    </TD>
                    <TD>
                      <UserStatus user={u} now={now} />
                    </TD>
                    <TD className="hidden whitespace-nowrap text-slate-500 md:table-cell">
                      {u.lastLoginAt ? <RelativeTime value={u.lastLoginAt} /> : <span className="text-slate-400">Never</span>}
                    </TD>
                    <TD className="hidden text-right tabular-nums text-slate-600 sm:table-cell">{u.ownedDocuments}</TD>
                    <TD className="hidden text-right tabular-nums text-slate-600 sm:table-cell">{u.activeSessions}</TD>
                    <TD className="pr-3 text-right">
                      <DropdownMenu
                        items={items}
                        trigger={(props) => (
                          <Button {...props} variant="ghost" size="icon-sm" aria-label={`Actions for ${u.username}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        )}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <CreateUserDialog open={action?.kind === 'create'} onClose={close} />
      <EditUserDialog user={userFor('edit')} isSelf={userFor('edit')?.id === me.id} onClose={close} />
      <ResetPasswordDialog user={userFor('reset')} onClose={close} />
      <TransferDocumentsDialog user={userFor('transfer')} users={users.data ?? []} onClose={close} />

      <ConfirmDialog
        open={userFor('deactivate') !== null}
        tone="danger"
        title={`Deactivate @${userFor('deactivate')?.username ?? ''}?`}
        description="The user is signed out everywhere immediately — all active sessions are terminated on their very next request — and can no longer sign in. Their documents and grants are kept."
        confirmLabel="Deactivate"
        loading={update.isPending}
        onClose={close}
        onConfirm={() => {
          const u = userFor('deactivate');
          if (u) setActive(u, false);
        }}
      />
      <ConfirmDialog
        open={userFor('reactivate') !== null}
        title={`Reactivate @${userFor('reactivate')?.username ?? ''}?`}
        description="The user will be able to sign in again with their existing password."
        confirmLabel="Reactivate"
        loading={update.isPending}
        onClose={close}
        onConfirm={() => {
          const u = userFor('reactivate');
          if (u) setActive(u, true);
        }}
      />
      <ConfirmDialog
        open={userFor('revoke') !== null}
        tone="danger"
        title={`Revoke all sessions of @${userFor('revoke')?.username ?? ''}?`}
        description="Every active session of this user is terminated immediately. They will need to sign in again."
        confirmLabel="Revoke sessions"
        loading={revoke.isPending}
        onClose={close}
        onConfirm={() => {
          const u = userFor('revoke');
          if (u) revoke.mutate(u, { onError: (e) => notifyError(e), onSettled: close });
        }}
      />
    </>
  );
}
