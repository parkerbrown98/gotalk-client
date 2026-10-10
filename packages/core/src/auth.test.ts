import { uploadImage } from '@gotalk/api-client';
import { describe, expect, it } from 'vitest';

import {
  createAuthManager,
  createLocalLock,
  sessionKey,
  type AuthBroadcast,
  type AuthMessage,
  type AuthTarget,
  type SecretStorage,
} from './auth.ts';
import { describeLastUsed, describeUserAgent } from './devices.ts';

const target: AuthTarget = { id: 'https://x.example', apiBaseUrl: 'https://x.example/api/v1' };
const PASSWORD = 'correct horse battery';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' } });

/** An instance that rotates refresh tokens and revokes a session when one is presented twice. */
function fakeServer(clock: { now: number }) {
  const sessions = new Map<string, { refresh: string; revoked: boolean; generation: number }>();
  const validAccess = new Map<string, string>();
  const calls = { login: 0, refresh: 0, logout: 0, me: 0 };
  const uploads: { type: string | null; bytes: number[] }[] = [];
  let offline = false;
  let throttleRefresh = false;
  let counter = 0;

  function issue(sessionId: string) {
    const s = sessions.get(sessionId)!;
    s.generation += 1;
    s.refresh = `${sessionId}.r${s.generation}`;
    const access = `acc-${++counter}`;
    validAccess.set(access, sessionId);
    return {
      access_token: access,
      access_token_expires_at: new Date(clock.now + 15 * 60_000).toISOString(),
      expires_in: 900,
      refresh_token: s.refresh,
      refresh_token_expires_at: new Date(clock.now + 30 * 86_400_000).toISOString(),
      session_id: sessionId,
      token_type: 'Bearer',
      user: { id: 'u1', username: 'marta.k', display_name: 'Marta', avatar_url: null, bio: '', bot: false, created_at: '', email: 'm@x', email_verified: true, is_instance_admin: false, pronouns: '' },
    };
  }

  async function handler(input: RequestInfo | URL): Promise<Response> {
    if (offline) throw new TypeError('network down');
    const req = input as Request;
    const path = new URL(req.url).pathname.replace('/api/v1', '');
    const isJson = req.method !== 'GET' && !(req.headers.get('Content-Type') ?? '').startsWith('image/');
    const body = isJson ? ((await req.json().catch(() => null)) as Record<string, string> | null) : null;
    if (path === '/auth/login') {
      calls.login++;
      if (body?.password !== PASSWORD) return json({ status: 401, detail: 'invalid username/email or password' }, 401);
      const id = `s${sessions.size + 1}`;
      sessions.set(id, { refresh: '', revoked: false, generation: 0 });
      return json(issue(id));
    }
    if (path === '/auth/refresh') {
      calls.refresh++;
      if (throttleRefresh) {
        return new Response(JSON.stringify({ status: 429, detail: 'rate limit exceeded' }), {
          status: 429,
          headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '30' },
        });
      }
      const sessionId = body?.refresh_token?.split('.')[0] ?? '';
      const s = sessions.get(sessionId);
      if (!s || s.revoked) return json({ status: 401, detail: 'refresh token is invalid or expired' }, 401);
      if (s.refresh !== body?.refresh_token) {
        s.revoked = true; // reuse of a rotated token is treated as theft
        return json({ status: 401, detail: 'refresh token is invalid or expired' }, 401);
      }
      return json(issue(sessionId));
    }
    const sessionId = validAccess.get(req.headers.get('Authorization')?.replace('Bearer ', '') ?? '');
    if (!sessionId || sessions.get(sessionId)!.revoked) return json({ status: 401, detail: 'access token is invalid or expired' }, 401);
    if (path === '/auth/logout') {
      calls.logout++;
      sessions.get(sessionId)!.revoked = true;
      return new Response(null, { status: 204 });
    }
    if (path === '/users/@me') {
      calls.me++;
      return json({ id: 'u1', username: 'marta.k' });
    }
    if (path === '/users/@me/avatar' && req.method === 'PUT') {
      uploads.push({ type: req.headers.get('Content-Type'), bytes: [...new Uint8Array(await req.arrayBuffer())] });
      return json({ id: 'u1', username: 'marta.k', avatar_url: 'https://x.example/media/avatars/1.png' });
    }
    return json({ status: 404 }, 404);
  }

  return {
    handler,
    calls,
    uploads,
    sessions,
    setOffline: (v: boolean) => (offline = v),
    setThrottled: (v: boolean) => (throttleRefresh = v),
    /** Invalidates every access token without ending any session (the server restarted, say). */
    expireAccessTokens: () => validAccess.clear(),
    revokeAll: () => sessions.forEach((s) => (s.revoked = true)),
  };
}

