import { ApiError, unwrap, type GotalkClient, type Schemas } from '@gotalk/api-client';
import { applyReaction, compareIds, isAfter, keepOwnReactions, mergeMessages, newNonce, type Message, type ParsedCommand } from '@gotalk/core';
import { useInfiniteQuery, useQueries, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { useApiClient } from './api';
import { useSession } from './auth';
import { isGatewayReady } from './connection';
import { failureMessage } from './failure';
import { useActiveInstance } from './instances';

export type Channel = Schemas['Channel'];
export type User = Schemas['User'];
export type { Message };

export const MESSAGE_PAGE = 50;

/**
 * A page of history in chronological order. Whether older history exists, and the cursor for it, are
 * recorded when the page is fetched: deleting a message later must not make the page look like the end.
 */
export interface MessagePage {
  items: Message[];
  more: boolean;
  cursor: string | undefined;
}

/** Newest page first. */
export type MessagePages = InfiniteData<MessagePage, string | undefined>;

export function pageOf(items: Message[], limit: number): MessagePage {
  return { items, more: items.length >= limit, cursor: items[0]?.id };
}

/** Every chat query is keyed by instance second, so signing out of an instance drops them all. */
export const chatKeys = {
  messages: (inst: string | undefined, channelId: string | undefined) => ['messages', inst, channelId] as const,
  allMessages: (inst: string) => ['messages', inst] as const,
  channel: (inst: string | undefined, channelId: string | undefined) => ['channel', inst, channelId] as const,
  placeChannels: (inst: string) => ['channels', inst] as const,
  dms: (inst: string | undefined) => ['dms', inst] as const,
  pins: (inst: string | undefined, channelId: string | undefined) => ['pins', inst, channelId] as const,
  receipts: (inst: string | undefined, channelId: string | undefined) => ['receipts', inst, channelId] as const,
  revisions: (inst: string | undefined, messageId: string | undefined) => ['message-revisions', inst, messageId] as const,
  members: (inst: string | undefined, slug: string | undefined) => ['members', inst, slug] as const,
  commands: (inst: string | undefined, channelId: string | undefined) => ['commands', inst, channelId] as const,
  lastMessage: (inst: string | undefined, channelId: string, messageId: string | null | undefined) => ['last-message', inst, channelId, messageId] as const,
};

// ---- Cache writers, shared by mutations and gateway events ----

type PagesChange = (d: MessagePages) => MessagePages;

/**
 * Changes made to a channel's history while it is being fetched. The fetch result replaces whatever the
 * cache held, so these are applied again once it lands; otherwise an event that arrived mid-fetch would
 * be lost for good. Each change must be safe to apply twice.
 */
const replays = new Map<string, { changes: PagesChange[]; after: (() => void)[] }>();
const replaying = new WeakSet<QueryClient>();

function replayAfterFetches(qc: QueryClient) {
  if (replaying.has(qc)) return;
  replaying.add(qc);
  qc.getQueryCache().subscribe((e) => {
    if (e.type !== 'updated') return;
    const pending = replays.get(e.query.queryHash);
    if (!pending) return;
    // setQueryData also reports success, marked manual; only a finished fetch replaces the data.
    if (e.action.type === 'success' && !(e.action as { manual?: boolean }).manual) {
      replays.delete(e.query.queryHash);
      qc.setQueryData<MessagePages>(e.query.queryKey, (d) => (d ? pending.changes.reduce((acc, change) => change(acc), d) : d));
      for (const run of pending.after) run();
    } else if (e.action.type === 'error') replays.delete(e.query.queryHash);
  });
}

function pendingFor(qc: QueryClient, inst: string, channelId: string) {
  replayAfterFetches(qc);
  const query = qc.getQueryCache().find({ queryKey: chatKeys.messages(inst, channelId), exact: true });
  if (query?.state.fetchStatus !== 'fetching') return null;
  let pending = replays.get(query.queryHash);
  if (!pending) replays.set(query.queryHash, (pending = { changes: [], after: [] }));
  return pending;
}

function changeMessages(qc: QueryClient, inst: string, channelId: string, change: PagesChange): void {
  pendingFor(qc, inst, channelId)?.changes.push(change);
  qc.setQueryData<MessagePages>(chatKeys.messages(inst, channelId), (d) => (d ? change(d) : d));
}

/**
 * Runs `refresh` once a fetch of the channel in progress has landed, or not at all when none is. For
 * changes that are not safe to apply twice, such as reaction counts.
 */
export function afterFetch(qc: QueryClient, inst: string, channelId: string, refresh: () => void): boolean {
  const pending = pendingFor(qc, inst, channelId);
  pending?.after.push(refresh);
  return !!pending;
}

/** Adds messages to the newest page of a channel that is loaded; never duplicates one held in an older page. */
export function insertMessages(qc: QueryClient, inst: string, channelId: string, messages: Message[]): void {
  if (messages.length === 0) return;
  changeMessages(qc, inst, channelId, (d) => {
    if (d.pages.length === 0) return d;
    const [newest, ...older] = d.pages;
    const held = new Set(older.flatMap((p) => p.items.map((m) => m.id)));
    const fresh = messages.filter((m) => !held.has(m.id));
    return fresh.length ? { ...d, pages: [{ ...newest!, items: mergeMessages(newest!.items, fresh) }, ...older] } : d;
  });
}

/** Replaces one message wherever it is held. `apply` runs again after a fetch in progress, so it must be idempotent. */
export function patchMessage(qc: QueryClient, inst: string, channelId: string, messageId: string, apply: (m: Message) => Message): void {
  changeMessages(qc, inst, channelId, (d) => ({
    ...d,
    pages: d.pages.map((p) => (p.items.some((m) => m.id === messageId) ? { ...p, items: p.items.map((m) => (m.id === messageId ? apply(m) : m)) } : p)),
  }));
  qc.setQueryData<Message[]>(chatKeys.pins(inst, channelId), (pins) => pins?.map((m) => (m.id === messageId ? apply(m) : m)));
}

export function removeMessage(qc: QueryClient, inst: string, channelId: string, messageId: string): void {
  changeMessages(qc, inst, channelId, (d) => ({ ...d, pages: d.pages.map((p) => (p.items.some((m) => m.id === messageId) ? { ...p, items: p.items.filter((m) => m.id !== messageId) } : p)) }));
  qc.setQueryData<Message[]>(chatKeys.pins(inst, channelId), (pins) => pins?.filter((m) => m.id !== messageId));
}

/** Finds a held message anywhere in a channel's pages. */
export function findMessage(qc: QueryClient, inst: string, channelId: string, messageId: string): Message | undefined {
  const d = qc.getQueryData<MessagePages>(chatKeys.messages(inst, channelId));
  for (const p of d?.pages ?? []) for (const m of p.items) if (m.id === messageId) return m;
  return undefined;
}

/** Every message held for a channel, oldest first. */
export function heldMessages(d: InfiniteData<MessagePage, unknown> | undefined): Message[] {
  return d ? [...d.pages].reverse().flatMap((p) => p.items) : [];
}

/** Most recent activity first. */
export function sortConversations(list: Channel[]): Channel[] {
  const at = (c: Channel) => c.last_message_at ?? c.created_at;
  return [...list].sort((a, b) => (at(a) < at(b) ? 1 : at(a) > at(b) ? -1 : compareIds(b.id, a.id)));
}

/** Applies a change to a channel wherever it is cached: place channel lists, the conversation list and the channel itself. */
export function patchChannel(qc: QueryClient, inst: string, channelId: string, apply: (c: Channel) => Channel): void {
  qc.setQueriesData<Channel[]>({ queryKey: chatKeys.placeChannels(inst) }, (list) =>
    list?.some((c) => c.id === channelId) ? list.map((c) => (c.id === channelId ? apply(c) : c)) : list,
  );
  qc.setQueryData<Channel[]>(chatKeys.dms(inst), (list) => (list?.some((c) => c.id === channelId) ? sortConversations(list.map((c) => (c.id === channelId ? apply(c) : c))) : list));
  qc.setQueryData<Channel>(chatKeys.channel(inst, channelId), (c) => (c ? apply(c) : c));
}

/** A channel with its read position moved; `unread` follows from the last message. */
export function withReadState(c: Channel, lastReadId: string | null, mentionCount: number): Channel {
  const unread = !!c.last_message_id && isAfter(c.last_message_id, lastReadId);
  return { ...c, read_state: { last_read_message_id: lastReadId, mention_count: mentionCount }, unread };
}

/**
 * Counts a new message against a channel's unread state, the way the server will. A message already
 * counted (the send response after its gateway event) or older than the last one changes nothing.
 */
export function countMessage(c: Channel, m: Message, myId: string | undefined): Channel {
  if (!isAfter(m.id, c.last_message_id)) return c;
  const next: Channel = { ...c, last_message_id: m.id, last_message_at: m.created_at, message_count: c.message_count + 1 };
  if (!c.read_state) return next;
  if (m.author?.id === myId) return withReadState(next, m.id, 0);
  const direct = c.kind === 'dm' || c.kind === 'group_dm';
  const mentioned = direct || (!!myId && (m.mentions ?? []).includes(myId));
  return { ...next, unread: true, read_state: { ...c.read_state, mention_count: c.read_state.mention_count + (mentioned ? 1 : 0) } };
}

// ---- Queries ----

function useChatContext() {
  const active = useActiveInstance();
  const client = useApiClient();
  return { inst: active?.id, client };
}

/** Message history of a channel, newest page first; gateway events keep it current, so it never goes stale on its own. */
export function useMessages(channelId: string | undefined) {
  const { inst, client } = useChatContext();
  const query = useInfiniteQuery({
    queryKey: chatKeys.messages(inst, channelId),
    enabled: !!client && !!channelId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      pageOf(unwrap(await client!.GET('/channels/{channelID}/messages', { params: { path: { channelID: channelId! }, query: { before: pageParam, limit: MESSAGE_PAGE } } })) ?? [], MESSAGE_PAGE),
    getNextPageParam: (oldest) => (oldest.more ? oldest.cursor : undefined),
    staleTime: Infinity,
  });
  const messages = useMemo(() => heldMessages(query.data), [query.data]);
  return { ...query, messages };
}

/** One channel with the caller's permissions and read state: place channels, threads and conversations alike. */
export function useChannel(channelId: string | undefined) {
  const { inst, client } = useChatContext();
  return useQuery({
    queryKey: chatKeys.channel(inst, channelId),
    enabled: !!client && !!channelId,
    staleTime: 30_000,
    queryFn: async () => unwrap(await client!.GET('/channels/{channelID}', { params: { path: { channelID: channelId! } } })),
  });
}

/** Direct and group conversations, most recent first. */
export function useConversations() {
  const { inst, client } = useChatContext();
  const session = useSession();
  return useQuery({
    queryKey: chatKeys.dms(inst),
    enabled: !!client && !!session,
    staleTime: 60_000,
    queryFn: async () => sortConversations(unwrap(await client!.GET('/users/@me/channels', { params: { query: { limit: 100 } } })).items ?? []),
  });
}

/** Unread direct messages, for the Messages badges. */
export function useUnreadConversations(): number {
  const list = useConversations().data;
  return useMemo(() => (list ?? []).reduce((n, c) => n + (c.read_state?.mention_count ?? 0), 0), [list]);
}

export function usePins(channelId: string | undefined, enabled: boolean) {
  const { inst, client } = useChatContext();
  return useQuery({
    queryKey: chatKeys.pins(inst, channelId),
    enabled: !!client && !!channelId && enabled,
    queryFn: async () => unwrap(await client!.GET('/channels/{channelID}/pins', { params: { path: { channelID: channelId! } } })) ?? [],
  });
}

/** How far the other people in a direct conversation have read. */
export function useReceipts(channelId: string | undefined, enabled: boolean) {
  const { inst, client } = useChatContext();
  return useQuery({
    queryKey: chatKeys.receipts(inst, channelId),
    enabled: !!client && !!channelId && enabled,
    queryFn: async () => unwrap(await client!.GET('/channels/{channelID}/receipts', { params: { path: { channelID: channelId! } } })) ?? [],
  });
}

export function useMessageRevisions(messageId: string | undefined) {
  const { inst, client } = useChatContext();
  return useQuery({
    queryKey: chatKeys.revisions(inst, messageId),
    enabled: !!client && !!messageId,
    queryFn: async () => unwrap(await client!.GET('/messages/{messageID}/revisions', { params: { path: { messageID: messageId! } } })) ?? [],
  });
}

/** The first hundred members of a place, for the member list. */
export function usePlaceMembers(slug: string | undefined, enabled: boolean) {
  const { inst, client } = useChatContext();
  return useQuery({
    queryKey: chatKeys.members(inst, slug),
    enabled: !!client && !!slug && enabled,
    staleTime: 60_000,
    queryFn: async () => unwrap(await client!.GET('/places/{place}/members', { params: { path: { place: slug! }, query: { limit: 100 } } })).items ?? [],
  });
}

/** Display names of place members by id, for people who have not written anything yet (typing indicators). */
export function useMemberNames(placeId: string | null | undefined, userIds: readonly string[]): Record<string, string> {
  const { inst, client } = useChatContext();
  const combine = useCallback((results: { data?: Schemas['Member'] }[]) => {
    const out: Record<string, string> = {};
    for (const r of results) if (r.data) out[r.data.user.id] = r.data.nickname ?? r.data.user.display_name;
    return out;
  }, []);
  return useQueries({
    queries: userIds.map((id) => ({
      queryKey: ['member', inst, placeId, id],
      enabled: !!client && !!placeId,
      staleTime: 10 * 60_000,
      queryFn: async () => unwrap(await client!.GET('/places/{place}/members/{userID}', { params: { path: { place: placeId!, userID: id } } })),
    })),
    combine,
  });
}

/** One message, from a loaded channel when possible: the message a thread started from. */
export function useMessage(messageId: string | null | undefined, channelId: string | null | undefined) {
  const { inst, client } = useChatContext();
  const qc = useQueryClient();
  const held = inst && channelId && messageId ? findMessage(qc, inst, channelId, messageId) : undefined;
  const query = useQuery({
    queryKey: ['message', inst, messageId],
    enabled: !!client && !!messageId && !held,
    queryFn: async () => unwrap(await client!.GET('/messages/{messageID}', { params: { path: { messageID: messageId! } } })),
  });
  return held ?? query.data;
}

/**
 * The newest message of a conversation, for its preview line. Keyed by the conversation's last message
 * id, so it is fetched once per new message, and not at all when the gateway already delivered it.
 */
export function useLastMessage(channel: Channel, enabled: boolean): Message | undefined {
  const { inst, client } = useChatContext();
  const qc = useQueryClient();
  const lastId = channel.last_message_id;
  const held = inst && lastId ? findMessage(qc, inst, channel.id, lastId) : undefined;
  const query = useQuery({
    queryKey: chatKeys.lastMessage(inst, channel.id, lastId),
    enabled: !!client && !!lastId && !held && enabled,
    staleTime: Infinity,
    queryFn: async () => (unwrap(await client!.GET('/channels/{channelID}/messages', { params: { path: { channelID: channel.id }, query: { limit: 1 } } })) ?? [])[0] ?? null,
  });
  return held ?? query.data ?? undefined;
}

/** Slash commands of the bots that can see a channel. */
export function useChannelCommands(channelId: string | undefined, enabled: boolean) {
  const { inst, client } = useChatContext();
  return useQuery({
    queryKey: chatKeys.commands(inst, channelId),
    enabled: !!client && !!channelId && enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => unwrap(await client!.GET('/channels/{channelID}/commands', { params: { path: { channelID: channelId! } } })) ?? [],
  });
}

// ---- Outbox: messages on their way to the server ----

/**
 * `sending`: the request is out, or waiting for the connection to come back (shown the same way).
 * `failed`: the server refused it or the request failed while connected; the person chooses retry or delete.
 */
export type OutgoingState = 'sending' | 'queued' | 'failed';

export interface OutgoingMessage {
  nonce: string;
  instanceId: string;
  channelId: string;
  content: string;
  replyTo: Message | null;
  createdAt: string;
  /** The newest message held for the channel when this was written; only later ones can be its echo. */
  afterId: string | null;
  state: OutgoingState;
  error?: string;
}

/** Kept in memory only: a reload drops unsent messages. */
export const outboxStore = createStore<{ items: OutgoingMessage[] }>(() => ({ items: [] }));

const outbox = {
  add: (item: OutgoingMessage) => outboxStore.setState((s) => ({ items: [...s.items, item] })),
  update: (nonce: string, patch: Partial<OutgoingMessage>) => outboxStore.setState((s) => ({ items: s.items.map((i) => (i.nonce === nonce ? { ...i, ...patch } : i)) })),
  remove: (nonce: string) => outboxStore.setState((s) => ({ items: s.items.filter((i) => i.nonce !== nonce) })),
  get: (nonce: string) => outboxStore.getState().items.find((i) => i.nonce === nonce),
};

/** A message the server stored: whatever optimistic copy it had is no longer needed. */
export function settleOutgoing(nonce: string | undefined): void {
  if (nonce && outbox.get(nonce)) outbox.remove(nonce);
}

export function useOutbox(channelId: string | undefined): OutgoingMessage[] {
  const inst = useActiveInstance()?.id;
  const items = useStore(outboxStore, (s) => s.items);
  return useMemo(() => items.filter((i) => i.instanceId === inst && i.channelId === channelId), [items, inst, channelId]);
}

// ---- Mutations ----

export interface ChatContext {
  qc: QueryClient;
  client: GotalkClient;
  inst: string;
  myId: string | undefined;
}

/** Chat mutations. Each writes its result into the cache right away; the matching gateway event is then a no-op. */
/** Instances whose queued messages are being sent right now. */
const flushing = new Set<string>();

export function chatActions({ qc, client, inst, myId }: ChatContext) {
  async function deliver(item: OutgoingMessage) {
    outbox.update(item.nonce, { state: 'sending', error: undefined });
    try {
      const m = unwrap(
        await client.POST('/channels/{channelID}/messages', {
          params: { path: { channelID: item.channelId } },
          body: { content: item.content, nonce: item.nonce, reply_to_id: item.replyTo?.id },
        }),
      );
      insertMessages(qc, inst, item.channelId, [m]);
      if (!m.place_id) qc.setQueryData(chatKeys.lastMessage(inst, m.channel_id, m.id), m);
      patchChannel(qc, inst, item.channelId, (c) => countMessage(c, m, myId));
      outbox.remove(item.nonce);
    } catch (e) {
      if (!outbox.get(item.nonce)) return;
      // Offline: hold it until the gateway is back. Anything else needs a decision from the person.
      if (!(e instanceof ApiError) && !isGatewayReady(inst)) outbox.update(item.nonce, { state: 'queued' });
      else outbox.update(item.nonce, { state: 'failed', error: failureMessage(e, 'Not sent.') });
    }
  }

  return {
    send(channelId: string, content: string, replyTo: Message | null = null) {
      const afterId = heldMessages(qc.getQueryData<MessagePages>(chatKeys.messages(inst, channelId))).at(-1)?.id ?? null;
      const item: OutgoingMessage = { nonce: newNonce(), instanceId: inst, channelId, content, replyTo, createdAt: new Date().toISOString(), afterId, state: 'sending' };
      outbox.add(item);
      void deliver(item);
    },
    retry(nonce: string) {
      const item = outbox.get(nonce);
      if (item) void deliver(item);
    },
    discard(nonce: string) {
      outbox.remove(nonce);
    },
    /**
     * Sends what waited for the connection. A request may have reached the server before the
     * connection dropped, so anything already in the (caught-up) history is not sent twice.
     */
    async flushQueued() {
      // A reconnect during a flush starts another; one at a time, so nothing goes out twice.
      if (flushing.has(inst)) return;
      flushing.add(inst);
      const tried = new Set<string>();
      try {
        for (;;) {
          const item = outboxStore.getState().items.find((i) => i.instanceId === inst && i.state === 'queued' && !tried.has(i.nonce));
          if (!item) return;
          tried.add(item.nonce);
          const held = heldMessages(qc.getQueryData<MessagePages>(chatKeys.messages(inst, item.channelId)));
          const landed = held.some((m) => m.author?.id === myId && m.content === item.content && isAfter(m.id, item.afterId));
          if (landed) outbox.remove(item.nonce);
          else await deliver(item);
        }
      } finally {
        flushing.delete(inst);
      }
    },
    async edit(message: Message, content: string) {
      const next = unwrap(await client.PATCH('/messages/{messageID}', { params: { path: { messageID: message.id } }, body: { content } }));
      patchMessage(qc, inst, message.channel_id, message.id, (held) => keepOwnReactions(next, held));
      await qc.invalidateQueries({ queryKey: chatKeys.revisions(inst, message.id) });
      return next;
    },
    async remove(message: Message, reason?: string) {
      unwrap(await client.DELETE('/messages/{messageID}', { params: { path: { messageID: message.id }, query: { reason: reason?.trim() || undefined } } }));
      removeMessage(qc, inst, message.channel_id, message.id);
    },
    async react(message: Message, emoji: string, on: boolean) {
      const flip = (m: Message, add: boolean) => applyReaction(m, emoji, add, true);
      patchMessage(qc, inst, message.channel_id, message.id, (m) => flip(m, on));
      const params = { params: { path: { messageID: message.id, emoji } } };
      try {
        unwrap(on ? await client.PUT('/messages/{messageID}/reactions/{emoji}', params) : await client.DELETE('/messages/{messageID}/reactions/{emoji}', params));
      } catch (e) {
        patchMessage(qc, inst, message.channel_id, message.id, (m) => flip(m, !on));
        throw e;
      }
    },
    async pin(message: Message, on: boolean) {
      const params = { params: { path: { channelID: message.channel_id, messageID: message.id } } };
      unwrap(on ? await client.PUT('/channels/{channelID}/pins/{messageID}', params) : await client.DELETE('/channels/{channelID}/pins/{messageID}', params));
      patchMessage(qc, inst, message.channel_id, message.id, (m) => ({ ...m, is_pinned: on, pinned_at: on ? new Date().toISOString() : null }));
      await qc.invalidateQueries({ queryKey: chatKeys.pins(inst, message.channel_id) });
    },
    async startThread(message: Message, name: string) {
      const thread = unwrap(await client.POST('/channels/{channelID}/threads', { params: { path: { channelID: message.channel_id } }, body: { message_id: message.id, name } }));
      qc.setQueryData(chatKeys.channel(inst, thread.id), thread);
      patchMessage(qc, inst, message.channel_id, message.id, (m) => ({
        ...m,
        thread: { id: thread.id, name: thread.name, message_count: thread.message_count, last_message_at: thread.last_message_at, is_archived: thread.is_archived },
      }));
      return thread;
    },
    async markRead(channelId: string, messageId: string) {
      const state = unwrap(await client.PUT('/channels/{channelID}/read', { params: { path: { channelID: channelId } }, body: { message_id: messageId } }));
      patchChannel(qc, inst, channelId, (c) => withReadState(c, state.last_read_message_id, state.mention_count));
      // Reading a channel also reads the notifications it caused.
      await qc.invalidateQueries({ queryKey: ['notifications-unread', inst] });
    },
    async typing(channelId: string) {
      await client.POST('/channels/{channelID}/typing', { params: { path: { channelID: channelId } } }).catch(() => undefined);
    },
    async openConversation(recipientIds: string[], name?: string) {
      const channel = unwrap(await client.POST('/users/@me/channels', { body: { recipient_ids: recipientIds, name: name?.trim() || undefined } }));
      qc.setQueryData<Channel[]>(chatKeys.dms(inst), (list) => (list ? sortConversations([channel, ...list.filter((c) => c.id !== channel.id)]) : list));
      qc.setQueryData(chatKeys.channel(inst, channel.id), channel);
      return channel;
    },
    async addRecipient(channelId: string, userId: string) {
      const channel = unwrap(await client.PUT('/channels/{channelID}/recipients/{userID}', { params: { path: { channelID: channelId, userID: userId } } }));
      qc.setQueryData(chatKeys.channel(inst, channelId), channel);
      await qc.invalidateQueries({ queryKey: chatKeys.dms(inst) });
      return channel;
    },
    async leaveConversation(channelId: string) {
      if (!myId) return;
      unwrap(await client.DELETE('/channels/{channelID}/recipients/{userID}', { params: { path: { channelID: channelId, userID: myId } } }));
      qc.setQueryData<Channel[]>(chatKeys.dms(inst), (list) => list?.filter((c) => c.id !== channelId));
      qc.removeQueries({ queryKey: chatKeys.messages(inst, channelId) });
      qc.removeQueries({ queryKey: chatKeys.channel(inst, channelId) });
    },
    async createChannel(slug: string, input: Schemas['CreateChannelRequest']) {
      const channel = unwrap(await client.POST('/places/{place}/channels', { params: { path: { place: slug } }, body: input }));
      await qc.invalidateQueries({ queryKey: chatKeys.placeChannels(inst) });
      return channel;
    },
    async updateChannel(channelId: string, patch: Schemas['UpdateChannelRequest']) {
      const channel = unwrap(await client.PATCH('/channels/{channelID}', { params: { path: { channelID: channelId } }, body: patch }));
      patchChannel(qc, inst, channelId, (held) => ({ ...held, ...channel }));
      await qc.invalidateQueries({ queryKey: chatKeys.placeChannels(inst) });
      return channel;
    },
    /** Moves a channel one step among its siblings; see `moveChannel` in core. */
    async reorderChannels(changes: { id: string; position: number }[]) {
      for (const c of changes) unwrap(await client.PATCH('/channels/{channelID}', { params: { path: { channelID: c.id } }, body: { position: c.position } }));
      await qc.invalidateQueries({ queryKey: chatKeys.placeChannels(inst) });
    },
    async deleteChannel(channelId: string) {
      unwrap(await client.DELETE('/channels/{channelID}', { params: { path: { channelID: channelId } } }));
      qc.setQueriesData<Channel[]>({ queryKey: chatKeys.placeChannels(inst) }, (list) => list?.filter((c) => c.id !== channelId));
      qc.removeQueries({ queryKey: chatKeys.messages(inst, channelId) });
      qc.removeQueries({ queryKey: chatKeys.channel(inst, channelId) });
      await qc.invalidateQueries({ queryKey: chatKeys.placeChannels(inst) });
    },
    /** Muting silences mention notifications from the channel; its unread state is still tracked. */
    async setMuted(channelId: string, muted: boolean) {
      const level = muted ? 'muted' : 'normal';
      unwrap(await client.PUT('/channels/{channelID}/subscription', { params: { path: { channelID: channelId } }, body: { level } }));
      patchChannel(qc, inst, channelId, (c) => ({ ...c, subscription: level }));
    },
    /** Anyone in a group conversation may rename it. */
    async renameConversation(channelId: string, name: string) {
      const channel = unwrap(await client.PATCH('/channels/{channelID}', { params: { path: { channelID: channelId } }, body: { name } }));
      patchChannel(qc, inst, channelId, (held) => ({ ...held, name: channel.name }));
      return channel;
    },
    async invoke(channelId: string, parsed: ParsedCommand, lookup: (kind: 'user' | 'channel', name: string) => Promise<string | null>) {
      const options: Record<string, unknown> = { ...parsed.options };
      for (const l of parsed.lookups) {
        const id = await lookup(l.kind, l.name);
        if (!id) throw new Error(l.kind === 'user' ? `There is no one called @${l.name} here.` : `There is no channel called #${l.name} here.`);
        options[l.option] = id;
      }
      unwrap(
        await client.POST('/channels/{channelID}/interactions', {
          params: { path: { channelID: channelId } },
          body: { application_id: parsed.command.application_id, command: parsed.command.name, options },
        }),
      );
    },
  };
}

export type ChatActions = ReturnType<typeof chatActions>;

export function useChatActions(): ChatActions | null {
  const { inst, client } = useChatContext();
  const qc = useQueryClient();
  const myId = useSession()?.userId;
  return useMemo(() => (client && inst ? chatActions({ qc, client, inst, myId }) : null), [qc, client, inst, myId]);
}
