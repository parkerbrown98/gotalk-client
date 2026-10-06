import { BUILTIN_PERMISSIONS, type PermissionName, type PermissionTable } from './permissions.ts';

export interface PermissionInfo {
  name: PermissionName;
  label: string;
  description: string;
}

export interface PermissionGroup {
  key: 'general' | 'membership' | 'moderation' | 'forums' | 'chat' | 'voice';
  label: string;
  permissions: PermissionInfo[];
}

const p = (name: PermissionName, label: string, description: string): PermissionInfo => ({ name, label, description });

/** Every place permission, grouped the way the role editor shows them. */
export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    key: 'general',
    label: 'General',
    permissions: [
      p('ADMINISTRATOR', 'Administrator', 'Every permission, and overrides do not apply. Give it sparingly.'),
      p('MANAGE_PLACE', 'Manage place', 'Change the name, address and visibility, and add bots.'),
      p('MANAGE_ROLES', 'Manage roles', 'Create, edit and assign roles below their highest role.'),
      p('MANAGE_WEBHOOKS', 'Manage webhooks', "Send the place's events to other services."),
      p('VIEW_AUDIT_LOG', 'View audit log', 'See every moderation and administration action.'),
    ],
  },
  {
    key: 'membership',
    label: 'Membership',
    permissions: [
      p('CREATE_INVITES', 'Create invites', 'Make invite links.'),
      p('MANAGE_INVITES', 'Manage invites', "See and revoke everyone's invite links."),
      p('CHANGE_NICKNAME', 'Change nickname', 'Pick their own nickname in this place.'),
      p('MANAGE_NICKNAMES', 'Manage nicknames', "Change other members' nicknames."),
    ],
  },
  {
    key: 'moderation',
    label: 'Moderation',
    permissions: [
      p('KICK_MEMBERS', 'Kick members', 'Remove members. They can join again.'),
      p('BAN_MEMBERS', 'Ban members', 'Remove members and stop them joining again.'),
      p('MODERATE_MEMBERS', 'Moderate members', 'Warn members and time them out.'),
      p('MANAGE_REPORTS', 'Manage reports', 'Work through reports from members.'),
    ],
  },
  {
    key: 'forums',
    label: 'Forums',
    permissions: [
      p('VIEW_BOARDS', 'View forums', 'Read forums and their topics.'),
      p('CREATE_TOPICS', 'Create topics', 'Start new topics.'),
      p('REPLY_TO_TOPICS', 'Reply to topics', 'Post replies.'),
      p('ADD_REACTIONS', 'Add reactions', 'React to posts and messages.'),
      p('ATTACH_FILES', 'Attach files', 'Add files to posts and messages.'),
      p('MANAGE_BOARDS', 'Manage forums', 'Create, edit and delete forums and set their overrides.'),
      p('MANAGE_POSTS', 'Manage posts', "Edit, delete, pin, lock and archive anyone's topics and posts."),
    ],
  },
  {
    key: 'chat',
    label: 'Chat',
    permissions: [
      p('VIEW_CHANNELS', 'View channels', 'Read chat and see voice channels.'),
      p('SEND_MESSAGES', 'Send messages', 'Write in chat channels and threads.'),
      p('MANAGE_MESSAGES', 'Manage messages', "Delete and pin anyone's messages."),
      p('MANAGE_CHANNELS', 'Manage channels', 'Create, edit and delete channels and set their overrides.'),
    ],
  },
  {
    key: 'voice',
    label: 'Voice',
    permissions: [
      p('CONNECT_VOICE', 'Connect', 'Join voice channels.'),
      p('SPEAK', 'Speak', 'Talk in voice channels.'),
      p('SHARE_SCREEN', 'Share screen', 'Turn on a camera or share a screen.'),
      p('MUTE_MEMBERS', 'Mute members', 'Mute and deafen others in voice.'),
      p('MOVE_MEMBERS', 'Move members', 'Move others between voice channels and disconnect them.'),
    ],
  },
];

const INFO: ReadonlyMap<string, PermissionInfo> = new Map(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((i) => [i.name, i] as const)));

/** Label and description of a permission, or a readable fallback for one this client does not know yet. */
export function permissionInfo(name: string): { name: string; label: string; description: string } {
  return INFO.get(name) ?? { name, label: name.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), description: '' };
}

/** Permissions the instance defines that are not in any group here (a newer server), so they stay editable. */
export function ungroupedPermissions(table: PermissionTable): string[] {
  return Object.keys(table).filter((name) => !INFO.has(name));
}

function bit(name: string, table: PermissionTable): bigint | null {
  const value = table[name];
  return value === undefined ? null : BigInt(value);
}

/** Whether `bits` holds `name`. Bits go past 32, so this uses BigInt. */
export function hasBit(bits: number | null | undefined, name: string, table: PermissionTable = BUILTIN_PERMISSIONS): boolean {
  const b = bit(name, table);
  return !!bits && b !== null && (BigInt(bits) & b) === b;
}

/** `bits` with `name` turned on or off. */
export function withPermission(bits: number, name: string, on: boolean, table: PermissionTable = BUILTIN_PERMISSIONS): number {
  const b = bit(name, table);
  if (b === null) return bits;
  const value = on ? BigInt(bits) | b : BigInt(bits) & ~b;
  return Number(value);
}

