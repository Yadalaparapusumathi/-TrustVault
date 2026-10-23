import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/errors';
import { AuthContext, type AuthContextValue } from '@/auth/AuthContext';
import LoginPage from './LoginPage';

function renderLogin(login = vi.fn<AuthContextValue['login']>(), initialEntry = '/login') {
  const auth: AuthContextValue = {
    me: null,
    isLoading: false,
    error: null,
    login,
    logout: vi.fn(),
    refresh: vi.fn(),
    hasRole: () => false,
  };
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/documents" element={<h1>Document library</h1>} />
          <Route path="/workspace" element={<h1>Workspace overview</h1>} />
          <Route path="/admin" element={<h1>Admin overview</h1>} />
          <Route path="/change-password" element={<h1>Change password</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return login;
}

afterEach(() => vi.unstubAllEnvs());

describe('local test accounts', () => {
  it.each([
    ['admin', 'Admin#Vault2026'],
  ])('fills %s credentials without bypassing sign-in', async (username, password) => {
    const login = vi.fn<AuthContextValue['login']>().mockResolvedValue({
      id: 'test-user',
      username,
      displayName: 'Test user',
      role: 'ADMIN',
      email: null,
      mustChangePassword: false,
    });
    renderLogin(login);

    fireEvent.click(screen.getByRole('button', { name: username }));
    expect(screen.getByLabelText('Username')).toHaveValue(username);
    expect(screen.getByLabelText('Password')).toHaveValue(password);
    expect(login).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(login).toHaveBeenCalledExactlyOnceWith({ username, password });
    expect(await screen.findByRole('heading', { name: 'Admin overview' })).toBeInTheDocument();
  });

  it('offers only the bootstrap admin and explains how to create other accounts', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: 'admin' })).toBeInTheDocument();
    expect(screen.getByText(/Only admin is created/)).toHaveTextContent('New user');
    for (const name of ['alice', 'bob', 'erin', 'carol', 'dave', 'frank', 'sumathi', 'asha', 'mounika', 'blessy', 'prasanna', 'nandini']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('keeps failed demo logins on the sign-in page and allows correcting the password', async () => {
    const login = vi.fn<AuthContextValue['login']>().mockRejectedValue(
      new ApiError(401, { detail: 'Invalid credentials' }),
    );
    renderLogin(login);
    fireEvent.click(screen.getByRole('button', { name: 'admin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password.');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.queryByRole('heading', { name: 'Document library' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'locally-overridden-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(login).toHaveBeenLastCalledWith({
      username: 'admin',
      password: 'locally-overridden-password',
    }));
  });

  it('does not show demo accounts outside development', () => {
    vi.stubEnv('DEV', false);
    renderLogin();
    expect(screen.queryByRole('region', { name: 'Local test accounts' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it.each([false, true])('preserves a safe deep link unless a password change is required (%s)', async (mustChangePassword) => {
    const login = vi.fn<AuthContextValue['login']>().mockResolvedValue({
      id: 'admin-id', username: 'admin', displayName: 'Admin', role: 'ADMIN', email: null, mustChangePassword,
    });
    renderLogin(login, '/login?next=%2Fdocuments');
    fireEvent.click(screen.getByRole('button', { name: 'admin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: mustChangePassword ? 'Change password' : 'Document library' })).toBeInTheDocument();
  });
});
