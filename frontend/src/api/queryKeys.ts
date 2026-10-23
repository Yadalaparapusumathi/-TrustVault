import type { AuditSearchParams, DocumentSearchParams } from './types';

export const queryKeys = {
  me: ['auth', 'me'] as const,
  documents: {
    all: ['documents'] as const,
    lists: () => ['documents', 'list'] as const,
    list: (params: DocumentSearchParams) => ['documents', 'list', params] as const,
    categories: () => ['documents', 'categories'] as const,
    detail: (id: string) => ['documents', 'detail', id] as const,
    versions: (id: string) => ['documents', 'detail', id, 'versions'] as const,
    grants: (id: string) => ['documents', 'detail', id, 'grants'] as const,
    suggestions: (id: string) => ['documents', 'detail', id, 'suggestions'] as const,
    activity: (id: string, page: number, size: number) => ['documents', 'detail', id, 'activity', page, size] as const,
    activityAll: (id: string) => ['documents', 'detail', id, 'activity'] as const,
  },
  directory: (q: string) => ['users', 'directory', q] as const,
  admin: {
    dashboard: ['admin', 'dashboard'] as const,
    audit: (params: AuditSearchParams) => ['admin', 'audit', params] as const,
    auditAll: ['admin', 'audit'] as const,
    actions: ['admin', 'audit-actions'] as const,
    verify: ['admin', 'verify'] as const,
    users: ['admin', 'users'] as const,
  },
};
