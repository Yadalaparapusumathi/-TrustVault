import { keepPreviousData, skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { directoryApi, documentsApi } from '@/api/documents';
import { queryKeys } from '@/api/queryKeys';
import type {
  CreateGrantRequest,
  DocumentDetail,
  DocumentSearchParams,
  Grant,
  Suggestion,
  UpdateDocumentRequest,
  UploadDocumentRequest,
} from '@/api/types';
import { notifyError } from '@/lib/notify';

// ---- Queries -----------------------------------------------------------------

export function useDocuments(params: DocumentSearchParams) {
  return useQuery({
    queryKey: queryKeys.documents.list(params),
    queryFn: ({ signal }) => documentsApi.search(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.documents.categories(),
    queryFn: ({ signal }) => documentsApi.categories(signal),
    staleTime: 60_000,
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: queryKeys.documents.detail(id),
    queryFn: ({ signal }) => documentsApi.get(id, signal),
  });
}

export function useVersions(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.documents.versions(id),
    queryFn: ({ signal }) => documentsApi.versions(id, signal),
    enabled,
  });
}

export function useGrants(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.documents.grants(id),
    queryFn: ({ signal }) => documentsApi.grants(id, signal),
    enabled,
  });
}

export function useActivity(id: string, page: number, size = 20, enabled = true) {
  return useQuery({
    queryKey: queryKeys.documents.activity(id, page, size),
    queryFn: ({ signal }) => documentsApi.activity(id, page, size, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/**
 * Suggestions are generated (and audited) on demand only via POST — never fetched automatically.
 * The result lives in the query cache (read with `skipToken`) so grant/dismiss can update it and
 * cache invalidations never silently re-generate suggestions.
 */
export function useSuggestions(id: string) {
  const qc = useQueryClient();
  const key = queryKeys.documents.suggestions(id);
  const cached = useQuery<Suggestion[]>({ queryKey: key, queryFn: skipToken, staleTime: Infinity });
  const generate = useMutation({
    mutationFn: () => documentsApi.generateSuggestions(id),
    onSuccess: (data) => qc.setQueryData<Suggestion[]>(key, data),
  });
  const requested = cached.data !== undefined || !generate.isIdle;
  return {
    data: cached.data,
    requested,
    isFetching: generate.isPending,
    isError: generate.isError,
    error: generate.error,
    request: () => generate.mutate(),
  };
}

export function useDirectorySearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: queryKeys.directory(term),
    queryFn: ({ signal }) => directoryApi.search(term, signal),
    enabled: term.length >= 1,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

// ---- Mutations ---------------------------------------------------------------

function useInvalidateDocument() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: queryKeys.documents.lists() });
    void qc.invalidateQueries({ queryKey: queryKeys.documents.categories() });
    if (id) void qc.invalidateQueries({ queryKey: queryKeys.documents.detail(id) });
  };
}

export function useUploadDocument() {
  const invalidate = useInvalidateDocument();
  const [progress, setProgress] = useState(0);
  const mutation = useMutation({
    mutationFn: ({ req, signal }: { req: UploadDocumentRequest; signal?: AbortSignal }) =>
      documentsApi.upload(req, { onProgress: setProgress, signal }),
    onMutate: () => setProgress(0),
    onSuccess: (doc) => {
      invalidate();
      toast.success(`“${doc.name}” uploaded`);
    },
  });
  return { ...mutation, progress };
}

