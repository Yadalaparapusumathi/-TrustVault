import { api, downloadFile, uploadMultipart, type UploadOptions } from './client';
import type {
  AuditEvent,
  CreateGrantRequest,
  DocumentDetail,
  DocumentSearchParams,
  DocumentSummary,
  Grant,
  Page,
  Suggestion,
  UpdateDocumentRequest,
  UploadDocumentRequest,
  UserSummary,
  Version,
} from './types';

const enc = encodeURIComponent;
const doc = (id: string) => `/documents/${enc(id)}`;

export const documentsApi = {
  search: (params: DocumentSearchParams, signal?: AbortSignal) =>
    api.get<Page<DocumentSummary>>('/documents', { query: { ...params }, signal }),

  categories: (signal?: AbortSignal) => api.get<string[]>('/documents/categories', { signal }),

  get: (id: string, signal?: AbortSignal) => api.get<DocumentDetail>(doc(id), { signal }),

  upload(req: UploadDocumentRequest, options?: UploadOptions): Promise<DocumentDetail> {
    const form = new FormData();
    form.append('file', req.file);
    if (req.name) form.append('name', req.name);
    if (req.description) form.append('description', req.description);
    form.append('category', req.category);
    if (req.classification) form.append('classification', req.classification);
    return uploadMultipart<DocumentDetail>('/documents', form, options);
  },

  update: (id: string, body: UpdateDocumentRequest) => api.patch<DocumentDetail>(doc(id), body),

  download: (id: string, fallbackFilename?: string) =>
    downloadFile(`${doc(id)}/content`, { fallbackFilename }),

  versions: (id: string, signal?: AbortSignal) => api.get<Version[]>(`${doc(id)}/versions`, { signal }),

  uploadVersion(id: string, file: File, options?: UploadOptions): Promise<DocumentDetail> {
    const form = new FormData();
    form.append('file', file);
    return uploadMultipart<DocumentDetail>(`${doc(id)}/versions`, form, options);
  },

  downloadVersion: (id: string, versionNo: number, fallbackFilename?: string) =>
    downloadFile(`${doc(id)}/versions/${versionNo}/content`, { fallbackFilename }),

  trash: (id: string) => api.delete(doc(id)),
  restore: (id: string) => api.post<DocumentDetail>(`${doc(id)}/restore`),
  purge: (id: string) => api.delete(`${doc(id)}/purge`),

  activity: (id: string, page: number, size: number, signal?: AbortSignal) =>
    api.get<Page<AuditEvent>>(`${doc(id)}/activity`, { query: { page, size }, signal }),

  grants: (id: string, signal?: AbortSignal) => api.get<Grant[]>(`${doc(id)}/grants`, { signal }),
  createGrant: (id: string, body: CreateGrantRequest) => api.post<Grant>(`${doc(id)}/grants`, body),
  revokeGrant: (id: string, grantId: string) => api.delete(`${doc(id)}/grants/${enc(grantId)}`),

  suggestions: (id: string, signal?: AbortSignal) => api.get<Suggestion[]>(`${doc(id)}/suggestions`, { signal }),
  dismissSuggestion: (id: string, suggestionId: string) =>
    api.post<void>(`${doc(id)}/suggestions/${enc(suggestionId)}/dismiss`),
};

export const directoryApi = {
  search: (q: string, signal?: AbortSignal) => api.get<UserSummary[]>('/users/directory', { query: { q }, signal }),
};
