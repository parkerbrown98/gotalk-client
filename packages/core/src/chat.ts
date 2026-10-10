import type { Schemas } from '@gotalk/api-client';

export type Message = Schemas['Message'];
export type ChatChannel = Schemas['Channel'];
export type ChannelCommand = Schemas['ChannelCommand'];

/** The server's message limit. */
export const MESSAGE_LIMIT = 4_000;
/** Messages from the same author this close together share one header. */
const GROUP_WINDOW_MS = 7 * 60_000;

/** Message ids are UUIDv7: comparing the strings compares creation time. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isAfter(id: string, other: string | null | undefined): boolean {
  return !other || compareIds(id, other) > 0;
}

/** A client nonce (at most 64 characters) the server echoes back, to match an optimistic send with the stored message. */
export function newNonce(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Gateway events describe a message the same way for everyone, so their reactions all say `me: false`.
 * Keeps this user's own flags from the copy already held.
 */
export function keepOwnReactions(incoming: Message, held: Message | undefined): Message {
  if (!held?.reactions?.length) return incoming;
  const mine = new Set(held.reactions.filter((r) => r.me).map((r) => r.emoji));
  if (mine.size === 0) return incoming;
  return { ...incoming, reactions: (incoming.reactions ?? []).map((r) => (mine.has(r.emoji) ? { ...r, me: true } : r)) };
}

/** Adds or replaces messages by id, keeping chronological order and never duplicating one. */
export function mergeMessages(held: readonly Message[], incoming: readonly Message[]): Message[] {
  if (incoming.length === 0) return held as Message[];
  const byId = new Map(held.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, keepOwnReactions(m, byId.get(m.id)));
  return [...byId.values()].sort((a, b) => compareIds(a.id, b.id));
}

/**
 * Applies a reaction event. The user's own reactions are applied optimistically, so an event about
 * them only fixes the flag and never counts twice.
 */
export function applyReaction(message: Message, emoji: string, add: boolean, byMe: boolean): Message {
  const reactions = [...(message.reactions ?? [])];
  const i = reactions.findIndex((r) => r.emoji === emoji);
  const current = i >= 0 ? reactions[i]! : undefined;
  if (byMe && current && current.me === add) return message;
  if (byMe && !current && !add) return message;
  if (add) {
    if (current) reactions[i] = { ...current, count: current.count + 1, me: current.me || byMe };
    else reactions.push({ emoji, count: 1, me: byMe });
  } else if (current) {
    const count = current.count - 1;
    if (count <= 0) reactions.splice(i, 1);
    else reactions[i] = { ...current, count, me: byMe ? false : current.me };
  }
  return { ...message, reactions };
}

export type FeedItem =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'new'; key: string }
  | { kind: 'message'; key: string; message: Message; continued: boolean };

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Today", "Yesterday", or "Saturday 3 October" (with the year when it is not this year). */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (sameDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
  return `${weekday} ${date}`;
}

/** "10:12" (or "10:12 AM", by locale): the time shown next to a message. `compact` drops the day period for the narrow gutter. */
export function clockTime(iso: string, compact = false): string {
  const s = new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return compact ? s.replace(/\s*[ap]\.?\s?m\.?$/i, '') : s;
}

/** The first message after the read position that someone else wrote: where the New marker goes. */
export function firstUnreadId(messages: readonly Message[], lastReadId: string | null | undefined, myId: string | undefined): string | null {
  if (lastReadId === undefined) return null;
  const m = messages.find((x) => isAfter(x.id, lastReadId) && x.author?.id !== myId);
  return m?.id ?? null;
}

/**
 * Lays messages out the way the feed draws them: day dividers, the New marker, and messages that
 * continue the previous one (same author, within a few minutes, not a reply) without a header.
 */
