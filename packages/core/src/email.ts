import { ApiError } from '@gotalk/api-client';

/** The server sends nothing to an account that asked less than a minute ago, so Resend waits this long. */
export const RESEND_WAIT_SECONDS = 60;

/** Whole seconds until Resend is allowed again; 0 when it is. */
export function resendSecondsLeft(sentAt: number | null | undefined, now: number = Date.now(), wait = RESEND_WAIT_SECONDS): number {
  if (sentAt == null) return 0;
  return Math.max(0, Math.ceil((sentAt + wait * 1000 - now) / 1000));
}

export type EmailFlowFailure =
  | { kind: 'already_verified' }
  | { kind: 'cooldown'; retryAfter: number }
  | { kind: 'email_unavailable'; message: string }
  | { kind: 'rate_limited'; retryAfter: number }
  | { kind: 'invalid'; message: string }
  | { kind: 'network' }
  | { kind: 'other'; message: string };

/**
 * Sorts a failed password-reset request or verification resend. `409` means already confirmed or
 * asked within the last minute, `503` means the instance cannot send email, `429` is rate limiting.
 */
export function classifyEmailFailure(e: unknown): EmailFlowFailure {
  if (e instanceof ApiError) {
    if (e.status === 409) return /already verified/i.test(e.message) ? { kind: 'already_verified' } : { kind: 'cooldown', retryAfter: RESEND_WAIT_SECONDS };
    if (e.status === 503) return { kind: 'email_unavailable', message: e.message };
    if (e.status === 429) return { kind: 'rate_limited', retryAfter: e.retryAfter ?? 30 };
    if (e.status === 422 || e.status === 400) return { kind: 'invalid', message: e.message };
    return { kind: 'other', message: e.message };
  }
  if (e instanceof TypeError || (e instanceof Error && /network request failed/i.test(e.message))) return { kind: 'network' };
  return { kind: 'other', message: 'Something went wrong. Try again.' };
}

/** "If an account uses that address, we've sent a link": the answer never says whether one exists. */
export function passwordResetSentCopy(email: string): string {
  return `If an account uses ${email.trim()}, we've sent it a link to choose a new password. Open the link, choose a new password, then come back and sign in.`;
}
