import { useState, type FormEvent } from 'react';
import { ArrowLeft, KeyRound, ShieldAlert } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { authApi } from '@/api/auth';
import { ApiError } from '@/api/errors';
import { useAuth, useMe } from '@/auth/AuthContext';
import { Logo } from '@/components/domain/Logo';
import { PasswordStrengthMeter } from '@/components/domain/PasswordStrengthMeter';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Input';
import { notifyError } from '@/lib/notify';
import { MIN_PASSWORD_LENGTH } from '@/lib/password';
import { homeForRole } from '@/lib/redirect';

export default function ChangePasswordPage() {
  const me = useMe();
  const { refresh, logout } = useAuth();
  const navigate = useNavigate();
  const forced = me.mustChangePassword;
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.currentPassword) next.currentPassword = 'Enter your current password.';
    if (form.newPassword.length < MIN_PASSWORD_LENGTH) next.newPassword = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    else if (form.newPassword === form.currentPassword) next.newPassword = 'The new password must differ from the current one.';
    else if (me.username && form.newPassword.toLowerCase().includes(me.username.toLowerCase()))
      next.newPassword = 'The password must not contain your username.';
    if (form.confirm !== form.newPassword) next.confirm = 'Passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await authApi.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      await refresh();
      toast.success('Password changed', { description: 'All your other sessions were signed out.' });
      navigate(homeForRole(me.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.errors).length) setErrors(err.errors);
      else if (err instanceof ApiError && err.status === 400) setErrors({ newPassword: err.userMessage });
      else if (err instanceof ApiError && (err.status === 401 || err.status === 403) && /current/i.test(err.userMessage))
        setErrors({ currentPassword: err.userMessage });
      else notifyError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const content = (
    <Card className="w-full max-w-md p-6 sm:p-8">
      <div className="mb-6 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <KeyRound className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{forced ? 'Choose a new password' : 'Change password'}</h1>
          <p className="mt-0.5 text-sm text-slate-500">Changing your password signs you out of all other sessions.</p>
        </div>
      </div>
      {forced && (
        <div role="status" className="mb-5 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          You are using a temporary password. Set a personal password to continue.
        </div>
      )}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <input type="text" name="username" autoComplete="username" value={me.username} readOnly hidden />
        <Field id="cp-current" label={forced ? 'Temporary password' : 'Current password'} error={errors.currentPassword}>
          <Input
            id="cp-current"
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(e) => set('currentPassword', e.target.value)}
            invalid={!!errors.currentPassword}
            aria-describedby={errors.currentPassword ? 'cp-current-error' : undefined}
            autoFocus
          />
        </Field>
        <Field
          id="cp-new"
          label="New password"
          error={errors.newPassword}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. Avoid common passwords and your username.`}
        >
          <Input
            id="cp-new"
            type="password"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(e) => set('newPassword', e.target.value)}
            invalid={!!errors.newPassword}
            aria-describedby={errors.newPassword ? 'cp-new-error' : 'cp-new-hint'}
          />
          <PasswordStrengthMeter password={form.newPassword} />
        </Field>
        <Field id="cp-confirm" label="Confirm new password" error={errors.confirm}>
          <Input
            id="cp-confirm"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => set('confirm', e.target.value)}
            invalid={!!errors.confirm}
            aria-describedby={errors.confirm ? 'cp-confirm-error' : undefined}
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={submitting}>
          Update password
        </Button>
      </form>
      {forced && (
        <button
          type="button"
          onClick={() => void logout().catch(notifyError)}
          className="mt-4 w-full rounded text-center text-sm text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Sign out instead
        </button>
      )}
    </Card>
  );

  if (forced) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-50 px-4 py-12">
        <Logo />
        {content}
      </div>
    );
  }
  return (
    <div>
      <Link
        to="/documents"
        className="mb-6 inline-flex items-center gap-1 rounded text-sm text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </Link>
      <div className="flex justify-center">{content}</div>
    </div>
  );
}
