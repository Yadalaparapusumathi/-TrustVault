import { readCookie } from '@/lib/cookies';
import { parseContentDispositionFilename, sanitizeFilename } from '@/lib/contentDisposition';
import { ApiError, parseProblemText } from './errors';

export { ApiError } from './errors';

const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'X-XSRF-TOKEN';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

/** Hooks installed by the AuthProvider so the client can react to auth failures with the router. */
export interface AuthHandlers {
  onUnauthorized: () => void;
  onPasswordChangeRequired: () => void;
}

let handlers: AuthHandlers = {
  onUnauthorized: () => {
    if (!window.location.pathname.startsWith('/login')) window.location.assign('/login');
  },
  onPasswordChangeRequired: () => {
    if (window.location.pathname !== '/change-password') window.location.assign('/change-password');
  },
};

export function setAuthHandlers(next: AuthHandlers): void {
  handlers = next;
}

export function buildUrl(path: string, query?: QueryParams): string {
  const url = path.startsWith('/api/') ? path : `/api${path.startsWith('/') ? '' : '/'}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

let csrfPromise: Promise<void> | null = null;

/** GET /api/auth/csrf — (re)obtains the XSRF-TOKEN cookie. Concurrent callers share one request. */
export function fetchCsrf(): Promise<void> {
  if (!csrfPromise) {
    csrfPromise = fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' })
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

async function ensureCsrfCookie(): Promise<void> {
  if (!readCookie(CSRF_COOKIE)) await fetchCsrf();
}

function csrfHeaders(): Record<string, string> {
  const token = readCookie(CSRF_COOKIE);
  return token ? { [CSRF_HEADER]: token } : {};
}

export interface RequestOptions {
  query?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
  /** Do not trigger the global 401 redirect (used by /auth/me probe and /auth/login). */
  skipAuthRedirect?: boolean;
}

function isLoginPath(url: string): boolean {
  return url.startsWith('/api/auth/login');
}

/** Applies global side-effects for auth-related failures. */
function handleGlobalError(error: ApiError, url: string, skipAuthRedirect: boolean): void {
  if (error.status === 401 && !skipAuthRedirect && !isLoginPath(url)) {
    handlers.onUnauthorized();
  } else if (error.isPasswordChangeRequired) {
    handlers.onPasswordChangeRequired();
  }
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  let text = '';
  try {
    text = await response.text();
  } catch {
    // ignore body read failures
  }
  return parseProblemText(response.status, text);
}

async function send(method: Method, url: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json, application/problem+json' };
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  if (MUTATING.has(method)) {
    await ensureCsrfCookie();
    Object.assign(headers, csrfHeaders());
  }
  try {
    return await fetch(url, {
      method,
      headers,
      body,
      credentials: 'same-origin',
      signal: options.signal,
      cache: 'no-store',
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, { detail: 'Unable to reach the server. Check your connection and try again.' });
  }
}

/** Sends a request and returns the raw successful Response (with CSRF retry + global error handling). */
async function execute(method: Method, path: string, options: RequestOptions = {}): Promise<Response> {
  const url = buildUrl(path, options.query);
  let response = await send(method, url, options);
  if (!response.ok) {
    let error = await errorFromResponse(response);
    if (MUTATING.has(method) && error.isCsrfFailure) {
      await fetchCsrf();
      response = await send(method, url, options);
      if (response.ok) return response;
      error = await errorFromResponse(response);
    }
    handleGlobalError(error, url, options.skipAuthRedirect ?? false);
    throw error;
  }
  return response;
}

export async function request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
  const response = await execute(method, path, options);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, { ...options, body }),
  delete: <T = void>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
};

/**
 * Downloads a file via fetch -> Blob -> object URL -> temporary <a download>.
 * Never navigates to API URLs (no window.open), so cookies/CSRF/CSP stay intact.
 */
export async function downloadFile(path: string, options: { query?: QueryParams; fallbackFilename?: string } = {}): Promise<string> {
  const response = await execute('GET', path, { query: options.query });
  const blob = await response.blob();
  const filename =
    parseContentDispositionFilename(response.headers.get('Content-Disposition')) ||
    (options.fallbackFilename ? sanitizeFilename(options.fallbackFilename) : '') ||
    'download';
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Give the browser a tick to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
  return filename;
}

export interface UploadOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

function xhrUpload(url: string, form: FormData, options: UploadOptions): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json, application/problem+json');
    for (const [k, v] of Object.entries(csrfHeaders())) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && options.onProgress) options.onProgress(event.loaded / event.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () =>
      reject(new ApiError(0, { detail: 'Upload failed: unable to reach the server.' }));
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
    if (options.signal) {
      if (options.signal.aborted) {
        reject(new DOMException('Upload aborted', 'AbortError'));
        return;
      }
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });
}

/** Multipart upload with progress via XMLHttpRequest (fetch has no upload progress). */
export async function uploadMultipart<T>(path: string, form: FormData, options: UploadOptions = {}): Promise<T> {
  const url = buildUrl(path);
  await ensureCsrfCookie();
  let result = await xhrUpload(url, form, options);
  if (result.status < 200 || result.status >= 300) {
    let error = parseProblemText(result.status, result.text);
    if (error.isCsrfFailure) {
      await fetchCsrf();
      options.onProgress?.(0);
      result = await xhrUpload(url, form, options);
      if (result.status >= 200 && result.status < 300) return parseJson<T>(result.text);
      error = parseProblemText(result.status, result.text);
    }
    handleGlobalError(error, url, false);
    throw error;
  }
  return parseJson<T>(result.text);
}

function parseJson<T>(text: string): T {
  return (text ? JSON.parse(text) : undefined) as T;
}
