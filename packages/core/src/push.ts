import type { Schemas } from '@gotalk/api-client';

/**
 * Push notifications through a Gotalk push gateway: the gateway's discovery and device endpoints, the payload an
 * instance encrypts to this device, what to show for it, where tapping it goes, and when a device's registration
 * needs work. Platform code (expo-notifications, the service worker, the iOS extension) builds on these.
 *
 * The protocol is the gateway's `docs/protocol.md`; the payload is its `docs/payload.md`.
 */

export type PushInfo = Schemas['PushInfo'];
export type PushPreferences = Schemas['PushPreferences'];
export type PushSubscriptionRecord = Schemas['PushSubscription'];
export type PushPlatform = 'ios' | 'android' | 'web';
export type PushMode = 'encrypted' | 'id_only';

// ---------------------------------------------------------------------------------------------------------
// Gateway client

export interface GatewayApp {
  id: string;
  name: string;
  platforms: {
    ios?: { bundle_id: string };
    android?: { package_name: string };
    web?: { vapid_public_key: string };
  };
  attestation_required?: boolean;
}

export interface GatewayDiscovery {
  software: string;
  name: string;
  version: string;
  api_versions: string[];
  platforms: string[];
  apps: GatewayApp[];
  limits?: { subscription_expiry_days?: number };
  terms_url?: string;
  privacy_url?: string;
}

export type DeviceRegistrationRequest =
  | { app_id: string; instance_origin: string; platform: 'ios'; token: string; apns_environment: 'production' | 'sandbox' }
  | { app_id: string; instance_origin: string; platform: 'android'; token: string }
  | { app_id: string; instance_origin: string; platform: 'web'; endpoint: string };

export interface DeviceRegistration {
  subscription_id: string;
  subscription_secret: string;
  expires_at: string;
}

export type DeviceUpdate = { token?: string; apns_environment?: 'production' | 'sandbox'; endpoint?: string };

/** A problem document from the gateway; branch on `code` (see the protocol's error table). */
export class PushGatewayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string,
    readonly retryAfter: number | null = null,
  ) {
    super(detail || code || `HTTP ${status}`);
    this.name = 'PushGatewayError';
  }
}

export interface PushGatewayClient {
  discover(): Promise<GatewayDiscovery>;
  register(request: DeviceRegistrationRequest): Promise<DeviceRegistration>;
  /** Extends the subscription, replacing the token or endpoint when given. */
  update(subscriptionId: string, secret: string, update?: DeviceUpdate): Promise<{ subscription_id: string; expires_at: string }>;
  /** Deletes the subscription. A `404` counts as done: unknown and already deleted look the same by design. */
  remove(subscriptionId: string, secret: string): Promise<void>;
}

