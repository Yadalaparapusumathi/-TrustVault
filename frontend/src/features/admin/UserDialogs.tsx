import { useState, type FormEvent } from 'react';
import { ArrowRightLeft, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@/api/errors';
import { ROLES, type AdminUser, type Role } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select } from '@/components/ui/Input';
import { generatePassword, MIN_PASSWORD_LENGTH } from '@/lib/password';
import { notifyError } from '@/lib/notify';
import { useCreateUser, useResetPassword, useTransferDocuments, useUpdateUser } from './hooks';
import { OneTimeSecret, TempPasswordInput } from './TempPassword';

const roleHelp: Record<Role, string> = {
  ADMIN: 'Manages users and the audit trail. Cannot read documents unless explicitly shared.',
  OWNER: 'Uploads and owns documents, shares them with others.',
  VIEWER: 'Only sees documents explicitly shared with them.',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function applyServerErrors(err: unknown, setErrors: (e: Record<string, string>) => void): boolean {
  if (err instanceof ApiError && Object.keys(err.errors).length > 0) {
    setErrors(err.errors);
    return true;
  }
  return false;
}

// ---- Create ------------------------------------------------------------------

export function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <CreateUserInner onClose={onClose} />;
}

function CreateUserInner({ onClose }: { onClose: () => void }) {
  const create = useCreateUser();
  const [form, setForm] = useState({ username: '', displayName: '', email: '', role: 'VIEWER' as Role, temporaryPassword: generatePassword(20) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ user: AdminUser; password: string } | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!/^[a-zA-Z0-9._-]{3,64}$/.test(form.username.trim())) next.username = 'Use 3–64 letters, digits, dots, dashes or underscores.';
    if (!form.displayName.trim()) next.displayName = 'Display name is required.';
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (form.temporaryPassword.length < MIN_PASSWORD_LENGTH) next.temporaryPassword = `At least ${MIN_PASSWORD_LENGTH} characters.`;
    setErrors(next);
    if (Object.keys(next).length) return;
    const password = form.temporaryPassword;
    create.mutate(
      {
        username: form.username.trim(),
        displayName: form.displayName.trim(),
        email: form.email.trim() || undefined,
        role: form.role,
        temporaryPassword: password,
      },
      {
        onSuccess: (user) => {
          setCreated({ user, password });
          toast.success(`User @${user.username} created`);
        },
        onError: (err) => {
          if (!applyServerErrors(err, setErrors)) notifyError(err);
        },
      },
    );
  };

  if (created) {
    return (
      <Dialog open onClose={onClose} title="User created" description={`${created.user.displayName} must change this password at first sign-in.`} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <div className="pb-2">
          <OneTimeSecret value={created.password} username={created.user.username} />
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!create.isPending}
      title="New user"
      icon={<span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100"><UserPlus className="h-4 w-4" /></span>}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-user-form" loading={create.isPending}>
            Create user
          </Button>
        </>
      }
    >
      <form id="create-user-form" onSubmit={submit} className="space-y-4 pb-2" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="cu-username" label="Username" error={errors.username}>
            <Input id="cu-username" value={form.username} onChange={(e) => set('username', e.target.value)} invalid={!!errors.username} autoComplete="off" spellCheck={false} data-autofocus />
          </Field>
          <Field id="cu-display" label="Display name" error={errors.displayName}>
            <Input id="cu-display" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} invalid={!!errors.displayName} autoComplete="off" />
          </Field>
        </div>
        <Field id="cu-email" label="Email" optional error={errors.email}>
          <Input id="cu-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} autoComplete="off" />
        </Field>
        <Field id="cu-role" label="Role" error={errors.role} hint={roleHelp[form.role]}>
          <Select id="cu-role" value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0) + r.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="cu-password" label="Temporary password" error={errors.temporaryPassword} hint="Shown once after creation. The user must change it at first sign-in.">
          <TempPasswordInput id="cu-password" value={form.temporaryPassword} onChange={(v) => set('temporaryPassword', v)} invalid={!!errors.temporaryPassword} />
        </Field>
      </form>
    </Dialog>
  );
}

// ---- Edit --------------------------------------------------------------------

export function EditUserDialog({ user, isSelf, onClose }: { user: AdminUser | null; isSelf: boolean; onClose: () => void }) {
  if (!user) return null;
  return <EditUserInner user={user} isSelf={isSelf} onClose={onClose} />;
}

