import { describe, expect, it } from 'vitest';

import { normalizeInstanceInput } from './discovery.ts';
import { instanceDisplayName, isOfficialInstance, OFFICIAL_INSTANCE, serverParam, sortServers } from './official.ts';

describe('official instance', () => {
  it('recognises api.gotalk.sh however the origin is written', () => {
    expect(isOfficialInstance('https://api.gotalk.sh')).toBe(true);
    expect(isOfficialInstance('https://API.gotalk.sh/')).toBe(true);
    expect(isOfficialInstance('http://api.gotalk.sh')).toBe(false);
    expect(isOfficialInstance('https://gotalk.sh')).toBe(false);
    expect(isOfficialInstance(undefined)).toBe(false);
  });

  it('names it Gotalk Official whatever the server calls itself', () => {
    expect(instanceDisplayName('https://api.gotalk.sh', 'Gotalk')).toBe('Gotalk Official');
    expect(instanceDisplayName('https://forum.example', 'Woodworkers')).toBe('Woodworkers');
  });

  it('writes servers into the address so discovery finds the same origin again', () => {
    for (const origin of [OFFICIAL_INSTANCE.origin, 'https://forum.example:8443', 'http://localhost:18080', 'http://forum.example']) {
      expect(normalizeInstanceInput(serverParam(origin))[0]).toBe(origin);
    }
    expect(serverParam('https://api.gotalk.sh/')).toBe('api.gotalk.sh');
    expect(serverParam('http://forum.example')).toBe('http://forum.example');
  });

  it('lists saved servers most recently used first without changing the input', () => {
    const list = [{ id: 'a', lastUsedAt: 1 }, { id: 'b', lastUsedAt: 3 }, { id: 'c', lastUsedAt: 2 }];
    expect(sortServers(list).map((s) => s.id)).toEqual(['b', 'c', 'a']);
    expect(list.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});
