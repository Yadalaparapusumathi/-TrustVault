import { useState, type FormEvent } from 'react';
import { AlertCircle, Eye, EyeOff, Fingerprint, History, Lock, ShieldCheck } from 'lucide-react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, errorMessage } from '@/api/errors';
import { useAuth } from '@/auth/AuthContext';
import { Logo, LogoMark } from '@/components/domain/Logo';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { PageSpinner } from '@/components/ui/Spinner';
import { safeNext } from '@/lib/redirect';

const features = [
  { icon: Lock, title: 'Need-to-know by default', text: 'Every document is private until its owner grants access — at read or edit level, optionally time-boxed.' },
  { icon: History, title: 'Tamper-evident audit trail', text: 'Every view, download, share and denial is recorded in an HMAC-chained log you can verify at any time.' },
  { icon: Fingerprint, title: 'Instant revocation', text: 'Revoking access, deactivating a user or ending sessions takes effect on the very next request.' },
];

export default function LoginPage() {
  const { me, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <PageSpinner />;
  if (me && !submitting) return <Navigate to={me.mustChangePassword ? '/change-password' : next} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const user = await login({ username: username.trim(), password });
      navigate(user.mustChangePassword ? '/change-password' : next, { replace: true });
    } catch (err) {
      setPassword('');
      if (err instanceof ApiError && err.status === 401) setError('Invalid username or password.');
      else if (err instanceof ApiError && err.status === 429) setError('Too many attempts, try again later.');
      else setError(errorMessage(err, 'Sign-in failed. Please try again.'));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      <aside className="relative hidden w-[46%] max-w-2xl overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 lg:flex lg:flex-col">
        <div aria-hidden className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-500/30 blur-3xl" />
        <div aria-hidden className="absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-violet-500/25 blur-3xl" />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="relative flex flex-1 flex-col justify-between p-12 xl:p-16">
          <Logo inverted />
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-indigo-100 backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Secure confidential-document platform
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white xl:text-5xl">
              Only the people you choose.
              <span className="block bg-gradient-to-r from-indigo-200 to-violet-200 bg-clip-text text-transparent">Proof of everyone who looked.</span>
            </h1>
            <ul className="mt-10 space-y-6">
              {features.map((f) => (
                <li key={f.title} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-indigo-100 ring-1 ring-white/15">
                    <f.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{f.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-indigo-100/75">{f.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-indigo-200/60">© {new Date().getFullYear()} TrustVault. All access is monitored and recorded.</p>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          <LogoMark className="mb-6 hidden h-10 w-10 lg:block" />
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in to TrustVault</h2>
          <p className="mt-1.5 text-sm text-slate-500">Use the credentials provided by your administrator.</p>

          <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
            {error && (
              <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}
            <Field id="login-username" label="Username">
              <Input
                id="login-username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-10"
                autoFocus
                required
              />
            </Field>
            <Field id="login-password" label="Password">
              <Input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10"
                required
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="rounded-md p-1.5 text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />
            </Field>
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={submitting}>
              Sign in
            </Button>
          </form>
          <p className="mt-8 text-center text-xs text-slate-400">
            Sessions expire after 30 minutes of inactivity. Forgot your password? Contact your administrator.
          </p>
        </div>
      </main>
    </div>
  );
}