export function useUploadVersion(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateDocument();
  const [progress, setProgress] = useState(0);
  const mutation = useMutation({
    mutationFn: ({ file, signal }: { file: File; signal?: AbortSignal }) =>
      documentsApi.uploadVersion(id, file, { onProgress: setProgress, signal }),
    onMutate: () => setProgress(0),
    onSuccess: (doc) => {
      qc.setQueryData(queryKeys.documents.detail(id), doc);
      invalidate(id);
      void qc.invalidateQueries({ queryKey: queryKeys.documents.versions(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.documents.activityAll(id) });
      toast.success(`Version ${doc.currentVersion} uploaded`);
    },
  });
  return { ...mutation, progress };
}

export function useUpdateDocument(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateDocument();
  return useMutation({
    mutationFn: (body: UpdateDocumentRequest) => documentsApi.update(id, body),
    onSuccess: (doc) => {
      qc.setQueryData<DocumentDetail>(queryKeys.documents.detail(id), doc);
      invalidate();
      void qc.invalidateQueries({ queryKey: queryKeys.documents.activityAll(id) });
      toast.success('Document details saved');
    },
  });
}

export function useTrashDocument() {
  const qc = useQueryClient();
  const invalidate = useInvalidateDocument();
  return useMutation({
    mutationFn: (doc: { id: string; name: string }) => documentsApi.trash(doc.id),
    onSuccess: (_d, doc) => {
      qc.removeQueries({ queryKey: queryKeys.documents.detail(doc.id) });
      invalidate();
      toast.success(`“${doc.name}” moved to trash`, { description: 'It will be purged automatically after 30 days.' });
    },
    onError: (e) => notifyError(e),
  });
}

export function useRestoreDocument() {
  const invalidate = useInvalidateDocument();
  return useMutation({
    mutationFn: (doc: { id: string; name: string }) => documentsApi.restore(doc.id),
    onSuccess: (_d, doc) => {
      invalidate(doc.id);
      toast.success(`“${doc.name}” restored`);
    },
    onError: (e) => notifyError(e),
  });
}

export function usePurgeDocument() {
  const qc = useQueryClient();
  const invalidate = useInvalidateDocument();
  return useMutation({
    mutationFn: (doc: { id: string; name: string }) => documentsApi.purge(doc.id),
    onSuccess: (_d, doc) => {
      qc.removeQueries({ queryKey: queryKeys.documents.detail(doc.id) });
      invalidate();
      toast.success(`“${doc.name}” permanently deleted`);
    },
    onError: (e) => notifyError(e),
  });
}

export function useCreateGrant(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGrantRequest) => documentsApi.createGrant(id, body),
    onSuccess: (grant, body) => {
      void qc.invalidateQueries({ queryKey: queryKeys.documents.grants(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.documents.activityAll(id) });
      if (body.suggestionId) {
        qc.setQueryData<Suggestion[]>(queryKeys.documents.suggestions(id), (prev) =>
          prev?.filter((s) => s.id !== body.suggestionId),
        );
      }
      toast.success(`${grant.grantee.displayName} now has ${grant.permission} access`);
    },
  });
}

export function useRevokeGrant(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (grant: Grant) => documentsApi.revokeGrant(id, grant.id),
    onSuccess: (_d, grant) => {
      qc.setQueryData<Grant[]>(queryKeys.documents.grants(id), (prev) => prev?.filter((g) => g.id !== grant.id));
      void qc.invalidateQueries({ queryKey: queryKeys.documents.grants(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.documents.activityAll(id) });
      toast.success(`Access revoked for ${grant.grantee.displayName}`);
    },
    onError: (e) => notifyError(e),
  });
}

export function useDismissSuggestion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (suggestion: Suggestion) => documentsApi.dismissSuggestion(id, suggestion.id),
    onSuccess: (_d, suggestion) => {
      qc.setQueryData<Suggestion[]>(queryKeys.documents.suggestions(id), (prev) => prev?.filter((s) => s.id !== suggestion.id));
      void qc.invalidateQueries({ queryKey: queryKeys.documents.activityAll(id) });
      toast.success('Suggestion dismissed');
    },
    onError: (e) => notifyError(e),
  });
}

/** Wraps a download call with a pending flag and error toast. */
export function useDownload() {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<string>) => {
    setPendingKey(key);
    try {
      await fn();
    } catch (e) {
      notifyError(e, 'Download failed');
    } finally {
      setPendingKey((k) => (k === key ? null : k));
    }
  };
  return { pendingKey, run };
}
