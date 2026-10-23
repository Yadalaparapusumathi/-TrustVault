import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { documentsApi } from '@/api/documents';
import { ApiError } from '@/api/errors';
import type { DocumentDetail, Grant } from '@/api/types';
import { SidebarContent } from '@/components/layout/Sidebar';
import WorkspacePage from '@/pages/WorkspacePage';
import { renderWithSession, testUser } from '@/test/renderWithSession';
import { AccessTab } from './AccessTab';
import { DocumentsLibrary } from './DocumentsLibrary';

const doc: DocumentDetail = {
  id: 'doc-id', name: 'Partner agreement', category: 'Contracts', classification: 'CONFIDENTIAL',
  owner: testUser, myPermission: 'OWNER', currentVersion: 2, sizeBytes: 1200, contentType: 'application/pdf',
  createdAt: '2026-01-01T12:00:00Z', updatedAt: '2026-01-02T12:00:00Z', deletedAt: null, purgeAfter: null,
  description: 'A test document.', originalFilename: 'agreement.pdf', sha256: 'test-hash', lockVersion: 1,
};
const grant: Grant = {
  id: 'grant-id', grantee: { id: 'reader-id', username: 'reader', displayName: 'Test Reader', role: 'VIEWER' },
  permission: 'READ', grantedBy: testUser, createdAt: '2026-01-01T12:00:00Z', expiresAt: '2099-01-01T12:00:23Z', source: 'MANUAL',
};

beforeEach(() => {
  vi.spyOn(documentsApi, 'search').mockResolvedValue({ content: [doc], page: 0, size: 20, totalElements: 1, totalPages: 1 });
  vi.spyOn(documentsApi, 'categories').mockResolvedValue(['Contracts']);
});
afterEach(() => vi.restoreAllMocks());

describe('document workspace', () => {
  it('uses the same protected document and download actions in grid and list views', async () => {
    const download = vi.spyOn(documentsApi, 'download').mockResolvedValue('agreement.pdf');
    renderWithSession(<DocumentsLibrary />);
    expect(await screen.findByRole('link', { name: doc.name })).toHaveAttribute('href', '/documents/doc-id');
    fireEvent.click(screen.getByRole('button', { name: `Download ${doc.name}` }));
    await waitFor(() => expect(download).toHaveBeenCalledWith(doc.id, doc.name));
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: doc.name })).toHaveAttribute('href', '/documents/doc-id');
    fireEvent.click(screen.getByRole('button', { name: `Actions for ${doc.name}` }));
    expect(screen.getByRole('menuitem', { name: 'Move to trash' })).toBeInTheDocument();
  });

  it('sends name, owner, category, date and sort filters to the server', async () => {
    renderWithSession(<DocumentsLibrary />);
    await screen.findByRole('link', { name: doc.name });
    fireEvent.change(screen.getByLabelText('Search by name'), { target: { value: 'Partner' } });
    fireEvent.change(screen.getByLabelText('Filter by owner'), { target: { value: 'test-owner' } });
    await waitFor(() => expect(documentsApi.search).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Partner', owner: 'test-owner' }), expect.any(AbortSignal)));
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Contracts' } });
    fireEvent.change(screen.getByLabelText('Created from'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Created to'), { target: { value: '2026-12-31' } });
    fireEvent.change(screen.getByLabelText('Sort documents'), { target: { value: 'name,asc' } });
    await waitFor(() => expect(documentsApi.search).toHaveBeenLastCalledWith(expect.objectContaining({
      q: 'Partner', owner: 'test-owner', category: 'Contracts', from: '2026-01-01', to: '2026-12-31', sort: 'name,asc', page: 0,
    }), expect.any(AbortSignal)));
  });

  it('does not expose owner actions for a viewer with a read grant', async () => {
    vi.mocked(documentsApi.search).mockResolvedValue({ content: [{ ...doc, myPermission: 'READ' }], page: 0, size: 20, totalElements: 1, totalPages: 1 });
    renderWithSession(<DocumentsLibrary />, { me: { ...testUser, id: 'reader-id', role: 'VIEWER' } });
    await screen.findByRole('link', { name: doc.name });
    expect(screen.queryByRole('button', { name: 'Upload document' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Trash' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Actions for ${doc.name}` }));
    expect(screen.queryByRole('menuitem', { name: 'Move to trash' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Download' })).toBeInTheDocument();
  });

  it('shows server-filtered totals rather than counting the recent document page', async () => {
    vi.mocked(documentsApi.search).mockImplementation(async (params) => ({
      content: params.size === 6 ? [doc] : [], page: 0, size: params.size ?? 20,
      totalElements: params.scope === 'all' ? 47 : params.scope === 'owned' ? 32 : params.scope === 'shared' ? 15 : 4,
      totalPages: 1,
    }));
    renderWithSession(<WorkspacePage />);
    expect(await screen.findByText('47')).toBeInTheDocument();
    expect(await screen.findByText('32')).toBeInTheDocument();
    expect(await screen.findByText('15')).toBeInTheDocument();
    expect(await screen.findByText('4')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Partner agreement/ })).toHaveLength(1);
  });
});

describe('role-aware navigation', () => {
  it('distinguishes document scopes in the sidebar', () => {
    renderWithSession(<SidebarContent />, { route: '/documents?scope=owned' });
    expect(screen.getByRole('link', { name: 'My documents' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'All documents' })).not.toHaveAttribute('aria-current');
    fireEvent.click(screen.getByRole('link', { name: 'Shared with me' }));
    expect(screen.getByRole('link', { name: 'Shared with me' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'My documents' })).not.toHaveAttribute('aria-current');
  });

  it('keeps administration and ownership navigation out of the viewer workspace', () => {
    renderWithSession(<SidebarContent />, { me: { ...testUser, role: 'VIEWER' } });
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/workspace');
    for (const name of ['People & roles', 'Audit trail', 'My documents', 'Trash & recovery']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });
});

describe('editing an existing grant', () => {
  beforeEach(() => {
    vi.spyOn(documentsApi, 'grants').mockResolvedValue([grant]);
  });

  it('updates the named grant explicitly, preserves unchanged expiry and never generates suggestions automatically', async () => {
    const create = vi.spyOn(documentsApi, 'createGrant').mockResolvedValue({ ...grant, permission: 'EDIT' });
    const suggestions = vi.spyOn(documentsApi, 'generateSuggestions');
    renderWithSession(<AccessTab doc={doc} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit access for Test Reader' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit document access' });
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Permission'), { target: { value: 'EDIT' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save access changes' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(doc.id, { userId: grant.grantee.id, permission: 'EDIT', expiresAt: grant.expiresAt }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(suggestions).not.toHaveBeenCalled();
  });

  it('keeps the permission editor open when the server rejects a change', async () => {
    vi.spyOn(documentsApi, 'createGrant').mockRejectedValue(new ApiError(400, { errors: { permission: 'This permission is not allowed.' } }));
    renderWithSession(<AccessTab doc={doc} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit access for Test Reader' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save access changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This permission is not allowed.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