export function buildFeed(messages: readonly Message[], options: { newMarkerBefore?: string | null; now?: Date } = {}): FeedItem[] {
  const now = options.now ?? new Date();
  const out: FeedItem[] = [];
  let prev: Message | undefined;
  for (const m of messages) {
    const at = new Date(m.created_at);
    const newDay = !prev || !sameDay(new Date(prev.created_at), at);
    if (newDay) out.push({ kind: 'day', key: `day-${m.id}`, label: dayLabel(m.created_at, now) });
    const marker = options.newMarkerBefore === m.id;
    if (marker) out.push({ kind: 'new', key: 'new-marker' });
    const continued =
      !!prev &&
      !newDay &&
      !marker &&
      !m.reply_to_id &&
      !!m.author &&
      prev.author?.id === m.author.id &&
      at.getTime() - new Date(prev.created_at).getTime() < GROUP_WINDOW_MS;
    out.push({ kind: 'message', key: m.id, message: m, continued });
    prev = m;
  }
  return out;
}

/** "Jonas P. is typing", "Ana and Jonas are typing", "Ana, Jonas and 2 others are typing". */
export function typingText(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]} are typing`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others are typing`;
}

/** The title of a direct or group conversation: its name, or the other people in it. */
export function conversationTitle(channel: Pick<ChatChannel, 'name' | 'recipients'>, myId: string | undefined): string {
  if (channel.name) return channel.name;
  const others = (channel.recipients ?? []).filter((u) => u.id !== myId);
  if (others.length === 0) return 'Only you';
  if (others.length === 1) return others[0]!.display_name;
  const firsts = others.map((u) => u.display_name.split(/\s+/)[0]);
  return firsts.length <= 3 ? firsts.join(', ') : `${firsts.slice(0, 3).join(', ')} and ${firsts.length - 3} more`;
}

