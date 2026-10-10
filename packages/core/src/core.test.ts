import { describe, expect, it, vi } from 'vitest';

import { checkCompatibility } from './compat.ts';
import { DiscoveryError, discoverInstance, normalizeInstanceInput } from './discovery.ts';
import { createInstancesStore, selectActiveInstance } from './instances.ts';

const instanceBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Test Forum',
  description: 'A test instance',
  icon_url: null,
  url: 'https://forum.example',
  software: { name: 'gotalk', version: '1.0.0', repository: '' },
  api: {
    version: 'v1',
    supported_versions: ['v1'],
    min_version: 'v1',
    max_version: 'v1',
    version_header: 'Gotalk-Api-Version',
    base_url: 'https://forum.example/api/v1',
    openapi_url: '',
    docs_url: '',
    gateway_url: 'wss://forum.example/api/v1/gateway',
    token_scopes: [],
  },
  registration_mode: 'open',
  setup_required: false,
  status: 'healthy',
  degraded_features: [],
  features: { email: true, password_reset: true, email_verification: true, uploads: true },
  limits: { upload_size: 8_388_608, upload_types: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'], upload_max_side: 8192 },
  ...overrides,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Routes requests by URL to canned responses; anything else is a connection failure. */
function fakeFetch(routes: Record<string, () => Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const route = routes[url];
    if (!route) throw new TypeError(`fetch failed: ${url}`);
    return route();
  }) as unknown as typeof fetch;
}

describe('normalizeInstanceInput', () => {
  it.each([
    ['forum.example', ['https://forum.example']],
    ['  Forum.Example  ', ['https://forum.example']],
    ['forum.example/places/foo', ['https://forum.example']],
    ['https://forum.example/api/v1', ['https://forum.example']],
    ['http://forum.example:8080', ['http://forum.example:8080']],
    ['localhost:18080', ['http://localhost:18080', 'https://localhost:18080']],
    ['192.168.1.20', ['http://192.168.1.20', 'https://192.168.1.20']],
    ['nas.local', ['http://nas.local', 'https://nas.local']],
  ])('%s -> %j', (input, expected) => {
    expect(normalizeInstanceInput(input)).toEqual(expected);
  });

  it.each(['', '   ', 'ftp://forum.example', 'not a host', 'user@forum.example'])('rejects %j', (input) => {
    expect(() => normalizeInstanceInput(input)).toThrowError(DiscoveryError);
  });
});

describe('discoverInstance', () => {
  it('follows .well-known to the advertised API base URL', async () => {
    const fetch = fakeFetch({
      'https://forum.example/.well-known/gotalk-instance': () =>
        json({ api_base_url: 'https://api.forum.example/api/v1', software: 'gotalk', gateway_url: 'wss://x' }),
      'https://api.forum.example/api/v1/instance': () => json(instanceBody()),
    });
    const d = await discoverInstance('forum.example', { fetch });
    expect(d.id).toBe('https://forum.example');
    expect(d.apiBaseUrl).toBe('https://api.forum.example/api/v1');
    expect(d.gatewayUrl).toBe('wss://forum.example/api/v1/gateway');
    expect(d.secure).toBe(true);
    expect(d.instance.name).toBe('Test Forum');
    expect(d.compatibility).toEqual({ ok: true });
  });

  it('falls back to /api/v1 when .well-known is missing', async () => {
    const fetch = fakeFetch({
      'https://forum.example/.well-known/gotalk-instance': () => json({}, 404),
      'https://forum.example/api/v1/instance': () => json(instanceBody()),
    });
    const d = await discoverInstance('forum.example', { fetch });
    expect(d.apiBaseUrl).toBe('https://forum.example/api/v1');
  });

  it('tries HTTPS after HTTP for local hosts', async () => {
    const fetch = fakeFetch({
      'https://localhost:9000/.well-known/gotalk-instance': () =>
        json({ api_base_url: 'https://localhost:9000/api/v1', software: 'gotalk' }),
      'https://localhost:9000/api/v1/instance': () => json(instanceBody()),
    });
    const d = await discoverInstance('localhost:9000', { fetch });
    expect(d.origin).toBe('https://localhost:9000');
  });

  it('marks plain-HTTP instances as insecure', async () => {
    const fetch = fakeFetch({
      'http://localhost:9000/.well-known/gotalk-instance': () =>
        json({ api_base_url: 'http://localhost:9000/api/v1', software: 'gotalk' }),
      'http://localhost:9000/api/v1/instance': () => json(instanceBody()),
    });
    expect((await discoverInstance('localhost:9000', { fetch })).secure).toBe(false);
  });

  it('rejects servers that are not Gotalk', async () => {
    const fetch = fakeFetch({
      'https://example.com/.well-known/gotalk-instance': () => json({}, 404),
      'https://example.com/api/v1/instance': () => json({ title: 'Not Found' }, 404),
    });
    await expect(discoverInstance('example.com', { fetch })).rejects.toMatchObject({ code: 'not_gotalk' });
  });

  it('reports unreachable hosts', async () => {
    await expect(discoverInstance('down.example', { fetch: fakeFetch({}) })).rejects.toMatchObject({ code: 'unreachable' });
  });

  it('flags incompatible API versions without failing discovery', async () => {
    const fetch = fakeFetch({
      'https://forum.example/.well-known/gotalk-instance': () => json({}, 404),
      'https://forum.example/api/v1/instance': () =>
        json(instanceBody({ api: { ...instanceBody().api, supported_versions: ['v2'], min_version: 'v2', max_version: 'v2' } })),
    });
    const d = await discoverInstance('forum.example', { fetch });
    expect(d.compatibility.ok).toBe(false);
  });
});

