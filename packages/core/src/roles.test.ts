import { describe, expect, it } from 'vitest';

import { BUILTIN_PERMISSIONS } from './permissions.ts';
import {
  PERMISSION_GROUPS,
  assignableRoles,
  bitsOf,
  canManageRole,
  countPermissions,
  hasBit,
  overwritablePermissions,
  overwriteCounts,
  overwriteState,
  permissionInfo,
  roleColorHex,
  roleColorValue,
  roleMoveTarget,
  setOverwriteState,
  sortRoles,
  ungroupedPermissions,
  withPermission,
} from './roles.ts';

const roles = [
  { id: 'everyone', name: '@everyone', position: 0, is_default: true },
  { id: 'helper', name: 'Helper', position: 1, is_default: false },
  { id: 'mod', name: 'Moderator', position: 2, is_default: false },
  { id: 'admin', name: 'Admin', position: 3, is_default: false },
];

describe('permission bits', () => {
  it('groups every built-in permission exactly once', () => {
    const grouped = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.name));
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(Object.keys(BUILTIN_PERMISSIONS).sort());
  });

  it('sets and clears bits past 32 without losing the others', () => {
    let bits = bitsOf(['SEND_MESSAGES', 'MOVE_MEMBERS']);
    expect(bits).toBe(2 ** 25 + 2 ** 36);
    expect(hasBit(bits, 'MOVE_MEMBERS')).toBe(true);
    bits = withPermission(bits, 'SPEAK', true);
    bits = withPermission(bits, 'MOVE_MEMBERS', false);
    expect(bits).toBe(2 ** 25 + 2 ** 33);
    expect(countPermissions(bits)).toBe(2);
    expect(withPermission(bits, 'NOT_A_THING', true)).toBe(bits);
  });

  it('labels unknown permissions and lists them for a newer server', () => {
    expect(permissionInfo('MANAGE_REPORTS').label).toBe('Manage reports');
    expect(permissionInfo('PRIORITY_SPEAKER')).toMatchObject({ label: 'Priority speaker', description: '' });
    expect(ungroupedPermissions({ ...BUILTIN_PERMISSIONS, PRIORITY_SPEAKER: 2 ** 40 })).toEqual(['PRIORITY_SPEAKER']);
  });
});

describe('overwrites', () => {
  it('offers the permissions the server accepts for each scope', () => {
    expect(overwritablePermissions('board')).toContain('MANAGE_POSTS');
    expect(overwritablePermissions('text')).not.toContain('SPEAK');
    expect(overwritablePermissions('voice')).toContain('SPEAK');
    const category = overwritablePermissions('category');
    expect(category).toEqual(expect.arrayContaining(['SEND_MESSAGES', 'CONNECT_VOICE']));
    expect(new Set(category).size).toBe(category.length);
  });

  it('moves a permission between allow, deny and neither', () => {
    let ow = setOverwriteState(undefined, 'SEND_MESSAGES', 'deny');
    expect(overwriteState(ow, 'SEND_MESSAGES')).toBe('deny');
    ow = setOverwriteState(ow, 'SEND_MESSAGES', 'allow');
    expect(ow).toEqual({ allow: 2 ** 25, deny: 0 });
    ow = setOverwriteState(ow, 'VIEW_CHANNELS', 'deny');
    expect(overwriteCounts(ow, overwritablePermissions('text'))).toEqual({ allowed: 1, denied: 1 });
    ow = setOverwriteState(ow, 'SEND_MESSAGES', 'inherit');
    expect(ow).toEqual({ allow: 0, deny: 2 ** 24 });
    expect(overwriteState(undefined, 'SPEAK')).toBe('inherit');
  });
});

describe('role ranking', () => {
  const mod = { is_owner: false, top_position: 2 };

  it('lists highest first with @everyone last', () => {
    expect(sortRoles(roles).map((r) => r.id)).toEqual(['admin', 'mod', 'helper', 'everyone']);
  });

  it('lets people manage only roles below their highest', () => {
    expect(canManageRole(roles[1]!, mod)).toBe(true);
    expect(canManageRole(roles[2]!, mod)).toBe(false);
    expect(canManageRole(roles[3]!, { is_owner: true, top_position: 0 })).toBe(true);
    expect(canManageRole(roles[0]!, { is_owner: false, top_position: 0 })).toBe(false);
    expect(assignableRoles(roles, mod).map((r) => r.id)).toEqual(['helper']);
  });

  it('moves a role one step, never past the mover or below @everyone', () => {
    const owner = { is_owner: true, top_position: 0 };
    expect(roleMoveTarget(roles, 'helper', -1, owner)).toBe(2);
    expect(roleMoveTarget(roles, 'mod', 1, owner)).toBe(1);
    expect(roleMoveTarget(roles, 'helper', 1, owner)).toBeNull();
    expect(roleMoveTarget(roles, 'admin', -1, owner)).toBeNull();
    expect(roleMoveTarget(roles, 'helper', -1, mod)).toBeNull();
    expect(roleMoveTarget(roles, 'everyone', -1, owner)).toBeNull();
  });

  it('converts role colors', () => {
    expect(roleColorHex(0)).toBeNull();
    expect(roleColorHex(0x57c1ff)).toBe('#57c1ff');
    expect(roleColorHex(0xff)).toBe('#0000ff');
    expect(roleColorValue('#57C1FF')).toBe(0x57c1ff);
    expect(roleColorValue(null)).toBe(0);
    expect(roleColorValue('blue')).toBe(0);
  });
});