function memoryDevice() {
  const secrets = new Map<string, string>();
  const identities = new Map<string, string>();
  const secretStorage: SecretStorage = {
    get: async (k) => secrets.get(k) ?? null,
    set: async (k, v) => void secrets.set(k, v),
    delete: async (k) => void secrets.delete(k),
  };
  return {
    secrets,
    secretStorage,
    identityStorage: {
      getItem: (k: string) => identities.get(k) ?? null,
      setItem: (k: string, v: string) => void identities.set(k, v),
      removeItem: (k: string) => void identities.delete(k),
    },
  };
}

function bus() {
  const listeners = new Set<(m: AuthMessage) => void>();
  return (): AuthBroadcast => {
    let mine: ((m: AuthMessage) => void) | null = null;
    return {
      post: (m) => listeners.forEach((l) => l !== mine && l(m)),
      subscribe(l) {
        mine = l;
        listeners.add(l);
        return () => listeners.delete(l);
      },
    };
  };
}

function setup() {
  const clock = { now: Date.UTC(2026, 9, 4) };
  const server = fakeServer(clock);
  const device = memoryDevice();
  const make = (extra: Partial<Parameters<typeof createAuthManager>[0]> = {}) =>
    createAuthManager({
      secrets: device.secretStorage,
      identities: device.identityStorage,
      fetch: server.handler,
      now: () => clock.now,
      ...extra,
    });
  return { clock, server, device, make };
}

describe('sign in', () => {
  it('keeps the refresh token in secret storage and the identity in state, never the access token', async () => {
    const { server, device, make } = setup();
    const auth = make();
    await auth.hydrate();
    await auth.signIn(target, { login: 'marta.k', password: PASSWORD });

    expect(auth.store.getState().sessions[target.id]?.username).toBe('marta.k');
    expect(JSON.parse(device.secrets.get(sessionKey(target.id))!)).toMatchObject({ refreshToken: 's1.r1' });
    expect(JSON.stringify([...device.secrets.values()])).not.toContain('acc-');
    expect(server.calls.login).toBe(1);
  });

  it('surfaces wrong credentials as a 401 ApiError and stores nothing', async () => {
    const { device, make } = setup();
    const auth = make();
    await expect(auth.signIn(target, { login: 'marta.k', password: 'nope' })).rejects.toMatchObject({ status: 401 });
    expect(device.secrets.size).toBe(0);
  });

  it('stays signed in after a restart and refreshes on first use', async () => {
    const { server, make } = setup();
    const first = make();
    await first.signIn(target, { login: 'marta.k', password: PASSWORD });

    const relaunched = make();
    expect(relaunched.store.getState().sessions).toEqual({});
    await relaunched.hydrate();
    expect(relaunched.store.getState().sessions[target.id]?.displayName).toBe('Marta');

    const res = await relaunched.clientFor(target).GET('/users/@me');
    expect(res.response.status).toBe(200);
    expect(server.calls.refresh).toBe(1);
  });

  it('forgets identities whose secret has vanished (keychain cleared)', async () => {
    const { device, make } = setup();
    const first = make();
    await first.signIn(target, { login: 'marta.k', password: PASSWORD });
    device.secrets.clear();

    const relaunched = make();
    await relaunched.hydrate();
    expect(relaunched.store.getState().sessions).toEqual({});
  });
});

