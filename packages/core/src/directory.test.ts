import { describe, expect, it } from 'vitest';

import {
  boardIndexBlock,
  boardIndexState,
  describeDirectoryAudit,
  lookUpPlatformInstance,
  parsePlatformInstance,
  placeIndexBlock,
  placeIndexState,
  platformStatusLabel,
  shortKey,
  shouldShowIndexNotice,
  suggestedPolicyText,
} from './directory.ts';
import { buildSectionSettings, fieldsFor, formFromSection, showAdvancedFields, type ConfigSection } from './server-config.ts';

describe('search engine settings', () => {
  const publicPlace = { visibility: 'public' as const, is_nsfw: false, indexable: false, indexed: false };

  it('explains why a place cannot allow search engines', () => {
    expect(placeIndexBlock(publicPlace)).toBeNull();
    expect(placeIndexBlock({ ...publicPlace, visibility: 'private' })).toMatch(/Private places/);
    expect(placeIndexBlock({ ...publicPlace, visibility: 'invite_only' })).toMatch(/Invite-only places/);
    expect(placeIndexBlock({ ...publicPlace, visibility: 'private', is_nsfw: true })).toMatch(/NSFW/);
    expect(boardIndexBlock({ is_nsfw: true })).toMatch(/NSFW/);
    expect(boardIndexBlock({ is_nsfw: false })).toBeNull();
  });

  it("describes a place's state", () => {
    expect(placeIndexState({ ...publicPlace, indexable: true, indexed: true }, true).label).toBe('In search engines');
    expect(placeIndexState(publicPlace, true).label).toBe('Not in search engines');
    expect(placeIndexState({ ...publicPlace, indexable: true }, false)).toMatchObject({ label: 'Waiting for the instance', tone: 'warning' });
    expect(placeIndexState({ ...publicPlace, indexable: true, visibility: 'private' }, true).label).toBe('Not in search engines');
  });

  it("describes a board's state", () => {
    const board = { is_nsfw: false, is_public: true, indexable: true, indexed: false };
    expect(boardIndexState({ ...board, indexed: true }, true).label).toBe('In search engines');
    expect(boardIndexState({ ...board, indexable: false }, true).label).toBe('Excluded');
    expect(boardIndexState({ ...board, is_public: false }, true).detail).toMatch(/Signed-out visitors/);
    expect(boardIndexState(board, false).detail).toMatch(/only while their place/);
  });

  it('shows the member notice once per indexed place', () => {
    const place = { id: 'p1', indexed: true };
    expect(shouldShowIndexNotice(place, true, [])).toBe(true);
    expect(shouldShowIndexNotice(place, true, ['p1'])).toBe(false);
    expect(shouldShowIndexNotice(place, false, undefined)).toBe(false);
    expect(shouldShowIndexNotice({ ...place, indexed: false }, true, undefined)).toBe(false);
    expect(shouldShowIndexNotice(undefined, true, undefined)).toBe(false);
  });

  it('describes directory audit entries', () => {
    expect(describeDirectoryAudit({ action: 'directory.update', metadata: { listed: true } })).toBe('Saved the directory settings with listing on');
    expect(describeDirectoryAudit({ action: 'directory.key_rotate' })).toBe('Rotated the signing key');
    expect(describeDirectoryAudit({ action: 'user.index_exclusion', metadata: { exclude: true } })).toMatch(/kept their posts out/);
    expect(describeDirectoryAudit({ action: 'policy.publish' })).toBeNull();
  });

  it('lists suggested policy text and shortens keys', () => {
    expect(suggestedPolicyText({ privacy: '## P', terms: '## T', guidelines: '  ', other: 'x' }).map((p) => p.kind)).toEqual(['terms', 'privacy']);
    expect(suggestedPolicyText(null)).toEqual([]);
    expect(shortKey('nGRAFuHGLGgzkity_hqMQPXkC-U3bc3KBYzvhO7YeoE')).toBe('nGRAFu…O7YeoE');
    expect(shortKey('short')).toBe('short');
  });
});

describe("the index's view of an instance", () => {
  const body = { origin: 'https://forum.example', status: 'listed', listed_since: '2026-10-01T00:00:00Z', places_indexed: 3, topics_indexed: 120, last_crawl_at: '2026-10-18T10:00:00Z' };

  it('reads the status document', () => {
    expect(parsePlatformInstance(body)).toEqual({ status: 'listed', listedSince: '2026-10-01T00:00:00Z', placesIndexed: 3, topicsIndexed: 120, lastCrawlAt: '2026-10-18T10:00:00Z' });
    expect(parsePlatformInstance({ status: 'pending', places_indexed: 'many' })).toMatchObject({ status: 'pending', placesIndexed: null, lastCrawlAt: null });
    expect(parsePlatformInstance({ status: 'exploded' })).toBeNull();
    expect(parsePlatformInstance('nope')).toBeNull();
    expect(platformStatusLabel('stale').tone).toBe('warning');
  });

  it('treats 404 as not registered and other failures as unreachable', async () => {
    const answer = (status: number, json: unknown = body) => (async () => new Response(JSON.stringify(json), { status })) as typeof fetch;
    await expect(lookUpPlatformInstance('https://gotalk.sh/x', answer(200))).resolves.toMatchObject({ kind: 'found', view: { status: 'listed' } });
    await expect(lookUpPlatformInstance('https://gotalk.sh/x', answer(404))).resolves.toEqual({ kind: 'unregistered' });
    await expect(lookUpPlatformInstance('https://gotalk.sh/x', answer(502))).resolves.toEqual({ kind: 'unreachable' });
    await expect(lookUpPlatformInstance('https://gotalk.sh/x', answer(200, { hello: 1 }))).resolves.toEqual({ kind: 'unreachable' });
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await expect(lookUpPlatformInstance('https://gotalk.sh/x', offline)).resolves.toEqual({ kind: 'unreachable' });
  });
});

describe('the directory settings section', () => {
  const view = {
    source: 'settings',
    editable: true,
    config_key: 'directory.listed',
    settings: { listed: true, contact_email: 'ops@example.com', platform_url: 'https://gotalk.sh' },
    secrets_set: [],
  } as unknown as ConfigSection;

  it('round-trips the form', () => {
    const values = formFromSection('directory', view);
    expect(values).toEqual({ listed: true, contact_email: 'ops@example.com', platform_url: 'https://gotalk.sh' });
    expect(buildSectionSettings('directory', { ...values, listed: false })).toEqual({
      directory: { listed: false, contact_email: 'ops@example.com', platform_url: 'https://gotalk.sh', pings_disabled: false },
    });
    expect(buildSectionSettings('directory', { ...values, signing_key: 'seed' }).directory).toMatchObject({ signing_key: 'seed' });
    expect(formFromSection('directory', { ...view, settings: {} } as unknown as ConfigSection)).toEqual({ listed: false });
  });

  it('opens the advanced fields only when one is changed from its default', () => {
    const fields = fieldsFor('directory', '');
    const values = formFromSection('directory', view);
    expect(showAdvancedFields(fields, values, [])).toBe(false);
    expect(showAdvancedFields(fields, { ...values, platform_url: 'https://index.example' }, [])).toBe(true);
    expect(showAdvancedFields(fields, { ...values, pings_disabled: true }, [])).toBe(true);
    expect(showAdvancedFields(fields, values, ['signing_key'])).toBe(true);
  });
});
