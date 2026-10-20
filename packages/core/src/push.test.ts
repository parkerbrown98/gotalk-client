import { describe, expect, it, vi } from 'vitest';

import {
  choosePushMode,
  createPushGatewayClient,
  decodePushPlaintext,
  parseApnsEnvelope,
  parseFcmEnvelope,
  parsePushOpenParams,
  parsePushPayload,
  payloadFromNotification,
  pickGatewayApp,
  planPushSync,
  pushCategoryChoices,
  pushChannelId,
  pushDestination,
  pushDisplay,
  pushFallbackDisplay,
  pushOpenPath,
  pushPreferencesWith,
  PushGatewayError,
  PUSH_REFRESH_AFTER_MS,
  type PushRegistration,
  type PushSyncInput,
} from './push.ts';

const payload = {
  v: 1,
  instance: 'https://forum.example',
  user_id: 'u1',
  notification_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  type: 'mention',
  title: 'Alice mentioned you in #general',
  body: 'Ready, @bob?',
  thread_id: 'chn1',
  category: 'mentions',
  badge: 3,
  created_at: '2026-10-19T16:46:00Z',
  target: { place_id: 'plc1', channel_id: 'chn1', message_id: 'msg1', bogus: 'x' },
};

describe('push payloads', () => {
  it('reads a v1 payload and drops unknown target keys', () => {
    const p = parsePushPayload(payload)!;
    expect(p.title).toBe('Alice mentioned you in #general');
    expect(p.badge).toBe(3);
    expect(p.target).toEqual({ place_id: 'plc1', channel_id: 'chn1', message_id: 'msg1' });
  });

  it('refuses newer versions, missing fields and odd IDs', () => {
    expect(parsePushPayload({ ...payload, v: 2 })).toBeNull();
    expect(parsePushPayload({ ...payload, instance: 'javascript:alert(1)' })).toBeNull();
    expect(parsePushPayload({ ...payload, notification_id: '../../etc' })).toBeNull();
    expect(parsePushPayload({ ...payload, user_id: undefined })).toBeNull();
    // The minimal web plaintext: only IDs, shown with the generic title.
    const minimal = parsePushPayload({ v: 1, instance: 'https://a.example', user_id: 'u1', notification_id: 'n1' })!;
    expect(pushDisplay(minimal, 'A')).toMatchObject({ title: 'New notification', channelId: 'other', body: '' });
    expect(parsePushPayload('nope')).toBeNull();
    expect(parsePushPayload({ ...payload, target: { topic_id: 'a/b' } })?.target).toBeUndefined();
  });

  it('decodes padded JSON bytes', () => {
    expect(decodePushPlaintext(new TextEncoder().encode(JSON.stringify(payload)))?.notification_id).toBe(payload.notification_id);
    expect(decodePushPlaintext(new TextEncoder().encode('{'))).toBeNull();
  });

  it('reads the FCM and APNs envelopes', () => {
    expect(parseFcmEnvelope({ gt_v: '1', gt_sub: 'sub_1', gt_mode: 'encrypted', gt_body: 'abc' })).toEqual({ sub: 'sub_1', mode: 'encrypted', body: 'abc' });
    expect(parseFcmEnvelope({ gt_v: '1', gt_sub: 'sub_1', gt_mode: 'id_only', gt_instance: 'https://a.example/', gt_notification_id: 'n1' })).toEqual({
      sub: 'sub_1',
      mode: 'id_only',
      instance: 'https://a.example',
      notificationId: 'n1',
    });
    expect(parseFcmEnvelope({ gt_v: '2', gt_sub: 's', gt_mode: 'encrypted', gt_body: 'x' })).toBeNull();
    expect(parseFcmEnvelope({ gt_v: '1', gt_sub: 's', gt_mode: 'encrypted' })).toBeNull();
    expect(parseApnsEnvelope({ v: 1, sub: 'sub_2', mode: 'encrypted', body: 'b' })).toEqual({ sub: 'sub_2', mode: 'encrypted', body: 'b' });
    expect(parseApnsEnvelope(null)).toBeNull();
  });
});

