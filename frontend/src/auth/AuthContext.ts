import { createContext, useContext } from 'react';
import type { LoginRequest, Me, Role } from '@/api/types';

export interface AuthContextValue {
  me: Me | null;
  isLoading: boolean;
  error: unknown;
  login: (credentials: LoginRequest) => Promise<Me>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** For components that only render inside authenticated routes. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error('useMe used outside an authenticated route');
  return me;
}
