import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CLASSIFICATIONS, type Classification, type DocumentScope, type DocumentSearchParams, type DocumentSortField, type SortDirection } from '@/api/types';

export const PAGE_SIZE = 20;
const SCOPES: DocumentScope[] = ['all', 'owned', 'shared', 'trash'];
const SORT_FIELDS: DocumentSortField[] = ['name', 'createdAt', 'updatedAt', 'sizeBytes'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface LibraryFilters {
  scope: DocumentScope;
  q: string;
  owner: string;
  category: string;
  classification: Classification | '';
  from: string;
  to: string;
  page: number;
  sortField: DocumentSortField;
  sortDir: SortDirection;
}

export type FilterKey = 'q' | 'owner' | 'category' | 'classification' | 'from' | 'to';
const FILTER_KEYS: FilterKey[] = ['q', 'owner', 'category', 'classification', 'from', 'to'];

/** Library state lives in the URL so it survives reloads and can be shared/bookmarked. */
export function useLibraryParams() {
  const [params, setParams] = useSearchParams();
  const latestParams = useRef(params);
  useLayoutEffect(() => {
    latestParams.current = params;
  }, [params]);

  const filters = useMemo<LibraryFilters>(() => {
    const scopeRaw = params.get('scope');
    const scope = (SCOPES as string[]).includes(scopeRaw ?? '') ? (scopeRaw as DocumentScope) : 'all';
    const cls = params.get('classification') ?? '';
    const [sf, sd] = (params.get('sort') ?? 'updatedAt,desc').split(',');
    const page = Number.parseInt(params.get('page') ?? '0', 10);
    const from = params.get('from') ?? '';
    const to = params.get('to') ?? '';
    return {
      scope,
      q: params.get('q') ?? '',
      owner: params.get('owner') ?? '',
      category: params.get('category') ?? '',
      classification: (CLASSIFICATIONS as readonly string[]).includes(cls) ? (cls as Classification) : '',
      from: DATE_RE.test(from) ? from : '',
      to: DATE_RE.test(to) ? to : '',
      page: Number.isFinite(page) && page >= 0 ? page : 0,
      sortField: (SORT_FIELDS as string[]).includes(sf ?? '') ? (sf as DocumentSortField) : 'updatedAt',
      sortDir: sd === 'asc' ? 'asc' : 'desc',
    };
  }, [params]);

  const update = useCallback(
    (changes: Record<string, string | number | null>, resetPage = true) => {
      // Router search-param updates are not queued like setState; merge simultaneous debounced edits.
      const next = new URLSearchParams(latestParams.current);
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === '' || (k === 'page' && v === 0) || (k === 'scope' && v === 'all') || (k === 'sort' && v === 'updatedAt,desc')) {
          next.delete(k);
        } else {
          next.set(k, String(v));
        }
      }
      if (resetPage && !('page' in changes)) next.delete('page');
      latestParams.current = next;
      setParams(next, { replace: true });
    },
    [setParams],
  );

  const setFilter = useCallback((key: FilterKey, value: string) => update({ [key]: value }), [update]);
  const clearFilters = useCallback(() => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null]))), [update]);
  const setScope = useCallback((scope: DocumentScope) => update({ scope }), [update]);
  const setPage = useCallback((page: number) => update({ page }, false), [update]);
  const setSort = useCallback((field: DocumentSortField, direction: SortDirection) => update({ sort: `${field},${direction}` }), [update]);
  const toggleSort = useCallback(
    (field: DocumentSortField) => {
      const dir: SortDirection =
        filters.sortField === field ? (filters.sortDir === 'asc' ? 'desc' : 'asc') : field === 'name' ? 'asc' : 'desc';
      update({ sort: `${field},${dir}` });
    },
    [filters.sortDir, filters.sortField, update],
  );

  const hasFilters = FILTER_KEYS.some((k) => filters[k] !== '');

  const apiParams = useMemo<DocumentSearchParams>(
    () => ({
      scope: filters.scope,
      q: filters.q.trim() || undefined,
      owner: filters.owner.trim() || undefined,
      category: filters.category || undefined,
      classification: filters.classification || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      page: filters.page,
      size: PAGE_SIZE,
      sort: `${filters.sortField},${filters.sortDir}`,
    }),
    [filters],
  );

  return { filters, apiParams, hasFilters, setFilter, clearFilters, setScope, setPage, toggleSort, setSort };
}
