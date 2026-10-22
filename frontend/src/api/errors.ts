export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors?: Record<string, string>;
}

/** RFC 7807 problem translated into an Error. */
export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string | undefined;
  readonly errors: Record<string, string>;
  readonly requestId: string | undefined;

  constructor(status: number, problem: ProblemDetail = {}) {
    const title = problem.title ?? defaultTitle(status);
    super(problem.detail ?? title);
    this.name = 'ApiError';
    this.status = status;
    this.title = title;
    this.detail = problem.detail;
    this.errors = problem.errors ?? {};
    this.requestId = problem.requestId;
  }

  /** Best human-readable message. */
  get userMessage(): string {
    return this.detail || this.title;
  }

  get isCsrfFailure(): boolean {
    return this.status === 403 && /csrf/i.test(`${this.title} ${this.detail ?? ''}`);
  }

  get isPasswordChangeRequired(): boolean {
    return this.status === 403 && this.title === 'Password change required';
  }
}

function defaultTitle(status: number): string {
  switch (status) {
    case 0:
      return 'Network error';
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not Found';
    case 409:
      return 'Conflict';
    case 413:
      return 'Payload Too Large';
    case 415:
      return 'Unsupported Media Type';
    case 429:
      return 'Too Many Requests';
    default:
      return status >= 500 ? 'Server error' : 'Request failed';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Narrows an unknown JSON payload into a ProblemDetail. */
export function toProblem(value: unknown): ProblemDetail {
  if (!isRecord(value)) return {};
  const problem: ProblemDetail = {};
  if (typeof value.type === 'string') problem.type = value.type;
  if (typeof value.title === 'string') problem.title = value.title;
  if (typeof value.status === 'number') problem.status = value.status;
  if (typeof value.detail === 'string') problem.detail = value.detail;
  if (typeof value.instance === 'string') problem.instance = value.instance;
  if (typeof value.requestId === 'string') problem.requestId = value.requestId;
  if (isRecord(value.errors)) {
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(value.errors)) {
      if (typeof v === 'string') errors[k] = v;
      else if (Array.isArray(v)) errors[k] = v.filter((x): x is string => typeof x === 'string').join(', ');
    }
    problem.errors = errors;
  }
  return problem;
}

export function parseProblemText(status: number, text: string): ApiError {
  if (text) {
    try {
      return new ApiError(status, toProblem(JSON.parse(text) as unknown));
    } catch {
      // not JSON
    }
  }
  return new ApiError(status);
}

export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiError) return error.userMessage;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
