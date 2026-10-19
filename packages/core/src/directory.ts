import type { Schemas } from '@gotalk/api-client';

import type { PlaceVisibility } from './places.ts';

/**
 * Search engines and the public Gotalk directory. Nothing is indexed by default: an administrator lists the
 * instance, a place's owners allow it, and its public boards follow unless excluded. Each person can keep
 * their own posts out. The server decides; these helpers explain its rules in the settings.
 */

export type DirectoryStatus = Schemas['DirectoryStatus'];

/** How long removals take to reach the index, as the server promises it. */
export const INDEX_REMOVAL_TIME = 'within an hour';

/**
 * Why a place can't allow search engines, or null when it can. The server ignores `indexable` for these
 * places and refuses to turn it on for an NSFW one.
 */
export function placeIndexBlock(place: { visibility: PlaceVisibility; is_nsfw: boolean }): string | null {
  if (place.is_nsfw) return 'Places marked NSFW are never shown in search engines.';
  if (place.visibility === 'private') return 'Private places are never shown in search engines. Make the place public to allow it.';
  if (place.visibility === 'invite_only') return 'Invite-only places are never shown in search engines. Make the place public to allow it.';
  return null;
}

/** Why a board's search setting can't change, or null when it can. NSFW boards are always excluded. */
export function boardIndexBlock(board: { is_nsfw: boolean }): string | null {
  return board.is_nsfw ? 'Forums marked NSFW are never shown in search engines.' : null;
}

export type IndexTone = 'neutral' | 'info' | 'success' | 'warning';

export interface IndexState {
  label: string;
  tone: IndexTone;
  /** One sentence on why, when it isn't obvious from the label. */
  detail?: string;
}

/**
 * Where a place stands, for its settings. `listed` is the instance's directory listing from `GET /instance`
 * (undefined while unknown).
 */
export function placeIndexState(
  place: { visibility: PlaceVisibility; is_nsfw: boolean; indexable: boolean; indexed: boolean },
  listed: boolean | undefined,
): IndexState {
  if (place.indexed) return { label: 'In search engines', tone: 'success' };
  if (placeIndexBlock(place)) return { label: 'Not in search engines', tone: 'neutral' };
  if (!place.indexable) return { label: 'Not in search engines', tone: 'neutral' };
  if (listed === false) {
    return {
      label: 'Waiting for the instance',
      tone: 'warning',
      detail: "This instance isn't listed in the public directory, so nothing is indexed until an administrator turns listing on.",
    };
  }
  return { label: 'Allowed', tone: 'info' };
}

/** Where a board stands, for its settings. `placeIndexed` is whether its place is in the index right now. */
export function boardIndexState(board: { is_nsfw: boolean; is_public: boolean; indexable: boolean; indexed: boolean }, placeIndexed: boolean): IndexState {
  if (board.indexed) return { label: 'In search engines', tone: 'success' };
  if (board.is_nsfw) return { label: 'Not in search engines', tone: 'neutral' };
  if (!board.indexable) return { label: 'Excluded', tone: 'neutral' };
  if (!board.is_public) return { label: 'Not in search engines', tone: 'neutral', detail: "Signed-out visitors can't read this forum, so it isn't indexed." };
  if (!placeIndexed) return { label: 'Not in search engines', tone: 'neutral', detail: 'Forums are indexed only while their place appears in search engines.' };
  return { label: 'Not in search engines', tone: 'neutral' };
}

/** Whether to show a member the one-time "this place is public" notice. */
export function shouldShowIndexNotice(place: { id: string; indexed: boolean } | undefined, isMember: boolean, dismissed: readonly string[] | undefined): boolean {
  return !!place && place.indexed && isMember && !(dismissed ?? []).includes(place.id);
}

// ---- The index's view of an instance ----

/** `GET {platform}/api/index/v1/instances?origin=…`. The index runs separately, so every field is checked. */
export interface PlatformInstanceView {
  status: PlatformStatus;
  listedSince: string | null;
  placesIndexed: number | null;
  topicsIndexed: number | null;
  lastCrawlAt: string | null;
}

