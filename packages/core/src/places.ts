export type PlaceVisibility = 'public' | 'invite_only' | 'private';

export const visibilityOptions: ReadonlyArray<{ value: PlaceVisibility; label: string; description: string }> = [
  { value: 'public', label: 'Public', description: 'Listed in Discover. Anyone with an account can join.' },
  { value: 'invite_only', label: 'Invite only', description: 'Listed in Discover, but joining needs an invite.' },
  { value: 'private', label: 'Private', description: 'Hidden from Discover. Only people you invite can find it.' },
];

/** A place address (slug) the server will accept: 3-32 lowercase letters, numbers or dashes, not starting or ending with a dash. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/** A starting address from a place name, so most people never type one. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
}

export interface InviteLike {
  uses: number;
  max_uses: number | null;
  expires_at: string | null;
}

/** "3 of 10 uses", "12 uses", "unused". */
export function describeInviteUses(invite: Pick<InviteLike, 'uses' | 'max_uses'>): string {
  if (invite.max_uses) return `${invite.uses} of ${invite.max_uses} uses`;
  if (invite.uses === 0) return 'unused';
  return `${invite.uses} ${invite.uses === 1 ? 'use' : 'uses'}`;
}

/** "never expires", "expires tomorrow", "expires in 6 days", "expired". */
export function describeInviteExpiry(expiresAt: string | null, now: number = Date.now()): string {
  if (!expiresAt) return 'never expires';
  const ms = Date.parse(expiresAt) - now;
  if (ms <= 0) return 'expired';
  const hours = ms / 3_600_000;
  if (hours < 1) return 'expires in under an hour';
  if (hours < 24) return `expires in ${Math.floor(hours)} ${Math.floor(hours) === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'expires tomorrow' : `expires in ${days} days`;
}

export interface InviteLinkParts {
  code: string;
  /** The instance the invite belongs to, e.g. `https://forum.example`. */
  instanceOrigin: string;
  /** Origin of a hosted web client (`https://app.example`); without one the link uses the `gotalk://` scheme. */
  webClientOrigin?: string | null;
}

/** A shareable invite link. The instance rides along so it works for someone who has not added it yet. */
export function buildInviteLink({ code, instanceOrigin, webClientOrigin }: InviteLinkParts): string {
  const query = `instance=${encodeURIComponent(instanceOrigin)}`;
  const base = webClientOrigin ? webClientOrigin.replace(/\/+$/, '') + '/invite/' : 'gotalk://invite/';
  return `${base}${encodeURIComponent(code)}?${query}`;
}

/** Whether a string looks like an invite code (the server issues 10 base62 characters). */
export function isInviteCode(code: string): boolean {
  return /^[A-Za-z0-9]{6,32}$/.test(code);
}
