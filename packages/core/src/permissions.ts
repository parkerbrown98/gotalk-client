/** Place-level permission names the server defines (`GET /permissions`). */
export type PermissionName =
  | 'ADMINISTRATOR'
  | 'MANAGE_PLACE'
  | 'MANAGE_ROLES'
  | 'CREATE_INVITES'
  | 'MANAGE_INVITES'
  | 'KICK_MEMBERS'
  | 'BAN_MEMBERS'
  | 'CHANGE_NICKNAME'
  | 'MANAGE_NICKNAMES'
  | 'VIEW_AUDIT_LOG'
  | 'MODERATE_MEMBERS'
  | 'MANAGE_REPORTS'
  | 'MANAGE_WEBHOOKS'
  | 'VIEW_BOARDS'
  | 'CREATE_TOPICS'
  | 'REPLY_TO_TOPICS'
  | 'ADD_REACTIONS'
  | 'ATTACH_FILES'
  | 'MANAGE_BOARDS'
  | 'MANAGE_POSTS'
  | 'VIEW_CHANNELS'
  | 'SEND_MESSAGES'
  | 'MANAGE_MESSAGES'
  | 'MANAGE_CHANNELS'
  | 'CONNECT_VOICE'
  | 'SPEAK'
  | 'SHARE_SCREEN'
  | 'MUTE_MEMBERS'
  | 'MOVE_MEMBERS';

export type PermissionTable = Readonly<Record<string, number>>;

/** Bit values as of this client's API version; replaced by the instance's own table once it loads. */
export const BUILTIN_PERMISSIONS: Readonly<Record<PermissionName, number>> = {
  ADMINISTRATOR: 2 ** 0,
  MANAGE_PLACE: 2 ** 1,
  MANAGE_ROLES: 2 ** 2,
  CREATE_INVITES: 2 ** 3,
  MANAGE_INVITES: 2 ** 4,
  KICK_MEMBERS: 2 ** 5,
  BAN_MEMBERS: 2 ** 6,
  CHANGE_NICKNAME: 2 ** 7,
  MANAGE_NICKNAMES: 2 ** 8,
  VIEW_AUDIT_LOG: 2 ** 9,
  MODERATE_MEMBERS: 2 ** 10,
  MANAGE_REPORTS: 2 ** 11,
  MANAGE_WEBHOOKS: 2 ** 12,
  VIEW_BOARDS: 2 ** 16,
  CREATE_TOPICS: 2 ** 17,
  REPLY_TO_TOPICS: 2 ** 18,
  ADD_REACTIONS: 2 ** 19,
  ATTACH_FILES: 2 ** 20,
  MANAGE_BOARDS: 2 ** 21,
  MANAGE_POSTS: 2 ** 22,
  VIEW_CHANNELS: 2 ** 24,
  SEND_MESSAGES: 2 ** 25,
  MANAGE_MESSAGES: 2 ** 26,
  MANAGE_CHANNELS: 2 ** 27,
  CONNECT_VOICE: 2 ** 32,
  SPEAK: 2 ** 33,
  SHARE_SCREEN: 2 ** 34,
  MUTE_MEMBERS: 2 ** 35,
  MOVE_MEMBERS: 2 ** 36,
};

/** Turns the `GET /permissions` list into a lookup table. */
export function permissionTable(definitions: ReadonlyArray<{ name: string; value: number }> | null | undefined): PermissionTable {
  if (!definitions?.length) return BUILTIN_PERMISSIONS;
  return Object.fromEntries(definitions.map((d) => [d.name, d.value]));
}

/**
 * Whether `bits` (a `my_permissions` value) holds every named permission. Bits go past 32, where
 * JavaScript's `&` stops working, so this uses BigInt. The server already folds owner and
 * administrator into the value it sends, and stays authoritative: this only hides actions.
 */
export function hasPermission(bits: number | null | undefined, names: PermissionName | PermissionName[], table: PermissionTable = BUILTIN_PERMISSIONS): boolean {
  if (!bits) return false;
  const have = BigInt(bits);
  return (Array.isArray(names) ? names : [names]).every((name) => {
    const bit = table[name];
    return bit !== undefined && (have & BigInt(bit)) === BigInt(bit);
  });
}
