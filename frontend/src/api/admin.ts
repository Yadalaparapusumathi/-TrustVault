import { api, downloadFile, type QueryParams } from './client';
import type {
  AdminUser,
  AuditEvent,
  AuditSearchParams,
  CreateUserRequest,
  Dashboard,
  IntegrityReport,
  Page,
  ResetPasswordRequest,
  TransferDocumentsRequest,
  TransferDocumentsResponse,
  UpdateUserRequest,
} from './types';

const user = (id: string) => `/admin/users/${encodeURIComponent(id)}`;

export const adminApi = {
  dashboard: (signal?: AbortSignal) => api.get<Dashboard>('/admin/dashboard', { signal }),
  audit: (params: AuditSearchParams, signal?: AbortSignal) =>
    api.get<Page<AuditEvent>>('/admin/audit', { query: { ...params }, signal }),
  auditActions: (signal?: AbortSignal) => api.get<string[]>('/admin/audit/actions', { signal }),
  exportAudit: (params: Omit<AuditSearchParams, 'page' | 'size'>) =>
    downloadFile('/admin/audit/export', { query: { ...params } as QueryParams, fallbackFilename: 'audit-export.csv' }),
  verify: () => api.get<IntegrityReport>('/admin/audit/verify'),

  users: (signal?: AbortSignal) => api.get<AdminUser[]>('/admin/users', { signal }),
  createUser: (body: CreateUserRequest) => api.post<AdminUser>('/admin/users', body),
  updateUser: (id: string, body: UpdateUserRequest) => api.patch<AdminUser>(user(id), body),
  resetPassword: (id: string, body: ResetPasswordRequest) => api.post<void>(`${user(id)}/reset-password`, body),
  revokeSessions: (id: string) => api.post<void>(`${user(id)}/revoke-sessions`),
  transferDocuments: (id: string, body: TransferDocumentsRequest) =>
    api.post<TransferDocumentsResponse>(`${user(id)}/transfer-documents`, body),
};
