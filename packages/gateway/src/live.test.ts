import { createGotalkClient, unwrap } from '@gotalk/api-client';
import { describe, expect, it } from 'vitest';

import { catchUp } from './catch-up.ts';
import { createGatewayClient } from './client.ts';
import type { Dispatch } from './protocol.ts';

// Opt-in check against a real server, e.g. GOTALK_TEST_INSTANCE=localhost:8080 pnpm test
const target = process.env.GOTALK_TEST_INSTANCE;
const base = target ? (/^https?:\/\//.test(target) ? target : `http://${target}`) : '';

describe.skipIf(!target)('live gateway', () => {
  it('receives its own messages with the nonce, and catches up with after=', async () => {
    const api = createGotalkClient({ baseUrl: `${base}/api/v1` });
    const instance = unwrap(await api.GET('/instance'));
    const stamp = Date.now().toString(36);
    const tokens = unwrap(await api.POST('/auth/register', { body: { username: `gw_${stamp}`, email: `gw_${stamp}@example.org`, password: 'correct horse battery' } }));
    const authed = createGotalkClient({ baseUrl: `${base}/api/v1`, getAccessToken: () => tokens.access_token });
    unwrap(await authed.POST('/places', { body: { name: `Gateway ${stamp}`, slug: `gw-${stamp}`, visibility: 'private', locale: 'en', description: '' } }));
    const channel = unwrap(await authed.POST('/places/{place}/channels', { params: { path: { place: `gw-${stamp}` } }, body: { name: 'general', kind: 'text' } }));

    const events: Dispatch[] = [];
    const gateway = createGatewayClient({ url: instance.api.gateway_url, getToken: async () => tokens.access_token });
    gateway.onDispatch((d) => events.push(d));
    const ready = new Promise<void>((resolve) => gateway.onReady(() => resolve()));
    gateway.start();
    await ready;
    expect(gateway.store.getState().sessionId).toBe(tokens.session_id);

    const first = unwrap(await authed.POST('/channels/{channelID}/messages', { params: { path: { channelID: channel.id } }, body: { content: 'one', nonce: `n-${stamp}` } }));
    unwrap(await authed.POST('/channels/{channelID}/typing', { params: { path: { channelID: channel.id } } }));
    await new Promise((r) => setTimeout(r, 500));
    const created = events.find((e) => e.type === 'MESSAGE_CREATE');
    expect(created?.type === 'MESSAGE_CREATE' && created.data.nonce).toBe(`n-${stamp}`);
    expect(created?.data).toMatchObject({ id: first.id, channel_id: channel.id });

    gateway.stop();
    const later = [];
    for (const content of ['two', 'three', 'four']) later.push(unwrap(await authed.POST('/channels/{channelID}/messages', { params: { path: { channelID: channel.id } }, body: { content } })));
    const missed = await catchUp(
      async (after, limit) => unwrap(await authed.GET('/channels/{channelID}/messages', { params: { path: { channelID: channel.id }, query: { after, limit } } })) ?? [],
      first.id,
      { pageSize: 2 },
    );
    expect(missed.complete).toBe(true);
    expect(missed.items.map((m) => m.id)).toEqual(later.map((m) => m.id));
  }, 20_000);
});
