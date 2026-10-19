import { isInviteCode, isValidSlug } from './places.ts';

/**
 * Links that open a place, a topic or an invite on a given instance. Like invite links, they carry the
 * instance so they work for someone who has not added it yet; the public index's "Open in Gotalk" button
 * uses them.
 *
 * | Target | Web | App and desktop |
 * |---|---|---|
 * | Invite | `https://<web client>/invite/<code>?instance=<origin>` | `gotalk://invite/<code>?instance=<origin>` |
 * | Place | `https://<web client>/places/<slug>?instance=<origin>` | `gotalk://places/<slug>?instance=<origin>` |
 * | Topic | `https://<web client>/topics/<id>?instance=<origin>` | `gotalk://topics/<id>?instance=<origin>` |
 */

interface LinkTarget {
  /** The instance the target belongs to, e.g. `https://forum.example`. */
  instanceOrigin: string;
  /** Origin of a hosted web client (`https://app.gotalk.sh`); without one the link uses the `gotalk://` scheme. */
  webClientOrigin?: string | null;
}

export interface PlaceLinkParts extends LinkTarget {
  slug: string;
}

export interface TopicLinkParts extends LinkTarget {
  topicId: string;
}

export type GotalkLink =
  | { kind: 'invite'; code: string; instance: string }
  | { kind: 'place'; slug: string; instance: string }
  | { kind: 'topic'; topicId: string; instance: string };

const SEGMENTS = { invite: 'invite', place: 'places', topic: 'topics' } as const;

function buildLink(segment: string, id: string, { instanceOrigin, webClientOrigin }: LinkTarget): string {
  const base = webClientOrigin ? `${webClientOrigin.replace(/\/+$/, '')}/${segment}/` : `gotalk://${segment}/`;
  return `${base}${encodeURIComponent(id)}?instance=${encodeURIComponent(instanceOrigin.replace(/\/+$/, ''))}`;
}

/** A shareable link to a place, for the web client when one is given, otherwise for the apps. */
export function placeLink({ slug, ...target }: PlaceLinkParts): string {
  return buildLink(SEGMENTS.place, slug, target);
}

/** A shareable link to a topic, for the web client when one is given, otherwise for the apps. */
export function topicLink({ topicId, ...target }: TopicLinkParts): string {
  return buildLink(SEGMENTS.topic, topicId, target);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a string looks like a topic ID (the server issues UUIDs). */
export function isTopicId(id: string): boolean {
  return UUID.test(id);
}

const ORIGIN = /^(https?):\/\/((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*|\[[0-9a-f:.]+\])(:\d{1,5})?\/*$/i;

/**
 * The instance origin from a link's `instance` parameter: `http` or `https`, a host and an optional port,
 * lowercased, without trailing slashes. Anything else (other schemes, paths, credentials, garbage) is null.
 */
export function normalizeLinkOrigin(value: string | null | undefined): string | null {
  const m = ORIGIN.exec((value ?? '').trim());
  if (!m) return null;
  const port = m[3] ? Number(m[3].slice(1)) : null;
  if (port !== null && (port < 1 || port > 65535)) return null;
  return `${m[1]!.toLowerCase()}://${m[2]!.toLowerCase()}${m[3] ?? ''}`;
}

const URL_PARTS = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i;

function queryParam(query: string | undefined, name: string): string | null {
  for (const pair of (query ?? '').split('&')) {
    const eq = pair.indexOf('=');
    const key = eq < 0 ? pair : pair.slice(0, eq);
    if (key !== name) continue;
    try {
      return decodeURIComponent((eq < 0 ? '' : pair.slice(eq + 1)).replace(/\+/g, ' '));
    } catch {
      return null;
    }
  }
  return null;
}

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * Reads an invite, place or topic link in its web (`https://<web client>/places/<slug>?instance=…`) or app
 * (`gotalk://places/<slug>?instance=…`) form, or an app path (`/places/<slug>?instance=…`). Returns null for
 * anything else, including a missing or invalid instance and an invalid code, address or topic ID.
 */
export function parseGotalkLink(input: string): GotalkLink | null {
  const text = input.trim();
  let path: string;
  let query: string | undefined;
  const m = URL_PARTS.exec(text);
  if (m) {
    const scheme = m[1]!.toLowerCase();
    if (scheme === 'gotalk') {
      // gotalk://places/slug puts the target type where a host would be; gotalk:///places/slug does not.
      path = m[2] ? `/${m[2]}${m[3]}` : m[3]!;
    } else if (scheme === 'http' || scheme === 'https') {
      if (!normalizeLinkOrigin(`${scheme}://${m[2]}`)) return null;
      path = m[3]!;
    } else {
      return null;
    }
    query = m[4];
  } else if (text.startsWith('/')) {
    const q = text.indexOf('?');
    path = (q < 0 ? text : text.slice(0, q)).replace(/#.*$/, '');
    query = q < 0 ? undefined : text.slice(q + 1).replace(/#.*$/, '');
  } else {
    return null;
  }

  const parts = path.replace(/\/+$/, '').split('/');
  if (parts.length !== 3 || parts[0] !== '') return null;
  const instance = normalizeLinkOrigin(queryParam(query, 'instance'));
  const id = decode(parts[2]!);
  if (!instance || !id) return null;
  switch (parts[1]!.toLowerCase()) {
    case SEGMENTS.invite:
      return isInviteCode(id) ? { kind: 'invite', code: id, instance } : null;
    case SEGMENTS.place:
      return isValidSlug(id) ? { kind: 'place', slug: id, instance } : null;
    case SEGMENTS.topic:
      return isTopicId(id) ? { kind: 'topic', topicId: id.toLowerCase(), instance } : null;
    default:
      return null;
  }
}

/** The app route for a parsed link, e.g. `/places/rust-help?instance=https%3A%2F%2Fforum.example`. */
export function gotalkLinkPath(link: GotalkLink): string {
  const id = link.kind === 'invite' ? link.code : link.kind === 'place' ? link.slug : link.topicId;
  return `/${SEGMENTS[link.kind]}/${encodeURIComponent(id)}?instance=${encodeURIComponent(link.instance)}`;
}

/** What opening a place or topic link does, given what this device knows about the link's instance. */
export type LinkStep =
  /** The link has no usable instance. */
  | { kind: 'incomplete' }
  /** Signed in there: switch to it and open the place or topic. */
  | { kind: 'open'; instanceId: string }
  /** Saved but signed out: switch to it and read without an account. */
  | { kind: 'read'; instanceId: string }
  /** Not saved: look it up and offer to add it, sign in or create an account first. */
  | { kind: 'offer'; origin: string };

export function linkStep(
  origin: string | null | undefined,
  saved: readonly { id: string; origin: string }[],
  signedIn: (instanceId: string) => boolean,
): LinkStep {
  const normalized = normalizeLinkOrigin(origin);
  if (!normalized) return { kind: 'incomplete' };
  const instance = saved.find((i) => normalizeLinkOrigin(i.origin) === normalized);
  if (!instance) return { kind: 'offer', origin: normalized };
  return signedIn(instance.id) ? { kind: 'open', instanceId: instance.id } : { kind: 'read', instanceId: instance.id };
}
