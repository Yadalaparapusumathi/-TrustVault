import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { Me } from '@/api/types';
import { AuthContext, type AuthContextValue } from '@/auth/AuthContext';

export const testUser: Me = {
  id: 'owner-id', username: 'test-owner', displayName: 'Test Owner', role: 'OWNER', email: null, mustChangePassword: false,
};

export function renderWithSession(ui: ReactElement, { me = testUser, route = '/documents' }: { me?: Me; route?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const auth: AuthContextValue = {
    me, isLoading: false, error: null, login: vi.fn(), logout: vi.fn(), refresh: vi.fn(),
    hasRole: (...roles) => roles.includes(me.role),
  };
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          {ui}
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
