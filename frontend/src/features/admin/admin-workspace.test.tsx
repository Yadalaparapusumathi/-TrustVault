import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '@/api/admin';
import { ApiError } from '@/api/errors';
import { toast } from 'sonner';
import type { AdminUser } from '@/api/types';
import { renderWithSession, testUser } from '@/test/renderWithSession';
import { AuditLog } from './AuditLog';
import { UsersAdmin } from './UsersAdmin';

afterEach(() => vi.restoreAllMocks());

describe('administration workspace', () => {
  const viewer: AdminUser = {
    ...testUser, id: 'viewer-id', username: 'reader', displayName: 'Test Reader', role: 'VIEWER',
    active: true, lockedUntil: null, lastLoginAt: null, createdAt: '2026-01-01T00:00:00Z',
    ownedDocuments: 0, activeSessions: 2,
  };

  it('requires confirmation before deleting and removes the account after success', async () => {
    const users = vi.spyOn(adminApi, 'users').mockResolvedValue([viewer]);
    const remove = vi.spyOn(adminApi, 'deleteUser').mockImplementation(async () => { users.mockResolvedValue([]); });
    renderWithSession(<UsersAdmin />, { me: { ...testUser, role: 'ADMIN' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for reader' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete user' }));
    expect(screen.getByText(/Unlike deactivation, this cannot be undone/)).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Type reader to confirm'), { target: { value: 'reader' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete user' }));
    await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith('viewer-id'));
    await waitFor(() => expect(screen.queryByText('Test Reader')).not.toBeInTheDocument());
  });

  it('keeps an owner visible and surfaces a refused deletion', async () => {
    vi.spyOn(adminApi, 'users').mockResolvedValue([{ ...viewer, role: 'OWNER', ownedDocuments: 1 }]);
    vi.spyOn(adminApi, 'deleteUser').mockRejectedValue(new ApiError(409, { detail: 'Transfer documents first.' }));
    const error = vi.spyOn(toast, 'error');
    renderWithSession(<UsersAdmin />, { me: { ...testUser, role: 'ADMIN' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for reader' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete user' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Transfer documents first');
    fireEvent.change(screen.getByLabelText('Type reader to confirm'), { target: { value: 'reader' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete user' }));
    await waitFor(() => expect(error).toHaveBeenCalledWith('Transfer documents first.'));
    expect(screen.getByText('Test Reader')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('disables self-deletion', async () => {
    vi.spyOn(adminApi, 'users').mockResolvedValue([{ ...viewer, id: testUser.id, role: 'ADMIN' }]);
    renderWithSession(<UsersAdmin />, { me: { ...testUser, role: 'ADMIN' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for reader' }));
    expect(screen.getByRole('menuitem', { name: 'Delete user' })).toBeDisabled();
  });

  it('filters people by role and restores the full directory when cleared', async () => {
    const owner: AdminUser = {
      ...testUser, active: true, lockedUntil: null, lastLoginAt: null, createdAt: '2026-01-01T00:00:00Z',
      ownedDocuments: 2, activeSessions: 1,
    };
    vi.spyOn(adminApi, 'users').mockResolvedValue([
      owner, { ...owner, id: 'viewer-id', username: 'reader', displayName: 'Test Reader', role: 'VIEWER', ownedDocuments: 0 },
    ]);
    renderWithSession(<UsersAdmin />, { me: { ...testUser, role: 'ADMIN' } });
    await screen.findByText('Test Reader');
    fireEvent.click(screen.getByRole('button', { name: 'Filter viewer accounts' }));
    expect(screen.queryByText('Test Owner')).not.toBeInTheDocument();
    expect(screen.getByText('Test Reader')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear role filter' }));
    expect(screen.getByText('Test Owner')).toBeInTheDocument();
    expect(screen.getByText('Test Reader')).toBeInTheDocument();
  });

  it('applies quick audit filters to both the server query and CSV export', async () => {
    vi.spyOn(adminApi, 'auditActions').mockResolvedValue(['GRANT_REVOKED', 'ACCESS_DENIED']);
    const audit = vi.spyOn(adminApi, 'audit').mockResolvedValue({ content: [], page: 0, size: 50, totalElements: 0, totalPages: 0 });
    const exportAudit = vi.spyOn(adminApi, 'exportAudit').mockResolvedValue('audit.csv');
    renderWithSession(<AuditLog />, { me: { ...testUser, role: 'ADMIN' }, route: '/admin/audit?actor=reader&page=3' });
    await screen.findByRole('heading', { name: 'No events' });
    fireEvent.click(screen.getByRole('button', { name: 'Denied attempts' }));
    await waitFor(() => expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ actor: 'reader', outcome: 'DENIED', page: 0 }), expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(exportAudit).toHaveBeenCalledWith(expect.objectContaining({ actor: 'reader', outcome: 'DENIED' })));
    fireEvent.click(screen.getByRole('button', { name: 'Revocations' }));
    await waitFor(() => expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ actor: 'reader', action: 'GRANT_REVOKED', outcome: undefined, page: 0 }), expect.any(AbortSignal)));
  });
});
