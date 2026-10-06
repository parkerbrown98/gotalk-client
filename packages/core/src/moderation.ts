import type { Schemas } from '@gotalk/api-client';

export type ReportReason = Schemas['CreateReportRequest']['reason'];
export type ReportStatus = Schemas['Report']['status'];

export const REPORT_REASONS: ReadonlyArray<{ value: ReportReason; label: string; description: string }> = [
  { value: 'spam', label: 'Spam', description: 'Ads, scams or repeated junk' },
  { value: 'harassment', label: 'Harassment', description: 'Attacks or threats against someone' },
  { value: 'inappropriate', label: 'Inappropriate', description: 'Not suitable for this place' },
  { value: 'off_topic', label: 'Off topic', description: 'Belongs somewhere else' },
  { value: 'other', label: 'Other', description: 'Something else; explain below' },
];

export function reportReasonLabel(reason: string): string {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason.replace(/_/g, ' ');
}

export const TIMEOUT_DURATIONS: ReadonlyArray<{ seconds: number; label: string }> = [
  { seconds: 60, label: '60 seconds' },
  { seconds: 300, label: '5 minutes' },
  { seconds: 600, label: '10 minutes' },
  { seconds: 3600, label: '1 hour' },
  { seconds: 86400, label: '1 day' },
  { seconds: 604800, label: '1 week' },
];

/** 0 bans permanently. */
export const BAN_DURATIONS: ReadonlyArray<{ seconds: number; label: string }> = [
  { seconds: 0, label: 'Permanent' },
  { seconds: 86400, label: '1 day' },
  { seconds: 604800, label: '7 days' },
  { seconds: 2592000, label: '30 days' },
];

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** "1 minute", "5 minutes", "2 hours", "7 days": exact units when the length divides evenly, otherwise rounded. */
export function durationPhrase(seconds: number): string {
  const s = Math.round(seconds);
  if (s > 0 && s % 86400 === 0) return plural(s / 86400, 'day');
  if (s > 0 && s % 3600 === 0) return plural(s / 3600, 'hour');
  if (s > 0 && s % 60 === 0) return plural(s / 60, 'minute');
  if (s < 120) return plural(s, 'second');
  if (s < 7200) return plural(Math.round(s / 60), 'minute');
  if (s < 172800) return plural(Math.round(s / 3600), 'hour');
  return plural(Math.round(s / 86400), 'day');
}

/** "2 h left", "5 min left", "3 days left", or null once `until` has passed. */
export function timeLeft(until: string | null | undefined, now: Date = new Date()): string | null {
  if (!until) return null;
  const seconds = (new Date(until).getTime() - now.getTime()) / 1000;
  if (!(seconds > 0)) return null;
  if (seconds < 60) return 'less than a minute left';
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min left`;
  if (seconds < 86400) return `${Math.ceil(seconds / 3600)} h left`;
  const days = Math.ceil(seconds / 86400);
  return `${days} ${days === 1 ? 'day' : 'days'} left`;
}

export function isTimedOut(member: { timeout_until: string | null }, now: Date = new Date()): boolean {
  return !!member.timeout_until && new Date(member.timeout_until).getTime() > now.getTime();
}

/** "Permanent", "Lifts in 6 days", "Lifts in 3 hours", "Lifts soon". */
export function banExpiry(expiresAt: string | null, now: Date = new Date()): string {
  if (!expiresAt) return 'Permanent';
  const seconds = (new Date(expiresAt).getTime() - now.getTime()) / 1000;
  if (seconds < 3600) return 'Lifts soon';
  // A ban set for a day reads as "1 day" even a few minutes after it was made.
  if (seconds >= 23 * 3600) return `Lifts in ${plural(Math.max(1, Math.round(seconds / 86400)), 'day')}`;
  return `Lifts in ${plural(Math.ceil(seconds / 3600), 'hour')}`;
}

// Audit log -----------------------------------------------------------------

/** Filters for the audit log: the server matches an action exactly or by its category, the part before the dot. */
export const AUDIT_CATEGORIES: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'member', label: 'Members' },
  { value: 'role', label: 'Roles' },
  { value: 'channel', label: 'Channels' },
  { value: 'message', label: 'Messages' },
  { value: 'board', label: 'Forums' },
  { value: 'topic', label: 'Topics' },
  { value: 'post', label: 'Posts' },
  { value: 'report', label: 'Reports' },
  { value: 'webhook', label: 'Webhooks' },
  { value: 'place', label: 'Place' },
];

/** Names for the IDs an audit entry refers to, from whatever the screen has loaded. */
export interface AuditNames {
  user?: (id: string) => string | undefined;
  role?: (id: string) => string | undefined;
  channel?: (id: string) => string | undefined;
  board?: (id: string) => string | undefined;
  webhook?: (id: string) => string | undefined;
}

export interface AuditLine {
  /** Who did it; "Gotalk" for actions the server took itself. */
  actor: string;
  /** What they did, to follow the actor's name. */
  summary: string;
  reason: string | null;
  /** Extra context such as the text of a removed message. */
  detail: string | null;
}

type AuditEntry = Pick<Schemas['AuditEntry'], 'action' | 'actor' | 'actor_id' | 'target_id' | 'target_type' | 'reason' | 'metadata'> & { created_at?: string };

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function channelLabel(name: string | undefined, kind?: string): string {
  if (!name) return 'a channel';
  return kind === 'category' ? `the ${name} category` : kind === 'voice' ? `the voice channel ${name}` : `#${name}`;
}

