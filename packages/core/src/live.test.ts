import { describe, expect, it } from 'vitest';

import { discoverInstance } from './discovery.ts';

// Opt-in check against a real server, e.g. GOTALK_TEST_INSTANCE=localhost:18080 pnpm test
const target = process.env.GOTALK_TEST_INSTANCE;

describe.skipIf(!target)('live instance', () => {
  it('discovers the instance and is API-compatible', async () => {
    const d = await discoverInstance(target!);
    expect(d.instance.software.name).toBe('gotalk');
    expect(d.compatibility).toEqual({ ok: true });
    expect(d.gatewayUrl).toMatch(/^wss?:\/\//);
  });
});