describe('refresh', () => {
  it('is single-flight: concurrent requests share one refresh', async () => {
    const { server, clock, make } = setup();
    const auth = make();
    await auth.signIn(target, { login: 'marta.k', password: PASSWORD });
    clock.now += 20 * 60_000; // access token expired

    const client = auth.clientFor(target);
    const results = await Promise.all([client.GET('/users/@me'), client.GET('/users/@me'), client.GET('/users/@me')]);

    expect(results.map((r) => r.response.status)).toEqual([200, 200, 200]);
    expect(server.calls.refresh).toBe(1);
  });

  it('retries a rejected request once after refreshing', async () => {
    const { server, make } = setup();
    const auth = make();
    await auth.signIn(target, { login: 'marta.k', password: PASSWORD });
    server.expireAccessTokens();

    const res = await auth.clientFor(target).GET('/users/@me');

    expect(res.response.status).toBe(200);
    expect(server.calls.refresh).toBe(1);
    expect(server.calls.me).toBe(1);
  });

  it('resends an uploaded image with its content type after refreshing an expired token', async () => {
    const { server, make } = setup();
    const auth = make();
    await auth.signIn(target, { login: 'marta.k', password: PASSWORD });
    server.expireAccessTokens();

    const image = new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: 'image/png' });
    const user = await uploadImage(auth.clientFor(target), { kind: 'avatar' }, image);

    expect(user.avatar_url).toBe('https://x.example/media/avatars/1.png');
    expect(server.calls.refresh).toBe(1);
    expect(server.uploads).toEqual([{ type: 'image/png', bytes: [137, 80, 78, 71, 1, 2, 3] }]);
  });

  it('signs the device out when the server ended the session elsewhere', async () => {
    const { server, device, make } = setup();
    const auth = make();
    await auth.signIn(target, { login: 'marta.k', password: PASSWORD });
    server.revokeAll();

    const res = await auth.clientFor(target).GET('/users/@me');

    expect(res.response.status).toBe(401);
    expect(auth.store.getState().sessions).toEqual({});
    expect(auth.store.getState().revoked[target.id]).toEqual({ login: 'marta.k' });
    expect(device.secrets.has(sessionKey(target.id))).toBe(false);
  });

  it('keeps the session when the instance cannot be reached', async () => {
    const { server, clock, make } = setup();
    const auth = make();
    await auth.signIn(target, { login: 'marta.k', password: PASSWORD });
    clock.now += 20 * 60_000;
    server.setOffline(true);

    await expect(auth.clientFor(target).GET('/users/@me')).rejects.toThrow('network down');
    expect(auth.store.getState().sessions[target.id]).toBeDefined();

    server.setOffline(false);
    const res = await auth.clientFor(target).GET('/users/@me');
    expect(res.response.status).toBe(200);
  });

  it('pauses refreshing while the instance asks to wait, without signing out', async () => {
    const { server, clock, make } = setup();
    const auth = make();
    await auth.signIn(target, { login: 'marta.k', password: PASSWORD });
    clock.now += 20 * 60_000;
    server.setThrottled(true);

    await expect(auth.getAccessToken(target)).rejects.toMatchObject({ status: 429, retryAfter: 30 });
    await expect(auth.getAccessToken(target)).rejects.toMatchObject({ status: 429 });
    expect(server.calls.refresh).toBe(1); // the second attempt never reached the server
    expect(auth.store.getState().sessions[target.id]).toBeDefined();

    server.setThrottled(false);
    clock.now += 31_000;
    expect(await auth.getAccessToken(target)).toMatch(/^acc-/);
  });

  it('two tabs refreshing at once stay signed in when they share a lock', async () => {
    const { server, clock, make } = setup();
    const lock = createLocalLock();
    const tabA = make({ lock });
    await tabA.signIn(target, { login: 'marta.k', password: PASSWORD });
    const tabB = make({ lock });
    await tabB.hydrate();
    clock.now += 20 * 60_000;

    const [a, b] = await Promise.all([tabA.clientFor(target).GET('/users/@me'), tabB.clientFor(target).GET('/users/@me')]);

    expect([a.response.status, b.response.status]).toEqual([200, 200]);
    expect(server.calls.refresh).toBe(2); // one after the other, each with the latest token
    expect([...server.sessions.values()].some((s) => s.revoked)).toBe(false);
  });

  it('without a shared lock the server would see token reuse and revoke the session', async () => {
    const { server, clock, make } = setup();
    const tabA = make({ lock: createLocalLock() });
    await tabA.signIn(target, { login: 'marta.k', password: PASSWORD });
    const tabB = make({ lock: createLocalLock() });
    await tabB.hydrate();
    clock.now += 20 * 60_000;

    await Promise.all([tabA.clientFor(target).GET('/users/@me'), tabB.clientFor(target).GET('/users/@me')]);

    expect([...server.sessions.values()].some((s) => s.revoked)).toBe(true);
  });
});