/** One line per audit entry: "Marta K." + "banned Tom R. for 7 days". */
export function describeAuditEntry(entry: AuditEntry, names: AuditNames = {}): AuditLine {
  const m = (entry.metadata ?? {}) as Record<string, unknown>;
  const actor = entry.actor_id ? entry.actor?.display_name || 'Someone' : 'Gotalk';
  const target = entry.target_id ?? undefined;
  const user = (id: unknown) => (typeof id === 'string' ? names.user?.(id) : undefined) ?? 'a former member';
  const who = user(target);
  const role = (id: unknown, fallback?: unknown) => str(fallback) ?? (typeof id === 'string' ? names.role?.(id) : undefined) ?? 'a deleted role';
  const channel = (id: unknown, fallback?: unknown, kind?: unknown) =>
    channelLabel(str(fallback) ?? (typeof id === 'string' ? names.channel?.(id) : undefined), str(kind));
  const board = (id: unknown, fallback?: unknown) => {
    const name = str(fallback) ?? (typeof id === 'string' ? names.board?.(id) : undefined);
    return name ? `the forum ${name}` : 'a forum';
  };
  const webhook = (id: unknown, fallback?: unknown) => {
    const name = str(fallback) ?? (typeof id === 'string' ? names.webhook?.(id) : undefined);
    return name ? `the webhook ${name}` : 'a webhook';
  };
  let summary: string;
  let detail: string | null = null;

  switch (entry.action) {
    case 'member.kick':
      summary = `kicked ${who}`;
      break;
    case 'member.ban': {
      const expires = str(m.expires_at);
      // The server records when the ban lifts; the entry's own time gives its length.
      const span = expires && entry.created_at ? Math.round((Date.parse(expires) - Date.parse(entry.created_at)) / 60_000) * 60 : NaN;
      const seconds = num(m.duration_seconds) ?? (span > 0 ? span : undefined);
      summary = `banned ${who}${seconds ? ` for ${durationPhrase(seconds)}` : expires ? ` until ${new Date(expires).toLocaleDateString(undefined, { dateStyle: 'medium' })}` : ''}`;
      break;
    }
    case 'member.unban':
      summary = `lifted the ban on ${who}`;
      break;
    case 'member.warn':
      summary = `warned ${who}`;
      break;
    case 'member.timeout': {
      const seconds = num(m.duration_seconds);
      summary = `timed out ${who}${seconds ? ` for ${durationPhrase(seconds)}` : ''}`;
      break;
    }
    case 'member.timeout_clear':
      summary = `ended the timeout of ${who}`;
      break;
    case 'member.role_add':
      summary = `gave ${who} the ${role(m.role_id, m.role_name)} role`;
      break;
    case 'member.role_remove':
      summary = `took the ${role(m.role_id, m.role_name)} role from ${who}`;
      break;
    case 'member.nickname':
      summary = str(m.nickname) ? `changed the nickname of ${who} to ${str(m.nickname)}` : `cleared the nickname of ${who}`;
      break;
    case 'member.bot_add':
      summary = `added the bot ${str(m.application_name) ?? who}`;
      break;
    case 'member.voice_mute':
      summary = `muted ${who} in voice`;
      break;
    case 'member.voice_unmute':
      summary = `unmuted ${who} in voice`;
      break;
    case 'member.voice_deafen':
      summary = `deafened ${who} in voice`;
      break;
    case 'member.voice_undeafen':
      summary = `undeafened ${who} in voice`;
      break;
    case 'member.voice_move':
      summary = `moved ${who} to ${channel(m.to_channel_id, undefined, 'voice')}`;
      break;
    case 'member.voice_disconnect':
      summary = `disconnected ${who} from voice`;
      break;
    case 'role.create':
      summary = `created the ${str(m.name) ?? role(target)} role`;
      break;
    case 'role.update': {
      const name = role(target);
      const changed = ['name', 'color', 'permissions', 'position'].filter((k) => k in m);
      if (changed.length === 1 && changed[0] === 'permissions') summary = `changed the permissions of ${name}`;
      else if (changed.length === 1 && changed[0] === 'position') summary = `moved the ${name} role`;
      else if (changed.length === 1 && changed[0] === 'color') summary = `changed the color of ${name}`;
      else if (changed.length === 1 && changed[0] === 'name') summary = `renamed a role to ${str(m.name) ?? name}`;
      else summary = `edited the ${name} role`;
      break;
    }
    case 'role.delete':
      summary = `deleted the ${str(m.name) ?? 'unnamed'} role`;
      break;
    case 'channel.create':
      summary = `created ${channel(target, m.name, m.kind)}`;
      break;
    case 'channel.update':
      summary = `edited ${channel(target, m.name)}`;
      break;
    case 'channel.delete':
      summary = `deleted ${channel(target, m.name, m.kind)}`;
      break;
    case 'channel.overwrite_update':
      summary = `changed the overrides of ${role(m.role_id)} in ${channel(target)}`;
      break;
    case 'channel.overwrite_delete':
      summary = `removed the overrides of ${role(m.role_id)} in ${channel(target)}`;
      break;
    case 'board.create':
      summary = `created ${board(target, m.name)}`;
      break;
    case 'board.update':
      summary = `edited ${board(target, m.name)}`;
      break;
    case 'board.delete':
      summary = `deleted ${board(target, m.name)}`;
      break;
    case 'board.overwrite_update':
      summary = `changed the overrides of ${role(m.role_id)} in ${board(target)}`;
      break;
    case 'board.overwrite_delete':
      summary = `removed the overrides of ${role(m.role_id)} in ${board(target)}`;
      break;
    case 'message.delete':
      summary = `removed a message by ${user(m.author_id)} in ${channel(m.channel_id)}`;
      detail = str(m.content) ?? null;
      break;
    case 'message.pin':
      summary = `pinned a message in ${channel(m.channel_id)}`;
      break;
    case 'message.unpin':
      summary = `unpinned a message in ${channel(m.channel_id)}`;
      break;
    case 'topic.update': {
      const title = str(m.title) ? `“${str(m.title)}”` : 'a topic';
      if (m.is_pinned === true) summary = `pinned ${title}`;
      else if (m.is_pinned === false) summary = `unpinned ${title}`;
      else if (m.is_locked === true) summary = `locked ${title}`;
      else if (m.is_locked === false) summary = `unlocked ${title}`;
      else if (m.is_archived === true) summary = `archived ${title}`;
      else if (m.is_archived === false) summary = `unarchived ${title}`;
      else if ('to_board_id' in m) summary = `moved ${title} to ${board(m.to_board_id)}`;
      else summary = `edited ${title}`;
      break;
    }
    case 'topic.delete':
      summary = `deleted the topic ${str(m.title) ? `“${str(m.title)}”` : ''}`.trim();
      break;
    case 'post.edit':
      summary = `edited a post by ${user(m.author_id)}`;
      break;
    case 'post.delete':
      summary = `deleted a post by ${user(m.author_id)}`;
      break;
    case 'report.resolve':
      summary = m.user_id ? `resolved a report about ${user(m.user_id)}` : 'resolved a report';
      break;
    case 'report.dismiss':
      summary = m.user_id ? `dismissed a report about ${user(m.user_id)}` : 'dismissed a report';
      break;
    case 'place.update': {
      const keys = Object.keys(m);
      summary = keys.length === 1 && keys[0] === 'name' ? `renamed the place to ${str(m.name)}` : 'changed the place settings';
      break;
    }
    case 'place.transfer':
      summary = `handed the place over to ${who}`;
      break;
    case 'webhook.create':
      summary = `created ${webhook(target, m.name)}`;
      break;
    case 'webhook.update':
      summary = m.active === false ? `turned off ${webhook(target, m.name)}` : m.active === true ? `turned on ${webhook(target, m.name)}` : `edited ${webhook(target, m.name)}`;
      break;
    case 'webhook.delete':
      summary = `deleted ${webhook(target, m.name)}`;
      break;
    case 'webhook.rotate_secret':
      summary = `replaced the signing secret of ${webhook(target, m.name)}`;
      break;
    case 'webhook.disable':
      summary = `turned off ${webhook(target, m.name)} after repeated failures`;
      break;
    default:
      summary = `did ${entry.action.replace(/[._]/g, ' ')}`;
  }
  return { actor, summary, reason: str(entry.reason) ?? null, detail };
}