/** Plain one-line preview of Markdown, for conversation lists and reply quotes. */
export function previewText(content: string, max = 120): string {
  const flat = content
    .replace(/```[\s\S]*?```/g, ' [code] ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/\*\*|__|~~|`|\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** `attachments` is how many files go with the message; with any, the text may be empty. */
export function validateMessage(content: string, attachments = 0): string | null {
  if (!content.trim() && attachments === 0) return 'Write something first.';
  if ([...content].length > MESSAGE_LIMIT) return `Messages can be up to ${MESSAGE_LIMIT.toLocaleString('en-US')} characters.`;
  return null;
}

/** The `/name` being typed at the start of the composer, for command suggestions. */
export function commandQuery(text: string): string | null {
  const m = /^\/([a-z0-9_-]{0,32})$/i.exec(text);
  return m ? m[1]!.toLowerCase() : null;
}

/** Splits `a b:"two words" c` into tokens, honoring double quotes. */
function tokenize(text: string): string[] {
  const out: string[] = [];
  const re = /(?:[^\s"]+|"[^"]*")+/g;
  for (const m of text.matchAll(re)) out.push(m[0].replace(/"([^"]*)"/g, '$1'));
  return out;
}

export interface ParsedCommand {
  command: ChannelCommand;
  options: Record<string, string | number | boolean>;
  /** Values that name a user (`@name`) or channel (`#name`) and must be turned into ids before sending. */
  lookups: Array<{ option: string; kind: 'user' | 'channel'; name: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads `/name value option:value …` against the commands available in a channel. Bare values fill
 * the options in order; `option:value` sets one by name. Returns null when the text is not a known
 * command, or a message explaining what is wrong with it.
 */
export function parseCommand(text: string, commands: readonly ChannelCommand[]): ParsedCommand | { error: string } | null {
  const m = /^\/([a-z0-9_-]{1,32})(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!m) return null;
  const name = m[1]!.toLowerCase();
  const matches = commands.filter((c) => c.name === name);
  if (matches.length === 0) return null;
  if (matches.length > 1) return { error: `More than one app offers /${name}. Remove one of them from the place to use it.` };
  const command = matches[0]!;
  const defs = command.options ?? [];
  const raw: Record<string, string> = {};
  const positional: string[] = [];
  for (const token of tokenize(m[2] ?? '')) {
    const named = /^([a-z0-9_-]+):([\s\S]*)$/.exec(token);
    if (named && defs.some((d) => d.name === named[1])) raw[named[1]!] = named[2]!;
    else positional.push(token);
  }
  for (const d of defs) {
    if (positional.length === 0) break;
    if (!(d.name in raw)) raw[d.name] = positional.shift()!;
  }
  if (positional.length > 0) {
    // The last string option takes the rest, so `/note buy more glue` works.
    const last = [...defs].reverse().find((d) => d.type === 'string');
    if (last && last.name in raw) raw[last.name] = [raw[last.name], ...positional].join(' ');
    else return { error: `/${name} does not take "${positional.join(' ')}".` };
  }

  const options: ParsedCommand['options'] = {};
  const lookups: ParsedCommand['lookups'] = [];
  for (const d of defs) {
    const v = raw[d.name];
    if (v === undefined || v === '') {
      if (d.required) return { error: `/${name} needs ${d.name}: ${d.description}` };
      continue;
    }
    switch (d.type) {
      case 'integer': {
        const n = Number(v);
        if (!Number.isInteger(n)) return { error: `${d.name} must be a whole number.` };
        options[d.name] = n;
        break;
      }
      case 'number': {
        const n = Number(v);
        if (!Number.isFinite(n)) return { error: `${d.name} must be a number.` };
        options[d.name] = n;
        break;
      }
      case 'boolean': {
        const b = { true: true, yes: true, on: true, false: false, no: false, off: false }[v.toLowerCase()];
        if (b === undefined) return { error: `${d.name} must be true or false.` };
        options[d.name] = b;
        break;
      }
      case 'user':
      case 'channel': {
        if (UUID.test(v)) options[d.name] = v;
        else lookups.push({ option: d.name, kind: d.type, name: v.replace(d.type === 'user' ? /^@/ : /^#/, '') });
        break;
      }
      default:
        options[d.name] = v;
    }
  }
  return { command, options, lookups };
}

function byPosition(a: ChatChannel, b: ChatChannel): number {
  return a.position - b.position || (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : compareIds(a.id, b.id));
}

export interface ChannelSections {
  /** Text channels outside any category, listed first. */
  loose: ChatChannel[];
  /** Each category with its text channels, then its voice channels. */
  categories: { category: ChatChannel; channels: ChatChannel[] }[];
  /** Voice channels outside any category, listed last under Voice. */
  voice: ChatChannel[];
}

/** A place's channels the way the sidebar lists them, each group in the server's order. */
export function channelSections(channels: readonly ChatChannel[]): ChannelSections {
  const sorted = [...channels].sort(byPosition);
  const categories = sorted.filter((c) => c.kind === 'category').map((category) => ({ category, channels: [] as ChatChannel[] }));
  const byId = new Map(categories.map((c) => [c.category.id, c]));
  const loose: ChatChannel[] = [];
  const voice: ChatChannel[] = [];
  for (const kind of ['text', 'voice'] as const) {
    for (const c of sorted) {
      if (c.kind !== kind) continue;
      const home = c.parent_id ? byId.get(c.parent_id) : undefined;
      if (home) home.channels.push(c);
      else (kind === 'text' ? loose : voice).push(c);
    }
  }
  return { loose, categories, voice };
}

/** Channels ordered alongside this one: same category, and the same kind of row (categories, text or voice). */
export function channelSiblings(channels: readonly ChatChannel[], channel: ChatChannel): ChatChannel[] {
  return channels.filter((c) => c.kind === channel.kind && (c.parent_id ?? null) === (channel.parent_id ?? null)).sort(byPosition);
}

/**
 * The position changes that move a channel one step up or down among its siblings. Siblings keep the
 * positions they had between them, so the order relative to other kinds of rows does not change;
 * ties are spread out so the new order is unambiguous.
 */
export function moveChannel(siblings: readonly ChatChannel[], id: string, direction: -1 | 1): { id: string; position: number }[] {
  const order = [...siblings].sort(byPosition);
  const i = order.findIndex((c) => c.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= order.length) return [];
  const slots = order.map((c) => c.position);
  [order[i], order[j]] = [order[j]!, order[i]!];
  const out: { id: string; position: number }[] = [];
  let previous = -1;
  order.forEach((c, k) => {
    const position = Math.max(slots[k]!, previous + 1);
    previous = position;
    if (position !== c.position) out.push({ id: c.id, position });
  });
  return out;
}