describe('sign out', () => {
  it('ends the session on the server and clears the device', async () => {
    const { server, device, make } = setup();
    const auth = make();
    await auth.signIn(target, { login: 'marta.k', password: PASSWORD });

    await auth.signOut(target);

    expect(server.calls.logout).toBe(1);
    expect(auth.store.getState().sessions).toEqual({});
    expect(auth.store.getState().revoked).toEqual({});
    expect(device.secrets.size).toBe(0);
  });

  it('still signs the device out when the instance is unreachable', async () => {
    const { server, device, make } = setup();
    const auth = make();
    await auth.signIn(target, { login: 'marta.k', password: PASSWORD });
    server.setOffline(true);

    await auth.signOut(target);

    expect(auth.store.getState().sessions).toEqual({});
    expect(device.secrets.size).toBe(0);
  });

  it('tells other tabs, which then show the sign-in screen', async () => {
    const { make } = setup();
    const channel = bus();
    const tabA = make({ broadcast: channel() });
    const tabB = make({ broadcast: channel() });
    await tabA.signIn(target, { login: 'marta.k', password: PASSWORD });
    await tabB.hydrate();
    expect(tabB.store.getState().sessions[target.id]).toBeDefined();

    await tabA.signOut(target);
    await new Promise((r) => setTimeout(r, 0));

    expect(tabB.store.getState().sessions).toEqual({});
  });
});

describe('sessions are scoped to the instance', () => {
  it('keeps separate credentials per instance', async () => {
    const { device, make } = setup();
    const auth = make();
    const other: AuthTarget = { id: 'https://y.example:8443', apiBaseUrl: 'https://y.example:8443/api/v1' };
    await auth.signIn(target, { login: 'marta.k', password: PASSWORD });
    await auth.signIn(other, { login: 'marta.k', password: PASSWORD });

    expect(Object.keys(auth.store.getState().sessions).sort()).toEqual([target.id, other.id]);
    expect(sessionKey(other.id)).toMatch(/^[A-Za-z0-9._-]+$/);
    await auth.forget(other.id);
    expect(device.secrets.has(sessionKey(other.id))).toBe(false);
    expect(device.secrets.has(sessionKey(target.id))).toBe(true);
  });
});

describe('devices', () => {
  it('names devices from user agents', () => {
    expect(describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36').label).toBe('Chrome on macOS');
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0').label).toBe('Edge on Windows');
    expect(describeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0').label).toBe('Firefox on Linux');
    expect(describeUserAgent('Gotalk/0.1.0 (ios)')).toEqual({ label: 'Gotalk for iOS', kind: 'phone' });
    expect(describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Gotalk/0.1.0 (macos)')).toEqual({ label: 'Gotalk for macOS', kind: 'desktop' });
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0 Gotalk/0.1.0 (windows)')).toEqual({ label: 'Gotalk for Windows', kind: 'desktop' });
    expect(describeUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Gotalk/0.1.0 (linux)')).toEqual({ label: 'Gotalk for Linux', kind: 'desktop' });
    // A browser whose user agent merely mentions Gotalk elsewhere is still a browser.
    expect(describeUserAgent('Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0 MyGotalk/1.0 (linux)').label).toBe('Firefox on Linux');
    expect(describeUserAgent('')).toEqual({ label: 'Unknown device', kind: 'browser' });
  });

  it('describes recency', () => {
    const now = Date.UTC(2026, 9, 4, 12);
    expect(describeLastUsed(now - 60_000, now)).toBe('Active now');
    expect(describeLastUsed(now - 2 * 3_600_000, now)).toBe('2 hours ago');
    expect(describeLastUsed(now - 41 * 86_400_000, now)).toBe('41 days ago');
  });
});
