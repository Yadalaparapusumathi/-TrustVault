import type { ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@/api/types';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageSpinner } from '@/components/ui/Spinner';
import { loginPathWithNext } from '@/lib/redirect';
import { useAuth } from './AuthContext';

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">{children}</div>;
}

/** Requires a session. Forces the password change flow when the server demands it. */
export function RequireAuth({ allowPasswordChange = false }: { allowPasswordChange?: boolean }) {
  const { me, isLoading, error, refresh } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <FullScreen>
        <PageSpinner label="Checking your session" />
      </FullScreen>
    );
  }
  if (!me && error) {
    return (
      <FullScreen>
        <div className="max-w-md">
          <ErrorState error={error} title="Unable to reach TrustVault" onRetry={() => void refresh()} />
        </div>
      </FullScreen>
    );
  }
  if (!me) return <Navigate to={loginPathWithNext(location.pathname + location.search)} replace />;
  if (me.mustChangePassword && !allowPasswordChange) return <Navigate to="/change-password" replace />;
  return <Outlet />;
}

/** UX-only role guard; the server is the real enforcer. */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { me } = useAuth();
  if (!me || !roles.includes(me.role)) return <Forbidden />;
  return <Outlet />;
}

function Forbidden() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="text-sm font-semibold text-brand-600">403</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">You don't have access to this area</h1>
      <p className="mt-2 text-sm text-slate-500">This section is restricted to a different role.</p>
      <Link
        to="/documents"
        className="mt-6 inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-soft hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        Back to documents
      </Link>
    </div>
  );
}
