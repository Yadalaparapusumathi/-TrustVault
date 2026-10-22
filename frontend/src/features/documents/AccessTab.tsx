import { useState, type FormEvent } from 'react';
import { Clock, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { ApiError } from '@/api/errors';
import { PERMISSIONS, type DocumentDetail, type Grant, type Permission, type UserSummary } from '@/api/types';
import { useMe } from '@/auth/AuthContext';
import { PermissionBadge, RoleBadge, SuggestionSourceBadge } from '@/components/domain/badges';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Field, Input, Select } from '@/components/ui/Input';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { formatDateTime, localDateTimeToIso } from '@/lib/format';
import { notifyError } from '@/lib/notify';
import { AccessAssistant } from './AccessAssistant';
import { useCreateGrant, useGrants, useRevokeGrant } from './hooks';
import { UserPicker } from './UserPicker';

export function AccessTab({ doc }: { doc: DocumentDetail }) {
  const grants = useGrants(doc.id);
  const revoke = useRevokeGrant(doc.id);
  const [revokeTarget, setRevokeTarget] = useState<Grant | null>(null);
  const grantedIds = (grants.data ?? []).map((g) => g.grantee.id);

  return (
    <div className="grid gap-6 xl:grid-cols-5">
      <div className="space-y-6 xl:col-span-3">
        <Card>
          <CardHeader
            title="People with access"
            description="Only the people listed here (and you, the owner) can open this document."
            icon={<Users className="h-4 w-4" />}
          />
          {grants.isPending ? (
            <SkeletonRows rows={3} cols={3} />
          ) : grants.isError ? (
            <ErrorState error={grants.error} onRetry={() => void grants.refetch()} />
          ) : grants.data.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Only you have access"
              description="This document has not been shared with anyone. Use the form to grant access."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {grants.data.map((g) => (
                <li key={g.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={g.grantee.displayName} seed={g.grantee.id} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">{g.grantee.displayName}</span>
                        <RoleBadge value={g.grantee.role} />
                        {g.source === 'SUGGESTION' && <SuggestionSourceBadge />}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        @{g.grantee.username} · granted by {g.grantedBy.displayName} <RelativeTime value={g.createdAt} />
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3 w-3" aria-hidden />
                        {g.expiresAt ? (
                          <>
                            Expires <RelativeTime value={g.expiresAt} />
                          </>
                        ) : (
                          'No expiry'
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-11 sm:pl-0">
                    <PermissionBadge value={g.permission} />
                    <Button size="sm" variant="outline-danger" onClick={() => setRevokeTarget(g)}>
                      Revoke
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <AccessAssistant doc={doc} excludeIds={grantedIds} />
      </div>

      <div className="xl:col-span-2">
        <ShareForm doc={doc} />
      </div>

      <ConfirmDialog
        open={revokeTarget !== null}
        tone="danger"
        title="Revoke access?"
        description={
          <>
            <span className="font-medium text-slate-700">{revokeTarget?.grantee.displayName}</span> will lose access immediately — the
            revocation takes effect on their very next request, even if they have the document open. This is recorded in the audit trail.
          </>
        }
        confirmLabel="Revoke access"
        loading={revoke.isPending}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (revokeTarget) revoke.mutate(revokeTarget, { onSettled: () => setRevokeTarget(null) });
        }}
      />
    </div>
  );
}

function nowLocalInputValue(): string {
  const d = new Date(Date.now() + 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ShareForm({ doc }: { doc: DocumentDetail }) {
  const me = useMe();
  const create = useCreateGrant(doc.id);
  const [user, setUser] = useState<UserSummary | null>(null);
  const [permission, setPermission] = useState<Permission>('READ');
  const [expires, setExpires] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!user) next.userId = 'Choose a person to share with.';
    const expiresAt = localDateTimeToIso(expires);
    if (expires && (!expiresAt || new Date(expiresAt).getTime() <= Date.now())) next.expiresAt = 'Expiry must be in the future.';
    setErrors(next);
    if (!user || Object.keys(next).length) return;

    create.mutate(
      { userId: user.id, permission, expiresAt },
      {
        onSuccess: () => {
          setUser(null);
          setExpires('');
          setPermission('READ');
        },
        onError: (err) => {
          if (err instanceof ApiError && Object.keys(err.errors).length) setErrors(err.errors);
          notifyError(err);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader title="Share" description="Grant someone access. Only you, the owner, can share." icon={<UserPlus className="h-4 w-4" />} />
      <CardBody>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field id="share-user" label="Person" error={errors.userId}>
            <UserPicker
              id="share-user"
              value={user}
              onChange={(u) => {
                setUser(u);
                setErrors((x) => ({ ...x, userId: '' }));
              }}
              excludeIds={[me.id, doc.owner.id]}
              invalid={!!errors.userId}
              describedBy={errors.userId ? 'share-user-error' : undefined}
            />
          </Field>
          <Field
            id="share-permission"
            label="Permission"
            error={errors.permission}
            hint={permission === 'EDIT' ? 'Can view, download, edit details and upload new versions.' : 'Can view details and download any version.'}
          >
            <Select id="share-permission" value={permission} onChange={(e) => setPermission(e.target.value as Permission)}>
              {PERMISSIONS.map((p) => (
                <option key={p} value={p}>
                  {p === 'READ' ? 'Read' : 'Edit'}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="share-expires"
            label="Expires"
            optional
            error={errors.expiresAt}
            hint={expires ? `Access ends ${formatDateTime(new Date(expires))}.` : 'Leave empty for access until revoked.'}
          >
            <Input
              id="share-expires"
              type="datetime-local"
              value={expires}
              min={nowLocalInputValue()}
              onChange={(e) => {
                setExpires(e.target.value);
                setErrors((x) => ({ ...x, expiresAt: '' }));
              }}
              invalid={!!errors.expiresAt}
            />
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={create.isPending} leftIcon={<UserPlus className="h-4 w-4" />}>
            Grant access
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
