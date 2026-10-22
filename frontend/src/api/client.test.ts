import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, buildUrl } from './client';
import { documentsApi } from './documents';

function jsonResponse(status: number, body: unknown, contentType = 'application/json'): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });
}

function headerOf(init: RequestInit | undefined, name: string): string | undefined {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return headers[name];
}

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    document.cookie = 'XSRF-TOKEN=token-1; path=/';
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it('builds /api URLs and drops empty query values', () => {
    expect(buildUrl('/documents', { q: 'a b', owner: '', page: 0, x: undefined })).toBe('/api/documents?q=a+b&page=0');
  });

  it('generates suggestions with POST, no body and the CSRF header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, []));
    await expect(documentsApi.generateSuggestions('doc-1')).resolves.toEqual([]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/documents/doc-1/suggestions');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeUndefined();
    expect(init?.credentials).toBe('same-origin');
    expect(headerOf(init, 'X-XSRF-TOKEN')).toBe('token-1');
  });

  it('does not send the CSRF header on GET', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await api.get('/documents/categories');
    expect(headerOf(fetchMock.mock.calls[0]?.[1], 'X-XSRF-TOKEN')).toBeUndefined();
  });

  it('refreshes the CSRF token and retries once on a CSRF 403', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(403, { title: 'Invalid CSRF token', status: 403 }, 'application/problem+json'))
      .mockImplementationOnce(() => {
        document.cookie = 'XSRF-TOKEN=token-2; path=/';
        return Promise.resolve(new Response(null, { status: 204 }));
      })
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await api.post('/documents/d/restore');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/csrf');
    expect(headerOf(fetchMock.mock.calls[2]?.[1], 'X-XSRF-TOKEN')).toBe('token-2');
  });

  it('parses problem+json into ApiError', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { title: 'Validation failed', status: 400, detail: 'name: must not be blank', errors: { name: 'must not be blank' } }, 'application/problem+json'),
    );
    const error = await api.patch('/documents/d', { name: '' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.userMessage).toBe('name: must not be blank');
    expect(apiError.errors).toEqual({ name: 'must not be blank' });
  });
});