/** The gateway's base URL without trailing slashes, or null when it is not an http(s) URL. */
export function normalizeGatewayUrl(url: string | null | undefined): string | null {
  const text = (url ?? '').trim().replace(/\/+$/, '');
  return /^https?:\/\/[^/?#\s]+(\/[^?#\s]*)?$/i.test(text) ? text : null;
}

export function createPushGatewayClient(options: { baseUrl: string; fetch?: typeof globalThis.fetch }): PushGatewayClient {
  const base = normalizeGatewayUrl(options.baseUrl);
  if (!base) throw new Error(`not a gateway URL: ${options.baseUrl}`);
  const doFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));

  async function call<T>(method: string, path: string, init: { body?: unknown; secret?: string } = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (init.secret) headers.Authorization = `Bearer ${init.secret}`;
    const res = await doFetch(`${base}${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const problem = (json ?? {}) as { code?: unknown; detail?: unknown; title?: unknown };
      const retry = Number(res.headers.get('Retry-After'));
      throw new PushGatewayError(
        res.status,
        typeof problem.code === 'string' ? problem.code : '',
        typeof problem.detail === 'string' ? problem.detail : typeof problem.title === 'string' ? problem.title : '',
        Number.isFinite(retry) && retry > 0 ? retry : null,
      );
    }
    return json as T;
  }

  return {
    discover: () => call<GatewayDiscovery>('GET', '/.well-known/gotalk-gateway'),
    register: (request) => call<DeviceRegistration>('POST', '/v1/devices', { body: request }),
    update: (id, secret, update = {}) => call('PUT', `/v1/devices/${encodeURIComponent(id)}`, { body: update, secret }),
    async remove(id, secret) {
      try {
        await call<void>('DELETE', `/v1/devices/${encodeURIComponent(id)}`, { secret });
      } catch (e) {
        if (e instanceof PushGatewayError && e.status === 404) return;
        throw e;
      }
    },
  };
}

/** What the running app is, to find it in a gateway's app registry. */
export interface PushAppIdentity {
  /** iOS bundle ID or Android package name. */
  nativeId?: string | null;
  /** Prefer this gateway app ID when several match (a custom build's own app). */
  preferredAppId?: string | null;
}

/**
 * The gateway app to register with. Native builds match their bundle ID or package name. Browsers need an app
 * that both the gateway and the instance list for the web, with the same VAPID key, since the instance gives
 * clients the key to subscribe with.
 */
export function pickGatewayApp(
  discovery: Pick<GatewayDiscovery, 'apps'>,
  platform: PushPlatform,
  identity: PushAppIdentity,
  instanceWebApps: readonly { app_id: string; vapid_public_key: string }[] = [],
): { appId: string; vapidPublicKey?: string } | null {
  const matches: { appId: string; vapidPublicKey?: string }[] = [];
  for (const app of discovery.apps ?? []) {
    if (platform === 'ios' && identity.nativeId && app.platforms.ios?.bundle_id === identity.nativeId) matches.push({ appId: app.id });
    if (platform === 'android' && identity.nativeId && app.platforms.android?.package_name === identity.nativeId) matches.push({ appId: app.id });
    if (platform === 'web' && app.platforms.web) {
      const key = app.platforms.web.vapid_public_key;
      if (instanceWebApps.some((w) => w.app_id === app.id && w.vapid_public_key === key)) matches.push({ appId: app.id, vapidPublicKey: key });
    }
  }
  return matches.find((m) => m.appId === identity.preferredAppId) ?? matches[0] ?? null;
}

// ---------------------------------------------------------------------------------------------------------
// What arrives

export const PUSH_PAYLOAD_VERSION = 1;

const TARGET_KEYS = ['place_id', 'board_id', 'topic_id', 'channel_id', 'conversation_id', 'message_id', 'post_id'] as const;
export type PushTargetKey = (typeof TARGET_KEYS)[number];
export type PushTarget = Partial<Record<PushTargetKey, string>>;

/** The decrypted plaintext of an `encrypted` push (payload.md, "Plaintext schema"). */
export interface PushPayload {
  v: number;
  instance: string;
  user_id: string;
  notification_id: string;
  type: string;
  title: string;
  body?: string;
  thread_id?: string;
  category?: string;
  badge?: number;
  created_at?: string;
  target?: PushTarget;
}

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * Reads a plaintext object. Null when it is not a v1 payload (a newer `v` included, so the caller shows the
 * fallback), when a required field is missing, or when IDs are not plain IDs. Unknown fields and target keys
 * are dropped.
 */
export function parsePushPayload(input: unknown): PushPayload | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  if (o.v !== PUSH_PAYLOAD_VERSION) return null;
  const instance = str(o.instance);
  const userId = str(o.user_id);
  const notificationId = str(o.notification_id);
  const type = str(o.type);
  const title = str(o.title);
  if (!instance || !/^https?:\/\//i.test(instance) || !userId || !notificationId || !ID.test(notificationId)) return null;
  // Web "ID only" pushes carry only v, instance, user_id and notification_id (payload.md); they show the generic text.
  const payload: PushPayload = { v: 1, instance: instance.replace(/\/+$/, ''), user_id: userId, notification_id: notificationId, type: type ?? 'notification', title: title ?? '' };
  const body = str(o.body);
  if (body) payload.body = body;
  const thread = str(o.thread_id);
  if (thread) payload.thread_id = thread;
  const category = str(o.category);
  if (category) payload.category = category;
  if (typeof o.badge === 'number' && Number.isInteger(o.badge) && o.badge >= 0) payload.badge = o.badge;
  const created = str(o.created_at);
  if (created) payload.created_at = created;
  if (o.target && typeof o.target === 'object') {
    const target: PushTarget = {};
    for (const key of TARGET_KEYS) {
      const v = str((o.target as Record<string, unknown>)[key]);
      if (v && ID.test(v)) target[key] = v;
    }
    if (Object.keys(target).length) payload.target = target;
  }
  return payload;
}

/** Parses decrypted bytes (UTF-8 JSON). */
export function decodePushPlaintext(bytes: Uint8Array): PushPayload | null {
  try {
    return parsePushPayload(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

/** What the gateway wrapped around the instance's payload. */
export type PushEnvelope =
  | { sub: string; mode: 'encrypted'; body: string }
  | { sub: string; mode: 'id_only'; instance: string; notificationId: string };

/** The FCM data message (`gt_v`, `gt_sub`, `gt_mode`, then `gt_body` or `gt_instance` and `gt_notification_id`). */
export function parseFcmEnvelope(data: Record<string, unknown> | null | undefined): PushEnvelope | null {
  if (!data || str(data.gt_v) !== '1') return null;
  return envelope(str(data.gt_sub), str(data.gt_mode), str(data.gt_body), str(data.gt_instance), str(data.gt_notification_id));
}

/** The APNs `gt` dictionary (`v`, `sub`, `mode`, then `body` or `instance` and `notification_id`). */
export function parseApnsEnvelope(gt: unknown): PushEnvelope | null {
  if (!gt || typeof gt !== 'object') return null;
  const o = gt as Record<string, unknown>;
  if (o.v !== 1 && o.v !== '1') return null;
  return envelope(str(o.sub), str(o.mode), str(o.body), str(o.instance), str(o.notification_id));
}

function envelope(sub?: string, mode?: string, body?: string, instance?: string, notificationId?: string): PushEnvelope | null {
  if (!sub) return null;
  if (mode === 'encrypted' && body) return { sub, mode, body };
  if (mode === 'id_only' && instance && notificationId) return { sub, mode, instance: instance.replace(/\/+$/, ''), notificationId };
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Categories and Android channels

export interface PushCategory {
  id: string;
  label: string;
  description: string;
  /** Android channel importance: how loudly the category interrupts. */
  importance: 'high' | 'default' | 'low';
}

/** The server's categories, in the order settings show them. Pushes outside these use `other`. */
export const PUSH_CATEGORIES: readonly PushCategory[] = [
  { id: 'direct_messages', label: 'Direct messages', description: 'Messages sent to you directly.', importance: 'high' },
  { id: 'mentions', label: 'Mentions', description: 'Someone mentions you in a channel, topic or reply.', importance: 'high' },
  { id: 'replies', label: 'Replies', description: 'Replies to your posts and in topics you watch.', importance: 'default' },
  { id: 'new_topics', label: 'New topics', description: 'New topics in places and forums you follow.', importance: 'low' },
  { id: 'reactions', label: 'Reactions', description: 'Reactions to your posts and messages.', importance: 'low' },
  { id: 'solutions', label: 'Solutions', description: 'Your answer is marked as the solution.', importance: 'low' },
  { id: 'moderation', label: 'Moderation', description: 'Warnings, timeouts and removed content.', importance: 'default' },
];

export const OTHER_PUSH_CHANNEL: PushCategory = { id: 'other', label: 'Other', description: 'Anything else from your instances.', importance: 'default' };

/** The Android channel for a payload's category (or type, which the category defaults to). */
export function pushChannelId(payload: Pick<PushPayload, 'category' | 'type'> | null): string {
  const category = payload?.category ?? payload?.type;
  if (!category) return OTHER_PUSH_CHANNEL.id;
  if (PUSH_CATEGORIES.some((c) => c.id === category)) return category;
  const byType: Record<string, string> = {
    mention: 'mentions',
    direct_message: 'direct_messages',
    reply: 'replies',
    topic_reply: 'replies',
    reaction: 'reactions',
    new_topic: 'new_topics',
    solution: 'solutions',
    moderation: 'moderation',
  };
  return byType[category] ?? OTHER_PUSH_CHANNEL.id;
}

/** The categories the instance offers, in display order, with the account's choices (missing means on). */
export function pushCategoryChoices(
  offered: readonly string[] | null | undefined,
  preferences: Pick<PushPreferences, 'categories'> | null | undefined,
): (PushCategory & { enabled: boolean })[] {
  const list = offered ?? PUSH_CATEGORIES.map((c) => c.id);
  const known = PUSH_CATEGORIES.filter((c) => list.includes(c.id));
  const unknown = list
    .filter((id) => !PUSH_CATEGORIES.some((c) => c.id === id))
    .map((id): PushCategory => ({ id, label: id.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), description: '', importance: 'default' }));
  return [...known, ...unknown].map((c) => ({ ...c, enabled: preferences?.categories?.[c.id] !== false }));
}

/** The body for `PUT /users/@me/push-preferences` with one category changed. `PUT` replaces, so the rest is kept. */
export function pushPreferencesWith(current: PushPreferences, category: string, enabled: boolean): PushPreferences {
  const next: PushPreferences = { categories: { ...current.categories, [category]: enabled } };
  if (current.quiet_hours) next.quiet_hours = current.quiet_hours;
  if (current.paused_until) next.paused_until = current.paused_until;
  return next;
}

// ---------------------------------------------------------------------------------------------------------
// What to show

export interface PushDisplay {
  title: string;
  /** Always the instance's name, so an instance cannot pass for another app or sender. */
  subtitle: string;
  body: string;
  /** Groups the stack: iOS thread, Android group. */
  threadId: string;
  channelId: string;
  badge: number | null;
  /** Where tapping goes; `null` for the inbox. */
  openPath: string;
  notificationId: string | null;
  instance: string | null;
}

export const PUSH_FALLBACK_TITLE = 'New notification';

/** The shown notification for a decrypted payload. */
export function pushDisplay(payload: PushPayload, instanceName: string): PushDisplay {
  return {
    title: payload.title.trim() || PUSH_FALLBACK_TITLE,
    subtitle: instanceName,
    body: payload.body ?? '',
    threadId: `${payload.instance}|${payload.thread_id ?? payload.notification_id}`,
    channelId: pushChannelId(payload),
    badge: payload.badge ?? null,
    openPath: pushOpenPath({ instance: payload.instance, notificationId: payload.notification_id, target: payload.target }),
    notificationId: payload.notification_id,
    instance: payload.instance,
  };
}

/** What shows when a push cannot be read: the generic text, with the instance when the subscription is known. */
export function pushFallbackDisplay(instance: { origin: string; name: string } | null, notificationId?: string | null): PushDisplay {
  return {
    title: PUSH_FALLBACK_TITLE,
    subtitle: instance?.name ?? '',
    body: '',
    threadId: instance ? `${instance.origin}|fallback` : 'fallback',
    channelId: OTHER_PUSH_CHANNEL.id,
    badge: null,
    openPath: instance ? pushOpenPath({ instance: instance.origin, notificationId: notificationId ?? null }) : '/inbox',
    notificationId: notificationId ?? null,
    instance: instance?.origin ?? null,
  };
}

/**
 * A notification fetched for an `id_only` push, shaped as a payload. Titles follow the inbox's wording
 * (`describeNotification`), passed in so this stays free of the inbox's rendering.
 */
export function payloadFromNotification(
  instance: string,
  userId: string,
  n: Pick<Schemas['Notification'], 'id' | 'kind' | 'place_id' | 'topic_id' | 'post_id' | 'channel_id' | 'message_id'>,
  words: { title: string; body: string | null },
): PushPayload {
  const target: PushTarget = {};
  if (n.place_id) target.place_id = n.place_id;
  if (n.topic_id) target.topic_id = n.topic_id;
  if (n.post_id) target.post_id = n.post_id;
  if (n.channel_id) target[n.place_id ? 'channel_id' : 'conversation_id'] = n.channel_id;
  if (n.message_id) target.message_id = n.message_id;
  const payload: PushPayload = { v: 1, instance, user_id: userId, notification_id: n.id, type: n.kind, title: words.title, target };
  if (words.body) payload.body = words.body;
  const thread = n.channel_id ?? n.topic_id;
  if (thread) payload.thread_id = thread;
  return payload;
}

// ---------------------------------------------------------------------------------------------------------
// Where tapping goes

export interface PushOpenParams {
  instance: string;
  notification: string | null;
  target: PushTarget;
}

const OPEN_PARAMS: Record<PushTargetKey, string> = {
  place_id: 'place',
  board_id: 'board',
  topic_id: 'topic',
  channel_id: 'channel',
  conversation_id: 'conversation',
  message_id: 'message',
  post_id: 'post',
};

/** `/notification?instance=…&topic=…`: the app route that switches instance and opens the target. */
export function pushOpenPath({ instance, notificationId, target }: { instance: string; notificationId: string | null; target?: PushTarget }): string {
  const parts = [`instance=${encodeURIComponent(instance.replace(/\/+$/, ''))}`];
  if (notificationId) parts.push(`notification=${encodeURIComponent(notificationId)}`);
  for (const key of TARGET_KEYS) {
    const v = target?.[key];
    if (v) parts.push(`${OPEN_PARAMS[key]}=${encodeURIComponent(v)}`);
  }
  return `/notification?${parts.join('&')}`;
}

/** Reads `/notification`'s search params back. Null without a usable instance. */
export function parsePushOpenParams(params: Record<string, string | string[] | undefined>): PushOpenParams | null {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const instance = one(params.instance)?.trim().replace(/\/+$/, '');
  if (!instance || !/^https?:\/\/[^/?#\s]+$/i.test(instance)) return null;
  const notification = one(params.notification);
  const target: PushTarget = {};
  for (const key of TARGET_KEYS) {
    const v = one(params[OPEN_PARAMS[key]]);
    if (v && ID.test(v)) target[key] = v;
  }
  return { instance: instance.toLowerCase(), notification: notification && ID.test(notification) ? notification : null, target };
}

export type PushDestination =
  | { kind: 'conversation'; conversationId: string; messageId: string | null }
  | { kind: 'channel'; placeId: string; channelId: string; messageId: string | null }
  | { kind: 'topic'; topicId: string; placeId: string | null }
  | { kind: 'place'; placeId: string }
  | { kind: 'inbox' };

/** The screen a push opens: the conversation, channel message, topic or place, else the inbox. */
export function pushDestination(target: PushTarget): PushDestination {
  if (target.conversation_id) return { kind: 'conversation', conversationId: target.conversation_id, messageId: target.message_id ?? null };
  if (target.channel_id && target.place_id) {
    return { kind: 'channel', placeId: target.place_id, channelId: target.channel_id, messageId: target.message_id ?? null };
  }
  if (target.channel_id) return { kind: 'conversation', conversationId: target.channel_id, messageId: target.message_id ?? null };
  if (target.topic_id) return { kind: 'topic', topicId: target.topic_id, placeId: target.place_id ?? null };
  if (target.place_id) return { kind: 'place', placeId: target.place_id };
  return { kind: 'inbox' };
}

// ---------------------------------------------------------------------------------------------------------
// Keeping a registration current

/** This device's registration for one instance, kept on the device. Keys and the gateway secret live in secure storage. */
export interface PushRegistration {
  instanceId: string;
  origin: string;
  userId: string;
  sessionId: string;
  gatewayUrl: string;
  appId: string;
  platform: PushPlatform;
  mode: PushMode;
  subscriptionId: string;
  /** The instance's `PushSubscription` ID. */
  serverId: string;
  /** The platform token (iOS, Android) or endpoint (web) the gateway has. */
  device: string;
  apnsEnvironment?: 'production' | 'sandbox';
  /** Web: the VAPID key the browser subscription was made with. */
  vapidPublicKey?: string;
  refreshedAt: number;
  expiresAt: string;
}

export interface PushSyncInput {
  /** The person turned push on for this instance on this device. */
  enabled: boolean;
  session: { userId: string; sessionId: string } | null;
  /** The instance's `push` object; null when it has none (an older server). */
  info: Pick<PushInfo, 'available' | 'enabled' | 'gateway_url'> | null;
  /** The device's current token or endpoint, when known. */
  device: { value: string; apnsEnvironment?: 'production' | 'sandbox'; vapidPublicKey?: string } | null;
  now: number;
}

export type PushSyncStep =
  /** Nothing to do. */
  | 'none'
  /** Register with the gateway and the instance (replacing any old registration). */
  | 'register'
  /** Give the gateway the new token or endpoint. */
  | 'update'
  /** Extend the gateway subscription. */
  | 'refresh'
  /** Remove the registration everywhere. */
  | 'unregister';

/** Clients refresh on every start after this long (protocol: "Refresh and delete"). */
export const PUSH_REFRESH_AFTER_MS = 7 * 86_400_000;

/** What a device's registration with one instance needs now. */
export function planPushSync(registration: PushRegistration | undefined, input: PushSyncInput): PushSyncStep {
  if (!input.enabled || !input.session) return registration ? 'unregister' : 'none';
  if (!input.info) return 'none';
  // The operator turned push off: the instance stops pushing and removes the device; follow it.
  if (!input.info.enabled) return registration ? 'unregister' : 'none';
  // Waiting for the gateway to verify the instance: keep what exists, register once it can work.
  if (!input.info.available) return 'none';
  if (!input.device) return 'none';
  if (!registration) return 'register';
  if (registration.userId !== input.session.userId || registration.sessionId !== input.session.sessionId) return 'register';
  if (normalizeGatewayUrl(registration.gatewayUrl) !== normalizeGatewayUrl(input.info.gateway_url)) return 'register';
  if (input.device.vapidPublicKey && registration.vapidPublicKey !== input.device.vapidPublicKey) return 'register';
  if (registration.device !== input.device.value || (registration.apnsEnvironment ?? null) !== (input.device.apnsEnvironment ?? null)) return 'update';
  if (input.now - registration.refreshedAt >= PUSH_REFRESH_AFTER_MS) return 'refresh';
  return 'none';
}

/** The payload mode to ask the instance for: encrypted when offered (browsers always), else ID only. */
export function choosePushMode(modes: readonly string[] | null | undefined, platform: PushPlatform): PushMode | null {
  const offered = modes ?? ['encrypted', 'id_only'];
  if (offered.includes('encrypted')) return 'encrypted';
  return platform !== 'web' && offered.includes('id_only') ? 'id_only' : null;
}

// ---------------------------------------------------------------------------------------------------------
// Explaining the state

export type PushUnavailableReason =
  | 'server_unsupported'
  | 'server_disabled'
  | 'server_pending'
  | 'desktop'
  | 'browser_unsupported'
  | 'ios_not_installed'
  | 'brave'
  | 'no_app'
  | 'build_unconfigured';

/** Why push cannot be turned on here, in words for settings. */
export function pushUnavailableMessage(reason: PushUnavailableReason): string {
  switch (reason) {
    case 'server_unsupported':
      return "This server doesn't support push notifications yet.";
    case 'server_disabled':
      return "This server's administrators haven't turned on push notifications.";
    case 'server_pending':
      return "This server's push notifications aren't ready yet: the push gateway hasn't verified it. Try again later.";
    case 'desktop':
      return "The desktop app doesn't receive push notifications yet. Use the web app in a browser, or the phone apps.";
    case 'browser_unsupported':
      return "This browser can't receive push notifications.";
    case 'ios_not_installed':
      return 'On iPhone and iPad, add Gotalk to your Home Screen first: tap Share, then Add to Home Screen, and open it from there.';
    case 'brave':
      return 'Brave blocks push notifications by default. Turn on "Use Google services for push messaging" in brave://settings/privacy, then try again.';
    case 'no_app':
      return "This server's push gateway doesn't serve this app. Push notifications need the gateway the app was built for.";
    case 'build_unconfigured':
      return "This build of the app isn't set up for push notifications.";
  }
}
