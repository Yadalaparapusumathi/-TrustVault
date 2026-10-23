import { useState, type FormEvent } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Fingerprint, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, errorMessage } from '@/api/errors';
import { useAuth } from '@/auth/AuthContext';
import { Logo } from '@/components/domain/Logo';
import { VaultIllustration } from '@/components/domain/VaultIllustration';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { PageSpinner } from '@/components/ui/Spinner';
import { homeForRole, safeNext } from '@/lib/redirect';

// Public credentials from application-dev.yml, never included in production builds.
const demoAccounts = import.meta.env.DEV ? [
  {
    role: 'Admin',
    usernames: ['admin'],
    password: 'Admin#Vault2026',
    description: 'Dashboard, users and audit log via the sidebar. No document access by default.',
  },
  {
    role: 'Owner',
    usernames: ['alice', 'bob', 'erin'],
    password: 'Owner#Vault2026',
    description: 'Document library, uploads, versions, sharing and trash. Start with alice.',
  },
  {
    role: 'Viewer',
    usernames: ['carol', 'dave', 'frank'],
    password: 'Viewer#Vault2026',
    description: 'Shared documents only. Frank also has edit access to the partner integration spec.',
  },
] : [];

export default function LoginPage() {
  const { me, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = (role: Parameters<typeof homeForRole>[0]) => safeNext(params.get('next'), homeForRole(role));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <PageSpinner />;
  if (me && !submitting) return <Navigate to={me.mustChangePassword ? '/change-password' : next(me.role)} replace />;

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
      navigate(user.mustChangePassword ? '/change-password' : next(user.role), { replace: true });
    } catch (err) {
      setPassword('');
      if (err instanceof ApiError && err.status === 401) setError('Invalid username or password.');
      else if (err instanceof ApiError && err.status === 429) setError('Too many attempts, try again later.');
      else setError(errorMessage(err, 'Sign-in failed. Please try again.'));
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.05fr_1fr]">
      <aside className="workspace-hero relative m-4 hidden flex-col justify-between p-10 lg:flex xl:p-14">
        <div className="flex items-center justify-between">
          <Logo inverted />
          <span className="rounded-full border border-white/15 px-3 py-1.5 text-[10px] text-white/65">CONFIDENTIAL, BY DEFAULT</span>
        </div>
        <div className="mx-auto w-full max-w-lg py-8">
          <p className="eyebrow mb-5 flex items-center gap-2 text-lime"><span className="h-1.5 w-1.5 rounded-full bg-lime" /> A little more control. A lot more trust.</p>
          <h1 className="text-[clamp(2.25rem,3.5vw,3.6rem)] font-medium leading-[1.16] tracking-[-0.055em]">
            The right files.<br />The right people.<br /><span className="text-lime">Nothing left to chance.</span>
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-7 text-white/60">A considered space for your most confidential work. Share precisely, stay in control, and know who accessed what.</p>
          <VaultIllustration className="mx-auto mt-2 max-w-[420px]" />
          <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
            {[{ icon: LockKeyhole, title: 'Private access', text: 'Named people only' }, { icon: Fingerprint, title: 'A lasting record', text: 'Tamper-evident history' }, { icon: ShieldCheck, title: 'Your control', text: 'Revoke on next request' }].map((item) => (
              <div key={item.title}><item.icon className="mb-3 h-5 w-5 text-lime" strokeWidth={1.5} /><p className="text-xs font-medium text-white">{item.title}</p><p className="mt-1 text-[11px] text-white/45">{item.text}</p></div>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-white/35">&copy; {new Date().getFullYear()} TrustVault. Built around trust, not public links.</p>
      </aside>

      <main className="flex items-center justify-center px-6 py-10 sm:px-12">
        <div className="w-full max-w-[410px]">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-100 bg-white text-brand-700 shadow-soft"><LockKeyhole className="h-5 w-5" strokeWidth={1.6} /></span>
          <p className="eyebrow mb-2 text-brand-600">Your private workspace awaits</p>
          <h2 className="text-3xl font-semibold tracking-[-0.045em] text-ink">Welcome back.</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">Sign in to TrustVault with your administrator-provided account.</p>

          <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
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
                className="h-12"
                placeholder="Enter your username"
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
                className="h-12"
                placeholder="Enter your password"
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
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={submitting} rightIcon={<ArrowRight className="h-4 w-4" />}>
              Sign in
            </Button>
          </form>
          {import.meta.env.DEV && (
            <section aria-labelledby="demo-accounts-heading" className="mt-6 rounded-2xl border border-brand-100 bg-white p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <h3 id="demo-accounts-heading" className="text-xs font-semibold text-ink">Local test accounts</h3>
                <span className="eyebrow rounded-md bg-lime/50 px-2 py-1 text-brand-800">Dev only</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Pick an account, then sign in. Backend <code>dev</code> seeds an empty database with users and sample files.
              </p>
              <div className="mt-3 divide-y divide-slate-100">
                {demoAccounts.map((account) => (
                  <div key={account.role} className="py-2.5" title={account.description}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-800">{account.role}</span>
                      <code className="text-slate-600">{account.password}</code>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {account.usernames.map((name) => (
                        <Button
                          key={name}
                          size="sm"
                          disabled={submitting}
                          aria-pressed={username === name}
                          variant={username === name ? 'primary' : 'secondary'}
                          onClick={() => {
                            setUsername(name);
                            setPassword(account.password);
                            setShowPassword(false);
                            setError(null);
                          }}
                        >
                          {name}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Existing users are never reset. If passwords were overridden, use your configured password.
                Admin opens the dashboard; owners and viewers open their workspace.
              </p>
            </section>
          )}
          <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
            Need help signing in? Contact your administrator.<br /><span className="text-[11px] text-slate-400">Sessions expire after 30 minutes of inactivity.</span>
          </p>
        </div>
      </main>
    </div>
  );
}
