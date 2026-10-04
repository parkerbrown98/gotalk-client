import { Notice } from '@gotalk/ui';

import type { FailureKind } from '@/lib/failure';

export interface FailureNoticeProps {
  failure: FailureKind | null;
  /** Seconds left of a rate-limit wait. */
  cooldown?: number;
  rateLimitTitle?: string;
  /** For "Could not reach {host}". */
  host: string;
  /** Skip server rejections, for screens that map them onto fields or their own copy. */
  hideRejected?: boolean;
}

/** The first-class failure states every account form shares: throttled, version mismatch, offline, unexpected. */
export function FailureNotice({ failure, cooldown = 0, rateLimitTitle = 'Too many attempts.', host, hideRejected }: FailureNoticeProps) {
  if (!failure) return null;
  switch (failure.kind) {
    case 'rate_limited':
      return (
        <Notice tone="danger" icon="clock" title={rateLimitTitle}>
          {cooldown > 0 ? `You can try again in ${cooldown} seconds.` : 'You can try again now.'}
        </Notice>
      );
    case 'version':
      return (
        <Notice tone="danger" title="This instance changed and needs a newer app.">
          It does not serve the API version this app speaks. Update Gotalk, then try again.
        </Notice>
      );
    case 'network':
      return (
        <Notice tone="danger" title={`Could not reach ${host}.`}>
          Check your connection and try again.
        </Notice>
      );
    case 'rejected':
      return hideRejected ? null : <Notice tone="danger">{failure.message}</Notice>;
    case 'unknown':
      return <Notice tone="danger">Something went wrong. Try again.</Notice>;
  }
}
