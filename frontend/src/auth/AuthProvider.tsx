import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/api/auth';
import { setAuthHandlers } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { LoginRequest, Me, Role } from '@/api/types';
import { loginPathWithNext } from '@/lib/redirect';
import { AuthContext, type AuthContextValue } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const meQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => authApi.me(signal),
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const resetToSignedOut = useCallback(() => {
    void queryClient.cancelQueries();
    queryClient.clear();
    queryClient.setQueryData<Me | null>(queryKeys.me, null);
  }, [queryClient]);

  useEffect(() => {
    setAuthHandlers({
      onUnauthorized: () => {
        resetToSignedOut();
        const { pathname, search } = window.location;
        if (!pathname.startsWith('/login')) navigate(loginPathWithNext(pathname + search), { replace: true });
      },
      onPasswordChangeRequired: () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.me });
        if (window.location.pathname !== '/change-password') navigate('/change-password', { replace: true });
      },
    });
  }, [navigate, queryClient, resetToSignedOut]);

  const login = useCallback(
    async (credentials: LoginRequest) => {
      await authApi.csrf();
      const me = await authApi.login(credentials);
      queryClient.clear();
      queryClient.setQueryData<Me | null>(queryKeys.me, me);
      return me;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      resetToSignedOut();
      navigate('/login', { replace: true });
    }
  }, [navigate, resetToSignedOut]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.me });
  }, [queryClient]);

  const me = meQuery.data ?? null;
  const value = useMemo<AuthContextValue>(
    () => ({
      me,
      isLoading: meQuery.isPending,
      error: meQuery.error,
      login,
      logout,
      refresh,
      hasRole: (...roles: Role[]) => !!me && roles.includes(me.role),
    }),
    [me, meQuery.isPending, meQuery.error, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