describe('showing a push', () => {
  it('always names the instance and groups by thread', () => {
    const d = pushDisplay(parsePushPayload(payload)!, 'Forum Example');
    expect(d.subtitle).toBe('Forum Example');
    expect(d.threadId).toBe('https://forum.example|chn1');
    expect(d.channelId).toBe('mentions');
    expect(d.badge).toBe(3);
    expect(d.openPath).toBe(
      '/notification?instance=https%3A%2F%2Fforum.example&notification=7c9e6679-7425-40de-944b-e07fc1f90ae7&place=plc1&channel=chn1&message=msg1',
    );
  });

  it('falls back to generic text', () => {
    expect(pushFallbackDisplay({ origin: 'https://a.example', name: 'A' }, 'n1')).toMatchObject({ title: 'New notification', subtitle: 'A', channelId: 'other' });
    expect(pushFallbackDisplay(null).openPath).toBe('/inbox');
  });

  it('maps categories and types to Android channels', () => {
    expect(pushChannelId({ category: 'replies', type: 'reply' })).toBe('replies');
    expect(pushChannelId({ type: 'direct_message' })).toBe('direct_messages');
    expect(pushChannelId({ type: 'something_new' })).toBe('other');
    expect(pushChannelId(null)).toBe('other');
  });

  it('builds a payload from a fetched notification', () => {
    const p = payloadFromNotification(
      'https://a.example',
      'u1',
      { id: 'n1', kind: 'direct_message', place_id: null, topic_id: null, post_id: null, channel_id: 'dm1', message_id: 'm1' },
      { title: 'Alice sent you a message', body: null },
    );
    expect(p.target).toEqual({ conversation_id: 'dm1', message_id: 'm1' });
    expect(p.thread_id).toBe('dm1');
    expect(p.body).toBeUndefined();
  });
});

describe('opening a push', () => {
  it('round-trips the route', () => {
    const path = pushOpenPath({ instance: 'https://a.example/', notificationId: 'n1', target: { topic_id: 't1', place_id: 'p1', post_id: 'x1' } });
    const params = Object.fromEntries(new URLSearchParams(path.split('?')[1]));
    expect(parsePushOpenParams(params)).toEqual({ instance: 'https://a.example', notification: 'n1', target: { place_id: 'p1', topic_id: 't1', post_id: 'x1' } });
    expect(parsePushOpenParams({ instance: 'ftp://a' })).toBeNull();
    expect(parsePushOpenParams({ instance: 'https://a.example/path' })).toBeNull();
  });

  it('picks the screen', () => {
    expect(pushDestination({ conversation_id: 'c', message_id: 'm' })).toEqual({ kind: 'conversation', conversationId: 'c', messageId: 'm' });
    expect(pushDestination({ place_id: 'p', channel_id: 'c' })).toEqual({ kind: 'channel', placeId: 'p', channelId: 'c', messageId: null });
    expect(pushDestination({ channel_id: 'c' })).toMatchObject({ kind: 'conversation', conversationId: 'c' });
    expect(pushDestination({ place_id: 'p', topic_id: 't', post_id: 'x' })).toEqual({ kind: 'topic', topicId: 't', placeId: 'p' });
    expect(pushDestination({ place_id: 'p' })).toEqual({ kind: 'place', placeId: 'p' });
    expect(pushDestination({})).toEqual({ kind: 'inbox' });
  });
});

describe('preferences', () => {
  it('lists offered categories with defaults on', () => {
    const list = pushCategoryChoices(['mentions', 'reactions', 'future_thing'], { categories: { reactions: false } });
    expect(list.map((c) => [c.id, c.enabled])).toEqual([
      ['mentions', true],
      ['reactions', false],
      ['future_thing', true],
    ]);
    expect(list[2]!.label).toBe('Future thing');
  });

  it('keeps quiet hours and pauses when changing a category', () => {
    const next = pushPreferencesWith(
      { categories: { mentions: true }, quiet_hours: { start: '22:00', end: '07:00', timezone: 'UTC' }, paused_until: null },
      'reactions',
      false,
    );
    expect(next).toEqual({ categories: { mentions: true, reactions: false }, quiet_hours: { start: '22:00', end: '07:00', timezone: 'UTC' } });
  });
});

