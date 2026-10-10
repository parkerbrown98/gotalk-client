import type { components } from './schema.ts';

type ProblemDetails = components['schemas']['ErrorModel'];

/** Error thrown by {@link unwrap} carrying the server's RFC 9457 problem details. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: Partial<ProblemDetails> | undefined;
  /** Seconds to wait before retrying, from `Retry-After` (sent with 429 and 503). */
  readonly retryAfter: number | undefined;

  constructor(status: number, problem?: Partial<ProblemDetails>, retryAfter?: number) {
    super(problem?.detail || problem?.title || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
    this.retryAfter = retryAfter;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** The instance refused the `Gotalk-Api-Version` header this client sends. */
  get isVersionMismatch(): boolean {
    return this.status === 400 && /API version .* is not supported/i.test(this.message);
  }

  /** Detail messages the server attached to individual body fields, keyed by field name. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of this.problem?.errors ?? []) {
      const field = e.location?.replace(/^body\./, '');
      if (field && e.message && !(field in out)) out[field] = e.message;
    }
    return out;
  }
}

function parseRetryAfter(response: Response): number | undefined {
  const raw = response.headers.get('Retry-After');
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const at = Date.parse(raw);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/** Converts an openapi-fetch result into its data, throwing {@link ApiError} on failure. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.error !== undefined || !result.response.ok) {
    const problem = typeof result.error === 'object' && result.error !== null ? (result.error as Partial<ProblemDetails>) : undefined;
    throw new ApiError(result.response.status, problem, parseRetryAfter(result.response));
  }
  return result.data as T;
}