/** The user IDs an entry refers to, so a screen can look their names up. */
export function auditUserIds(entry: Pick<Schemas['AuditEntry'], 'target_type' | 'target_id' | 'metadata'>): string[] {
  const m = (entry.metadata ?? {}) as Record<string, unknown>;
  const ids = [entry.target_type === 'user' ? entry.target_id : null, m.author_id, m.user_id];
  return ids.filter((id): id is string => typeof id === 'string' && !!id);
}

// Transparency --------------------------------------------------------------

export const TRANSPARENCY_PERIODS: ReadonlyArray<{ value: string; label: string; days: number }> = [
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '90', label: '90 days', days: 90 },
  { value: '365', label: '12 months', days: 365 },
];

/** The `since` and `until` query values for a period ending now. */
export function transparencyRange(days: number, now: Date = new Date()): { since: string; until: string } {
  return { since: new Date(now.getTime() - days * 86400_000).toISOString(), until: now.toISOString() };
}

const ACTION_LABELS: Record<string, string> = {
  'member.warn': 'Warnings',
  'member.timeout': 'Timeouts',
  'member.kick': 'Kicks',
  'member.ban': 'Bans',
  'member.unban': 'Bans lifted',
  'member.voice_disconnect': 'Voice disconnects',
  'message.delete': 'Messages removed',
  'post.delete': 'Posts removed',
  'topic.delete': 'Topics removed',
  'report.resolve': 'Reports resolved',
  'report.dismiss': 'Reports dismissed',
};

export function transparencyActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Rows for a breakdown, largest first, with labels and each row's share of the largest. */
export function breakdownRows(counts: Record<string, number> | null | undefined, label: (key: string) => string): Array<{ key: string; label: string; count: number; share: number }> {
  const entries = Object.entries(counts ?? {}).filter(([, n]) => n > 0);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return entries
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, label: label(key), count, share: count / max }));
}

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = { open: 'Open', resolved: 'Resolved', dismissed: 'Dismissed' };
