import { describe, expect, it } from 'vitest';

import { BUILTIN_PERMISSIONS, hasPermission, permissionTable } from './permissions.ts';
import { buildInviteLink, describeInviteExpiry, describeInviteUses, isInviteCode, isValidSlug, slugify } from './places.ts';

describe('permissions', () => {
  // What the server sends a default member of a new place.
  const defaultMember = 133403975679;

  it('reads bits past 32, where JavaScript bitwise operators would truncate', () => {
    expect(hasPermission(defaultMember, 'CONNECT_VOICE')).toBe(true);
    expect(hasPermission(defaultMember, 'MOVE_MEMBERS')).toBe(true);
    expect(hasPermission(2 ** 36, 'MOVE_MEMBERS')).toBe(true);
    expect(hasPermission(2 ** 36, 'MUTE_MEMBERS')).toBe(false);
    expect(hasPermission(2 ** 36 + 2 ** 3, ['MOVE_MEMBERS', 'CREATE_INVITES'])).toBe(true);
  });

  it('requires every named permission', () => {
    expect(hasPermission(2 ** 3, ['CREATE_INVITES', 'MANAGE_INVITES'])).toBe(false);
  });

  it('treats missing bits and unknown names as no permission', () => {
    expect(hasPermission(undefined, 'MANAGE_PLACE')).toBe(false);
    expect(hasPermission(0, 'MANAGE_PLACE')).toBe(false);
    expect(hasPermission(2 ** 1, 'NOT_A_PERMISSION' as never)).toBe(false);
  });

  it("prefers the instance's own table over the built-in one", () => {
    const table = permissionTable([{ name: 'MANAGE_PLACE', value: 2 ** 40 }]);
    expect(hasPermission(2 ** 40, 'MANAGE_PLACE', table)).toBe(true);
    expect(hasPermission(2 ** 1, 'MANAGE_PLACE', table)).toBe(false);
    expect(permissionTable(null)).toBe(BUILTIN_PERMISSIONS);
  });
});

describe('place addresses', () => {
  it('slugifies names into addresses the server accepts', () => {
    expect(slugify('Open Woodworkers')).toBe('open-woodworkers');
    expect(slugify('  Café   Société!! ')).toBe('cafe-societe');
    expect(slugify('A'.repeat(50))).toHaveLength(32);
    expect(isValidSlug(slugify('Open Woodworkers'))).toBe(true);
    expect(isValidSlug(slugify('--'))).toBe(false);
  });

  it('validates addresses', () => {
    expect(isValidSlug('abc')).toBe(true);
    expect(isValidSlug('ab')).toBe(false);
    expect(isValidSlug('-abc')).toBe(false);
    expect(isValidSlug('Abc')).toBe(false);
    expect(isValidSlug('a'.repeat(33))).toBe(false);
  });
});

describe('invites', () => {
  it('builds links that carry the instance', () => {
    expect(buildInviteLink({ code: 'k3Vq9Xz2Lm', instanceOrigin: 'https://woodworkers.example.org' })).toBe(
      'gotalk://invite/k3Vq9Xz2Lm?instance=https%3A%2F%2Fwoodworkers.example.org',
    );
    expect(buildInviteLink({ code: 'abc', instanceOrigin: 'http://localhost:8080', webClientOrigin: 'https://app.gotalk.sh/' })).toBe(
      'https://app.gotalk.sh/invite/abc?instance=http%3A%2F%2Flocalhost%3A8080',
    );
  });

  it('describes uses and expiry', () => {
    expect(describeInviteUses({ uses: 3, max_uses: 10 })).toBe('3 of 10 uses');
    expect(describeInviteUses({ uses: 12, max_uses: null })).toBe('12 uses');
    expect(describeInviteUses({ uses: 0, max_uses: null })).toBe('unused');
    const now = Date.UTC(2026, 9, 4, 12);
    expect(describeInviteExpiry(null, now)).toBe('never expires');
    expect(describeInviteExpiry(new Date(now + 6 * 86_400_000).toISOString(), now)).toBe('expires in 6 days');
    expect(describeInviteExpiry(new Date(now + 20 * 3_600_000).toISOString(), now)).toBe('expires in 20 hours');
    expect(describeInviteExpiry(new Date(now + 26 * 3_600_000).toISOString(), now)).toBe('expires tomorrow');
    expect(describeInviteExpiry(new Date(now - 1).toISOString(), now)).toBe('expired');
  });

  it('recognizes invite codes', () => {
    expect(isInviteCode('k3Vq9Xz2Lm')).toBe(true);
    expect(isInviteCode('../etc')).toBe(false);
  });
});