export type PlatformStatus = 'pending' | 'listed' | 'stale' | 'suspended' | 'blocked' | 'removed';

export interface PlatformStatusLabel {
  label: string;
  tone: IndexTone | 'danger';
  detail: string;
}

const PLATFORM_STATUS: Record<PlatformStatus, PlatformStatusLabel> = {
  pending: { label: 'Pending', tone: 'info', detail: 'Verified and being crawled. Pages stay out of search engines until the instance passes the quality checks.' },
  listed: { label: 'Listed', tone: 'success', detail: 'Public places appear in search engines and the directory.' },
  stale: { label: 'Unreachable', tone: 'warning', detail: "The index hasn't reached this instance for 7 days. Its pages are hidden until it answers again." },
  suspended: { label: 'Suspended', tone: 'danger', detail: 'The index operators suspended this instance. Contact them to appeal.' },
  blocked: { label: 'Blocked', tone: 'danger', detail: 'This address is on the index blocklist.' },
  removed: { label: 'Removed', tone: 'neutral', detail: 'Listing was turned off, or the instance was unreachable for 30 days. Turning listing on registers it again.' },
};

export function platformStatusLabel(status: PlatformStatus): PlatformStatusLabel {
  return PLATFORM_STATUS[status];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Reads the index's answer; null when it isn't one. */
export function parsePlatformInstance(body: unknown): PlatformInstanceView | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.status !== 'string' || !(b.status in PLATFORM_STATUS)) return null;
  return {
    status: b.status as PlatformStatus,
    listedSince: str(b.listed_since),
    placesIndexed: num(b.places_indexed),
    topicsIndexed: num(b.topics_indexed),
    lastCrawlAt: str(b.last_crawl_at),
  };
}

export type PlatformLookup = { kind: 'found'; view: PlatformInstanceView } | { kind: 'unregistered' } | { kind: 'unreachable' };

/** Asks the index how it sees this instance. A 404 means it hasn't registered yet; any other failure is quiet. */
export async function lookUpPlatformInstance(statusUrl: string, fetchImpl: typeof fetch = fetch): Promise<PlatformLookup> {
  try {
    const res = await fetchImpl(statusUrl, { headers: { Accept: 'application/json' } });
    if (res.status === 404) return { kind: 'unregistered' };
    if (!res.ok) return { kind: 'unreachable' };
    const view = parsePlatformInstance(await res.json());
    return view ? { kind: 'found', view } : { kind: 'unreachable' };
  } catch {
    return { kind: 'unreachable' };
  }
}

/** Suggested policy sections, in the order the policies screen lists them, skipping empty ones. */
export function suggestedPolicyText(policyText: Record<string, string> | null | undefined): { kind: 'terms' | 'privacy' | 'guidelines'; text: string }[] {
  const out: { kind: 'terms' | 'privacy' | 'guidelines'; text: string }[] = [];
  for (const kind of ['terms', 'privacy', 'guidelines'] as const) {
    const text = policyText?.[kind]?.trim();
    if (text) out.push({ kind, text });
  }
  return out;
}

/** A published key shortened for display: the first and last 6 characters. */
export function shortKey(key: string): string {
  return key.length > 16 ? `${key.slice(0, 6)}…${key.slice(-6)}` : key;
}

/** One line for an instance-wide audit entry about the directory, or null for other actions. */
export function describeDirectoryAudit(entry: { action: string; metadata?: Record<string, unknown> | null }): string | null {
  const meta = entry.metadata ?? {};
  switch (entry.action) {
    case 'directory.update':
      return meta.listed === true ? 'Saved the directory settings with listing on' : meta.listed === false ? 'Saved the directory settings with listing off' : 'Saved the directory settings';
    case 'directory.reset':
      return 'Reset the directory settings to the configuration';
    case 'directory.key_rotate':
      return 'Rotated the signing key';
    case 'directory.key_revoke':
      return 'Stopped publishing the previous key';
    case 'user.index_exclusion':
      return meta.exclude === false ? 'Someone included their posts in search results again' : 'Someone kept their posts out of search results';
    default:
      return null;
  }
}
