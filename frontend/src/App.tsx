import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useMe } from '@/auth/AuthContext';
import { RequireAuth, RequireRole } from '@/auth/guards';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageSpinner } from '@/components/ui/Spinner';
import ChangePasswordPage from '@/pages/ChangePasswordPage';
import DocumentDetailPage from '@/pages/DocumentDetailPage';
import DocumentsPage from '@/pages/DocumentsPage';
import LoginPage from '@/pages/LoginPage';
import NotFoundPage from '@/pages/NotFoundPage';
import WorkspacePage from '@/pages/WorkspacePage';
import { homeForRole } from '@/lib/redirect';

const AdminDashboardPage = lazy(() => import('@/pages/AdminDashboardPage'));
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage'));
const UsersPage = lazy(() => import('@/pages/UsersPage'));

function HomeRoute() {
  return <Navigate to={homeForRole(useMe().role)} replace />;
}

/** Forced password changes render standalone; voluntary ones inside the app shell. */
function ChangePasswordRoute() {
  const me = useMe();
  if (me.mustChangePassword) return <ChangePasswordPage />;
  return (
    <AppLayout>
      <ChangePasswordPage />
    </AppLayout>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth allowPasswordChange />}>
          <Route path="/change-password" element={<ChangePasswordRoute />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<HomeRoute />} />
            <Route path="/workspace" element={<WorkspacePage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/documents/:id" element={<DocumentDetailPage />} />
            <Route element={<RequireRole roles={['ADMIN']} />}>
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/admin/audit" element={<AuditLogPage />} />
              <Route path="/admin/users" element={<UsersPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