describe('checkCompatibility', () => {
  it('describes the supported range', () => {
    const c = checkCompatibility({ supported_versions: ['v2', 'v3'], min_version: 'v2', max_version: 'v3' });
    expect(c).toEqual({ ok: false, reason: expect.stringContaining('v2–v3') });
  });
});

describe('instances store', () => {
  const memoryStorage = () => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  };

  const discovered = (origin: string, name = 'Forum') => ({
    id: origin,
    origin,
    apiBaseUrl: `${origin}/api/v1`,
    gatewayUrl: '',
    secure: true,
    instance: instanceBody({ name }) as never,
    compatibility: { ok: true as const },
  });

  it('adds, activates, refreshes, and removes instances, persisting them', async () => {
    let t = 1;
    const storage = memoryStorage();
    const store = createInstancesStore(storage, () => t++);

    store.getState().addInstance(discovered('https://a.example', 'A'));
    store.getState().addInstance(discovered('https://b.example', 'B'));
    expect(selectActiveInstance(store.getState())?.name).toBe('B');

    store.getState().addInstance(discovered('https://a.example', 'A renamed'));
    const a = store.getState().instances[0]!;
    expect(a.name).toBe('A renamed');
    expect(a.addedAt).toBe(1);
    expect(store.getState().instances).toHaveLength(2);

    store.getState().removeInstance('https://a.example');
    expect(store.getState().activeId).toBeNull();

    const reloaded = createInstancesStore(storage);
    await reloaded.persist.rehydrate();
    expect(reloaded.getState().instances.map((i) => i.id)).toEqual(['https://b.example']);
  });

  it('picks up a new name or icon from a fresh GET /instance without reordering or re-activating', () => {
    let t = 1;
    const store = createInstancesStore(memoryStorage(), () => t++);
    store.getState().addInstance(discovered('https://a.example', 'A'));
    store.getState().addInstance(discovered('https://b.example', 'B'));
    const before = store.getState();

    store.getState().refresh('https://a.example', { name: 'A', description: 'A test instance', icon_url: null });
    expect(store.getState()).toBe(before);

    store.getState().refresh('https://a.example', { name: 'A', description: 'A test instance', icon_url: 'https://a.example/media/instance/x.png' });
    const a = store.getState().instances.find((i) => i.id === 'https://a.example')!;
    expect(a.iconUrl).toBe('https://a.example/media/instance/x.png');
    expect(a.lastUsedAt).toBe(1);
    expect(store.getState().activeId).toBe('https://b.example');
    expect(store.getState().instances.map((i) => i.id)).toEqual(['https://b.example', 'https://a.example']);

    store.getState().refresh('https://unknown.example', { name: 'X', description: '' });
    expect(store.getState().instances).toHaveLength(2);
  });
});
