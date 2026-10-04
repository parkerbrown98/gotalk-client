import { ApiError } from '@gotalk/api-client';

export type FailureKind =
  | { kind: 'rate_limited'; retryAfter: number }
  | { kind: 'version' }
  | { kind: 'network' }
  | { kind: 'rejected'; status: number; message: string; fields: Record<string, string> }
  | { kind: 'unknown' };

/** Sorts a failed request into the states the account screens treat as first-class. */
export function classifyFailure(e: unknown): FailureKind {
  if (e instanceof ApiError) {
    if (e.isRateLimited) return { kind: 'rate_limited', retryAfter: e.retryAfter ?? 30 };
    if (e.isVersionMismatch) return { kind: 'version' };
    return { kind: 'rejected', status: e.status, message: e.message, fields: e.fieldErrors };
  }
  // fetch rejects with TypeError when the instance cannot be reached; React Native words it differently.
  if (e instanceof TypeError || (e instanceof Error && /network request failed/i.test(e.message))) return { kind: 'network' };
  return { kind: 'unknown' };
}

/** Which form field a server message is about, when the server did not say. */
export function fieldFor(message: string): 'invite_code' | 'username' | 'email' | 'password' | undefined {
  if (/invite/i.test(message)) return 'invite_code';
  if (/username/i.test(message)) return 'username';
  if (/email/i.test(message)) return 'email';
  if (/password/i.test(message)) return 'password';
  return undefined;
}