/** The bits of the named permissions combined. */
export function bitsOf(names: readonly string[], table: PermissionTable = BUILTIN_PERMISSIONS): number {
  return Number(names.reduce((acc, name) => acc | (bit(name, table) ?? 0n), 0n));
}

/** How many of the named permissions `bits` holds. */
export function countPermissions(bits: number, names: readonly string[] = Object.keys(BUILTIN_PERMISSIONS), table: PermissionTable = BUILTIN_PERMISSIONS): number {
  return names.filter((n) => hasBit(bits, n, table)).length;
}

// Overwrites ----------------------------------------------------------------

export type OverwriteScope = 'board' | 'text' | 'voice' | 'category';

const FORUM: PermissionName[] = ['VIEW_BOARDS', 'CREATE_TOPICS', 'REPLY_TO_TOPICS', 'ADD_REACTIONS', 'ATTACH_FILES', 'MANAGE_BOARDS', 'MANAGE_POSTS'];
const CHAT: PermissionName[] = ['VIEW_CHANNELS', 'SEND_MESSAGES', 'ADD_REACTIONS', 'ATTACH_FILES', 'MANAGE_MESSAGES', 'MANAGE_CHANNELS'];
const VOICE: PermissionName[] = ['VIEW_CHANNELS', 'CONNECT_VOICE', 'SPEAK', 'SHARE_SCREEN', 'MUTE_MEMBERS', 'MOVE_MEMBERS', 'MANAGE_CHANNELS'];

/**
 * What an overwrite may allow or deny where it applies, matching the server: forum permissions on
 * boards, chat ones on text channels, voice ones on voice channels and both on categories.
 */
export function overwritablePermissions(scope: OverwriteScope): PermissionName[] {
  switch (scope) {
    case 'board':
      return FORUM;
    case 'text':
      return CHAT;
    case 'voice':
      return VOICE;
    case 'category':
      return [...new Set([...CHAT, ...VOICE])];
  }
}

export type OverwriteState = 'allow' | 'deny' | 'inherit';

export interface OverwriteBits {
  allow: number;
  deny: number;
}

export function overwriteState(ow: OverwriteBits | undefined, name: string, table: PermissionTable = BUILTIN_PERMISSIONS): OverwriteState {
  if (!ow) return 'inherit';
  if (hasBit(ow.allow, name, table)) return 'allow';
  if (hasBit(ow.deny, name, table)) return 'deny';
  return 'inherit';
}

/** The overwrite with one permission set to allow, deny or neither; the two never overlap. */
export function setOverwriteState(ow: OverwriteBits | undefined, name: string, state: OverwriteState, table: PermissionTable = BUILTIN_PERMISSIONS): OverwriteBits {
  const base = ow ?? { allow: 0, deny: 0 };
  return {
    allow: withPermission(base.allow, name, state === 'allow', table),
    deny: withPermission(base.deny, name, state === 'deny', table),
  };
}

export function overwriteCounts(ow: OverwriteBits | undefined, names: readonly string[], table: PermissionTable = BUILTIN_PERMISSIONS): { allowed: number; denied: number } {
  return {
    allowed: names.filter((n) => overwriteState(ow, n, table) === 'allow').length,
    denied: names.filter((n) => overwriteState(ow, n, table) === 'deny').length,
  };
}

// Roles ---------------------------------------------------------------------

export interface RankedRole {
  id: string;
  name: string;
  position: number;
  is_default: boolean;
}

/** The caller's standing in a place, from `GET /places/{place}/permissions/@me`. */
export interface Standing {
  is_owner: boolean;
  top_position: number;
}

/** Highest first, with @everyone last. */
export function sortRoles<T extends RankedRole>(roles: readonly T[]): T[] {
  return [...roles].sort((a, b) => (a.is_default === b.is_default ? b.position - a.position : a.is_default ? 1 : -1));
}

/** Whether the caller may edit, assign or delete a role: the owner always, others only below their highest role. */
export function canManageRole(role: Pick<RankedRole, 'position'>, me: Standing | undefined): boolean {
  if (!me) return false;
  return me.is_owner || me.top_position > role.position;
}

/**
 * The position to send to move a role one step up (-1) or down (+1) the list, or null when it cannot
 * move there: @everyone stays at the bottom, and nobody moves a role to or above their highest role.
 */
export function roleMoveTarget(roles: readonly RankedRole[], id: string, direction: -1 | 1, me: Standing | undefined): number | null {
  const ordered = sortRoles(roles).filter((r) => !r.is_default);
  const i = ordered.findIndex((r) => r.id === id);
  const role = ordered[i];
  const neighbour = ordered[i + direction];
  if (!role || !neighbour || !canManageRole(role, me) || !canManageRole(neighbour, me)) return null;
  return neighbour.position;
}

/** The roles a member can be given or have taken away by the caller. */
export function assignableRoles<T extends RankedRole>(roles: readonly T[], me: Standing | undefined): T[] {
  return sortRoles(roles).filter((r) => !r.is_default && canManageRole(r, me));
}

/** `#rrggbb` for a role color, or null for none (0). */
export function roleColorHex(color: number | null | undefined): string | null {
  if (!color) return null;
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** The integer the API expects for a `#rrggbb` color. */
export function roleColorValue(hex: string | null): number {
  if (!hex) return 0;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? parseInt(m[1]!, 16) : 0;
}