describe('gateway', () => {
  const discovery = {
    apps: [
      { id: 'gotalk', name: 'Gotalk', platforms: { ios: { bundle_id: 'sh.gotalk.app' }, android: { package_name: 'sh.gotalk.app' }, web: { vapid_public_key: 'K1' } } },
      { id: 'custom', name: 'Custom', platforms: { ios: { bundle_id: 'sh.gotalk.app' }, web: { vapid_public_key: 'K2' } } },
    ],
  };

  it('picks the app by bundle ID, or by the VAPID key both sides list', () => {
    expect(pickGatewayApp(discovery, 'ios', { nativeId: 'sh.gotalk.app' })).toEqual({ appId: 'gotalk' });
    expect(pickGatewayApp(discovery, 'ios', { nativeId: 'sh.gotalk.app', preferredAppId: 'custom' })).toEqual({ appId: 'custom' });
    expect(pickGatewayApp(discovery, 'android', { nativeId: 'other.app' })).toBeNull();
    expect(pickGatewayApp(discovery, 'web', {}, [{ app_id: 'custom', vapid_public_key: 'K2' }])).toEqual({ appId: 'custom', vapidPublicKey: 'K2' });
    expect(pickGatewayApp(discovery, 'web', {}, [{ app_id: 'gotalk', vapid_public_key: 'stale' }])).toBeNull();
  });

  it('calls the device endpoints and maps problems', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const responses = [
      new Response(JSON.stringify({ subscription_id: 'sub_1', subscription_secret: 'gtsec_x', expires_at: 'later' }), { status: 201 }),
      new Response(JSON.stringify({ subscription_id: 'sub_1', expires_at: 'later' }), { status: 200 }),
      new Response(null, { status: 204 }),
      new Response(JSON.stringify({ code: 'subscription_not_found', status: 404 }), { status: 404 }),
      new Response(JSON.stringify({ code: 'rate_limited', detail: 'Slow down' }), { status: 429, headers: { 'Retry-After': '30' } }),
    ];
    const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return responses.shift()!;
    });
    const client = createPushGatewayClient({ baseUrl: 'https://push.example/', fetch });
    const reg = await client.register({ app_id: 'gotalk', instance_origin: 'https://a.example', platform: 'android', token: 't' });
    expect(reg.subscription_secret).toBe('gtsec_x');
    await client.update('sub_1', 'gtsec_x', { token: 'new' });
    await client.remove('sub_1', 'gtsec_x');
    await client.remove('sub_1', 'gtsec_x');
    const err = await client.register({ app_id: 'gotalk', instance_origin: 'https://a.example', platform: 'web', endpoint: 'e' }).catch((e) => e);
    expect(err).toBeInstanceOf(PushGatewayError);
    expect(err).toMatchObject({ status: 429, code: 'rate_limited', detail: 'Slow down', retryAfter: 30 });
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      'POST https://push.example/v1/devices',
      'PUT https://push.example/v1/devices/sub_1',
      'DELETE https://push.example/v1/devices/sub_1',
      'DELETE https://push.example/v1/devices/sub_1',
      'POST https://push.example/v1/devices',
    ]);
    expect((calls[1]!.init.headers as Record<string, string>).Authorization).toBe('Bearer gtsec_x');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe('planning a registration', () => {
  const now = 1_800_000_000_000;
  const reg: PushRegistration = {
    instanceId: 'https://a.example',
    origin: 'https://a.example',
    userId: 'u1',
    sessionId: 's1',
    gatewayUrl: 'https://push.example',
    appId: 'gotalk',
    platform: 'ios',
    mode: 'encrypted',
    subscriptionId: 'sub_1',
    serverId: 'srv1',
    device: 'abc',
    apnsEnvironment: 'production',
    refreshedAt: now - 1000,
    expiresAt: 'later',
  };
  const input: PushSyncInput = {
    enabled: true,
    session: { userId: 'u1', sessionId: 's1' },
    info: { enabled: true, available: true, gateway_url: 'https://push.example/' },
    device: { value: 'abc', apnsEnvironment: 'production' },
    now,
  };

  it('leaves a current registration alone', () => {
    expect(planPushSync(reg, input)).toBe('none');
  });

  it('registers, updates and refreshes when needed', () => {
    expect(planPushSync(undefined, input)).toBe('register');
    expect(planPushSync(reg, { ...input, session: { userId: 'u1', sessionId: 's2' } })).toBe('register');
    expect(planPushSync(reg, { ...input, info: { ...input.info!, gateway_url: 'https://other.example' } })).toBe('register');
    expect(planPushSync(reg, { ...input, device: { value: 'def', apnsEnvironment: 'production' } })).toBe('update');
    expect(planPushSync(reg, { ...input, device: { value: 'abc', apnsEnvironment: 'sandbox' } })).toBe('update');
    expect(planPushSync({ ...reg, refreshedAt: now - PUSH_REFRESH_AFTER_MS }, input)).toBe('refresh');
    expect(planPushSync({ ...reg, platform: 'web', vapidPublicKey: 'K1' }, { ...input, device: { value: 'abc', apnsEnvironment: 'production', vapidPublicKey: 'K2' } })).toBe(
      'register',
    );
  });

  it('unregisters when turned off, signed out or the operator stops push', () => {
    expect(planPushSync(reg, { ...input, enabled: false })).toBe('unregister');
    expect(planPushSync(reg, { ...input, session: null })).toBe('unregister');
    expect(planPushSync(reg, { ...input, info: { ...input.info!, enabled: false } })).toBe('unregister');
    expect(planPushSync(undefined, { ...input, enabled: false })).toBe('none');
  });

  it('waits while the server or device is not ready', () => {
    expect(planPushSync(reg, { ...input, info: { ...input.info!, available: false } })).toBe('none');
    expect(planPushSync(undefined, { ...input, info: null })).toBe('none');
    expect(planPushSync(undefined, { ...input, device: null })).toBe('none');
  });

  it('chooses encrypted pushes when offered', () => {
    expect(choosePushMode(['encrypted', 'id_only'], 'ios')).toBe('encrypted');
    expect(choosePushMode(['id_only'], 'android')).toBe('id_only');
    expect(choosePushMode(['id_only'], 'web')).toBeNull();
    expect(choosePushMode(null, 'web')).toBe('encrypted');
  });
});
