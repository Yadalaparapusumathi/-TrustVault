import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '@/api/admin';
import type { AdminUser } from '@/api/types';
import { renderWithSession, testUser } from '@/test/renderWithSession';
import { AuditLog } from './AuditLog';
import { UsersAdmin } from './UsersAdmin';

afterEach(() => vi.restoreAllMocks());

describe('administration workspace', () => {
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