function EditUserInner({ user, isSelf, onClose }: { user: AdminUser; isSelf: boolean; onClose: () => void }) {
  const update = useUpdateUser();
  const [form, setForm] = useState({ displayName: user.displayName, email: user.email ?? '', role: user.role });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.displayName.trim()) next.displayName = 'Display name is required.';
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address.';
    setErrors(next);
    if (Object.keys(next).length) return;

    const body: { displayName?: string; email?: string; role?: Role } = {};
    if (form.displayName.trim() !== user.displayName) body.displayName = form.displayName.trim();
    if (form.email.trim() !== (user.email ?? '')) body.email = form.email.trim();
    if (form.role !== user.role) body.role = form.role;
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    update.mutate(
      { id: user.id, body },
      {
        onSuccess: (u) => {
          toast.success(`Saved changes to @${u.username}`);
          onClose();
        },
        onError: (err) => {
          if (!applyServerErrors(err, setErrors)) notifyError(err);
        },
      },
    );
  };

  const demotingOwner = user.role === 'OWNER' && form.role !== 'OWNER' && user.ownedDocuments > 0;

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!update.isPending}
      title={`Edit @${user.username}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="edit-user-form" loading={update.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-user-form" onSubmit={submit} className="space-y-4 pb-2" noValidate>
        <Field id="eu-display" label="Display name" error={errors.displayName}>
          <Input id="eu-display" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} invalid={!!errors.displayName} data-autofocus />
        </Field>
        <Field id="eu-email" label="Email" optional error={errors.email}>
          <Input id="eu-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} />
        </Field>
        <Field
          id="eu-role"
          label="Role"
          error={errors.role}
          hint={
            isSelf
              ? 'You cannot change your own role.'
              : demotingOwner
                ? `This user still owns ${user.ownedDocuments} document(s). Transfer them first, or the server will reject the change.`
                : roleHelp[form.role]
          }
        >
          <Select id="eu-role" value={form.role} onChange={(e) => set('role', e.target.value as Role)} disabled={isSelf}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0) + r.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Dialog>
  );
}

// ---- Reset password ----------------------------------------------------------

export function ResetPasswordDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  if (!user) return null;
  return <ResetPasswordInner user={user} onClose={onClose} />;
}

function ResetPasswordInner({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const reset = useResetPassword();
  const [password, setPassword] = useState(() => generatePassword(20));
  const [error, setError] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`At least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    const pw = password;
    reset.mutate(
      { id: user.id, temporaryPassword: pw },
      {
        onSuccess: () => setDone(pw),
        onError: (err) => {
          if (err instanceof ApiError && err.errors.temporaryPassword) setError(err.errors.temporaryPassword);
          else notifyError(err);
        },
      },
    );
  };

  if (done) {
    return (
      <Dialog open onClose={onClose} title="Password reset" description={`All sessions of ${user.displayName} were terminated.`} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <div className="pb-2">
          <OneTimeSecret value={done} username={user.username} />
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!reset.isPending}
      title={`Reset password for @${user.username}`}
      description="Their active sessions are terminated immediately and they must choose a new password at next sign-in."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={reset.isPending}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" form="reset-pw-form" loading={reset.isPending}>
            Reset password
          </Button>
        </>
      }
    >
      <form id="reset-pw-form" onSubmit={submit} className="pb-2" noValidate>
        <Field id="rp-password" label="Temporary password" error={error}>
          <TempPasswordInput
            id="rp-password"
            value={password}
            onChange={(v) => {
              setPassword(v);
              setError('');
            }}
            invalid={!!error}
          />
        </Field>
      </form>
    </Dialog>
  );
}

// ---- Transfer documents --------------------------------------------------------

export function TransferDocumentsDialog({ user, users, onClose }: { user: AdminUser | null; users: AdminUser[]; onClose: () => void }) {
  if (!user) return null;
  return <TransferInner user={user} users={users} onClose={onClose} />;
}

function TransferInner({ user, users, onClose }: { user: AdminUser; users: AdminUser[]; onClose: () => void }) {
  const transfer = useTransferDocuments();
  const targets = users.filter((u) => u.role === 'OWNER' && u.active && u.id !== user.id);
  const [toUserId, setToUserId] = useState(targets[0]?.id ?? '');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!toUserId) {
      setError('Choose an active owner to receive the documents.');
      return;
    }
    const target = targets.find((t) => t.id === toUserId);
    transfer.mutate(
      { from: user, toUserId },
      {
        onSuccess: (res) => {
          toast.success(`Transferred ${res.transferred} document${res.transferred === 1 ? '' : 's'} to ${target?.displayName ?? 'the new owner'}`);
          onClose();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.errors.toUserId) setError(err.errors.toUserId);
          else notifyError(err);
        },
      },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!transfer.isPending}
      title={`Transfer documents from @${user.username}`}
      icon={<span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100"><ArrowRightLeft className="h-4 w-4" /></span>}
      description={
        <>
          Ownership of all {user.ownedDocuments} document{user.ownedDocuments === 1 ? '' : 's'} owned by {user.displayName} moves to the
          selected owner. As an admin you gain no access to them.
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={transfer.isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="transfer-form" loading={transfer.isPending} disabled={targets.length === 0}>
            Transfer documents
          </Button>
        </>
      }
    >
      <form id="transfer-form" onSubmit={submit} className="pb-2" noValidate>
        {targets.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">There is no other active user with the OWNER role to transfer to.</p>
        ) : (
          <Field id="tr-target" label="New owner" error={error} hint="Only active users with the OWNER role can receive documents.">
            <Select id="tr-target" value={toUserId} onChange={(e) => { setToUserId(e.target.value); setError(''); }} data-autofocus>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName} (@{t.username}) — owns {t.ownedDocuments}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </form>
    </Dialog>
  );
}
