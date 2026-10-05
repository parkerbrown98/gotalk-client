import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, unwrap, type GotalkClient } from '@gotalk/api-client';
import { applyReaction, keepOwnReactions } from '@gotalk/core';
import { catchUp, createGatewayClient, type GatewayClient, type PresenceStatus, type VisibleStatus } from '@gotalk/gateway';
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { authManager, onBeforeSignOut, useSession } from './auth';
import {
  afterFetch,
  chatActions,
  chatKeys,
  countMessage,
  heldMessages,
  insertMessages,
  patchChannel,
  patchMessage,
  removeMessage,
  settleOutgoing,
  withReadState,
  type Channel,
  type Message,
  type MessagePages,
} from './chat';
import { connectionStore } from './connection';
import { useActiveInstance } from './instances';

// ---- My presence: chosen per instance, remembered on this device, sent when connecting ----

const presenceKey = (inst: string) => `gotalk.presence.${inst}`;
const STATUSES: readonly PresenceStatus[] = ['online', 'idle', 'dnd', 'invisible'];

export const myStatusStore = createStore<{ byInstance: Record<string, PresenceStatus> }>(() => ({ byInstance: {} }));

async function loadMyStatus(inst: string): Promise<PresenceStatus> {
  const known = myStatusStore.getState().byInstance[inst];
  if (known) return known;
  const raw = await AsyncStorage.getItem(presenceKey(inst)).catch(() => null);
  const status = STATUSES.includes(raw as PresenceStatus) ? (raw as PresenceStatus) : 'online';
  myStatusStore.setState((s) => ({ byInstance: { ...s.byInstance, [inst]: status } }));
  return status;
}

export function setMyStatus(inst: string, status: PresenceStatus): void {
  myStatusStore.setState((s) => ({ byInstance: { ...s.byInstance, [inst]: status } }));
  void AsyncStorage.setItem(presenceKey(inst), status).catch(() => undefined);
  if (current?.inst === inst) current.gateway.setStatus(status);
}

export function useMyStatus(): PresenceStatus {
  const inst = useActiveInstance()?.id;
  const status = useStore(myStatusStore, (s) => (inst ? s.byInstance[inst] : undefined));
  useEffect(() => {
    if (inst && !status) void loadMyStatus(inst);
  }, [inst, status]);
  return status ?? 'online';
}

// ---- Other people's presence ----

const presenceStore = createStore<{ byUser: Record<string, VisibleStatus> }>(() => ({ byUser: {} }));
/** Users some screen shows, with how many screens show them. Their presence is fetched once, then kept current by events. */
const watched = new Map<string, number>();
const pending = new Set<string>();
let presenceTimer: ReturnType<typeof setTimeout> | null = null;

function requestPresence(ids: Iterable<string>) {
  for (const id of ids) pending.add(id);
  if (presenceTimer || pending.size === 0) return;
  presenceTimer = setTimeout(() => {
    presenceTimer = null;
    void fetchPresence();
  }, 50);
}

async function fetchPresence() {
  const conn = current;
  if (!conn) return;
  const ids = [...pending];
  pending.clear();
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    try {
      const list = unwrap(await conn.api.GET('/presences', { params: { query: { user_ids: batch } } })) ?? [];
      if (current !== conn) return;
      const byUser = { ...presenceStore.getState().byUser };
      // People the caller may not see come back missing; show them as offline rather than unknown.
      for (const id of batch) byUser[id] = 'offline';
      for (const p of list) byUser[p.user_id] = p.status;
      presenceStore.setState({ byUser });
    } catch {
      // Unknown until the next event or reconnect.
    }
  }
}

/** Presence of each user, fetched on first use and kept current by the gateway. */
export function usePresences(userIds: readonly string[]): Record<string, VisibleStatus | undefined> {
  const key = [...new Set(userIds)].sort().join(',');
  useEffect(() => {
    const ids = key ? key.split(',') : [];
    const fresh: string[] = [];
    for (const id of ids) {
      const n = watched.get(id) ?? 0;
      watched.set(id, n + 1);
      if (n === 0 && !presenceStore.getState().byUser[id]) fresh.push(id);
    }
    requestPresence(fresh);
    return () => {
      for (const id of ids) {
        const n = (watched.get(id) ?? 1) - 1;
        if (n <= 0) watched.delete(id);
        else watched.set(id, n);
      }
    };
  }, [key]);
  return useStore(presenceStore, (s) => s.byUser);
}

export function usePresence(userId: string | undefined): VisibleStatus | undefined {
  const all = usePresences(userId ? [userId] : []);
  const myId = useSession()?.userId;
  const mine = useMyStatus();
  if (userId && userId === myId) return mine === 'invisible' ? 'offline' : mine;
  return userId ? all[userId] : undefined;
}

// ---- Typing ----

const TYPING_MS = 10_000;
const typingStore = createStore<{ byChannel: Record<string, Record<string, number>> }>(() => ({ byChannel: {} }));

function setTyping(channelId: string, userId: string, until: number | null) {
  typingStore.setState((s) => {
    const channel = { ...s.byChannel[channelId] };
    if (until === null) {
      if (!(userId in channel)) return s;
      delete channel[userId];
    } else channel[userId] = until;
    return { byChannel: { ...s.byChannel, [channelId]: channel } };
  });
}

/** Ids of the people typing in a channel right now. */
export function useTypingUsers(channelId: string | undefined): string[] {
  const entries = useStore(typingStore, (s) => (channelId ? s.byChannel[channelId] : undefined));
  const [now, setNow] = useState(() => Date.now());
  const active = useMemo(() => Object.entries(entries ?? {}).filter(([, until]) => until > now), [entries, now]);
  useEffect(() => {
    if (active.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [active.length]);
  return useMemo(() => active.map(([id]) => id), [active]);
}

// ---- The connection ----

interface Connection {
  inst: string;
  gateway: GatewayClient;
  api: GotalkClient;
}

let current: Connection | null = null;

function invalidate(qc: QueryClient, ...keys: QueryKey[]) {
  return Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

function startConnection(qc: QueryClient, inst: string, gatewayUrl: string, apiBaseUrl: string, myId: string | undefined) {
  const target = { id: inst, apiBaseUrl };
  const api = authManager.clientFor(target);
  const actions = chatActions({ qc, client: api, inst, myId });
  let disposed = false;
  const signedIn = () => !!authManager.store.getState().sessions[inst];

  const gateway = createGatewayClient({
    url: gatewayUrl,
    getToken: () => authManager.getAccessToken(target),
    // The server closed the connection because the session ended. Let an authenticated request
    // confirm it, after a moment so an intentional sign-out or account deletion on this device wins.
    onSessionEnded: () => {
      setTimeout(() => {
        if (signedIn()) void api.GET('/users/@me').catch(() => undefined);
      }, 1_500);
    },
    onAuthFailed: async () => {
      await api.GET('/users/@me').catch(() => undefined);
      return signedIn();
    },
    onListenerError: (e) => console.warn('Gateway event handler failed', e),
  });
  const conn: Connection = { inst, gateway, api };
  current = conn;

  const offState = gateway.store.subscribe((s) =>
    connectionStore.setState((prev) => ({
      instanceId: inst,
      state: s.state,
      disconnectedAt: s.disconnectedAt,
      downSince: s.state === 'reconnecting' ? (prev.downSince ?? Date.now()) : null,
    })),
  );
  const offSignOut = onBeforeSignOut((id) => id === inst && gateway.stop());
  const placeChannels = chatKeys.placeChannels(inst);
  const dms = chatKeys.dms(inst);

  /** After a gap: load what each held channel missed, then refresh the lists that summarize them. */
  async function resync() {
    const held = qc.getQueriesData<MessagePages>({ queryKey: chatKeys.allMessages(inst) });
    await Promise.all(
      held.map(async ([key, data]) => {
        const channelId = key[2] as string | undefined;
        const newest = heldMessages(data).at(-1)?.id;
        if (!channelId) return;
        if (!newest) return qc.invalidateQueries({ queryKey: key, exact: true });
        try {
          const missed = await catchUp(
            async (after, limit) => unwrap(await api.GET('/channels/{channelID}/messages', { params: { path: { channelID: channelId }, query: { after, limit } } })) ?? [],
            newest,
          );
          if (disposed) return;
          // A long gap is cheaper to reload from the newest page than to fill in.
          if (!missed.complete) return qc.resetQueries({ queryKey: key, exact: true });
          for (const m of missed.items) settleOutgoing(m.nonce);
          insertMessages(qc, inst, channelId, missed.items);
          // Edits, deletions and reactions are not part of the catch-up; refresh this copy when it is next shown.
          await qc.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' });
        } catch (e) {
          if (e instanceof ApiError && (e.status === 403 || e.status === 404)) qc.removeQueries({ queryKey: key, exact: true });
        }
      }),
    );
    if (disposed) return;
    requestPresence(watched.keys());
    await invalidate(qc, placeChannels, dms, ['channel', inst], ['pins', inst], ['receipts', inst], ['notifications-unread', inst], ['notifications', inst], ['places', inst]);
    await actions.flushQueued();
  }

  /** Replaces a held message with the server's copy, which also has this user's own reaction flags. */
  async function refreshMessage(channelId: string, messageId: string) {
    try {
      const fresh = unwrap(await api.GET('/messages/{messageID}', { params: { path: { messageID: messageId } } }));
      if (!disposed) patchMessage(qc, inst, channelId, messageId, () => fresh);
    } catch {
      // Deleted meanwhile; its own event removes it.
    }
  }

  /**
   * Applies a counting change (a reaction, a thread reply) that would count twice if replayed after a
   * fetch in progress; in that case the message is fetched again once the history has landed.
   */
  function countOn(channelId: string, messageId: string, apply: (m: Message) => Message) {
    if (afterFetch(qc, inst, channelId, () => void refreshMessage(channelId, messageId))) return;
    patchMessage(qc, inst, channelId, messageId, apply);
  }

  /** A reply in a thread moves the thread summary on the message it started from. */
  function bumpThread(threadId: string, at: string) {
    for (const [key, data] of qc.getQueriesData<MessagePages>({ queryKey: chatKeys.allMessages(inst) })) {
      const starter = heldMessages(data).find((m) => m.thread?.id === threadId);
      if (starter?.thread) {
        const thread = starter.thread;
        countOn(key[2] as string, starter.id, (m) => ({ ...m, thread: { ...thread, message_count: thread.message_count + 1, last_message_at: at } }));
      }
    }
  }

  gateway.onReady((ready, { reconnected }) => {
    qc.setQueryData(['me', inst], ready.user);
    if (reconnected) void resync();
    else void actions.flushQueued();
  });
  gateway.on('MESSAGE_CREATE', (m) => {
    settleOutgoing(m.nonce);
    insertMessages(qc, inst, m.channel_id, [m]);
    if (!m.place_id) qc.setQueryData(chatKeys.lastMessage(inst, m.channel_id, m.id), m);
    if (m.author) setTyping(m.channel_id, m.author.id, null);
    patchChannel(qc, inst, m.channel_id, (c) => countMessage(c, m, myId));
    if (!m.place_id && !qc.getQueryData<Channel[]>(dms)?.some((c) => c.id === m.channel_id)) void qc.invalidateQueries({ queryKey: dms });
    bumpThread(m.channel_id, m.created_at);
  });
  gateway.on('MESSAGE_UPDATE', (m) => {
    patchMessage(qc, inst, m.channel_id, m.id, (held) => keepOwnReactions(m, held));
    void qc.invalidateQueries({ queryKey: chatKeys.pins(inst, m.channel_id) });
  });
  gateway.on('MESSAGE_DELETE', (ref) => removeMessage(qc, inst, ref.channel_id, ref.id));
  gateway.on('MESSAGE_REACTION_ADD', (e) => countOn(e.channel_id, e.message_id, (m) => applyReaction(m, e.emoji, true, e.user_id === myId)));
  gateway.on('MESSAGE_REACTION_REMOVE', (e) => countOn(e.channel_id, e.message_id, (m) => applyReaction(m, e.emoji, false, e.user_id === myId)));
  gateway.on('TYPING_START', (e) => e.user_id !== myId && setTyping(e.channel_id, e.user_id, Date.now() + TYPING_MS));
  gateway.on('CHANNEL_CREATE', (c) => void qc.invalidateQueries({ queryKey: c.place_id ? placeChannels : dms }));
  gateway.on('CHANNEL_UPDATE', (c) => {
    // Gateway copies carry public fields only; the caller's permissions and read state stay.
    patchChannel(qc, inst, c.id, (held) => ({ ...held, ...c }));
    // Overwrites may have changed what this user can see.
    if (c.place_id) void qc.invalidateQueries({ queryKey: placeChannels });
  });
  gateway.on('CHANNEL_DELETE', (c) => {
    qc.setQueriesData<Channel[]>({ queryKey: placeChannels }, (list) => list?.filter((x) => x.id !== c.id));
    qc.setQueryData<Channel[]>(dms, (list) => list?.filter((x) => x.id !== c.id));
    qc.removeQueries({ queryKey: chatKeys.messages(inst, c.id) });
    void qc.invalidateQueries({ queryKey: chatKeys.channel(inst, c.id) });
  });
  gateway.on('CHANNEL_RECIPIENT_ADD', (e) => void invalidate(qc, dms, chatKeys.channel(inst, e.channel_id)));
  gateway.on('CHANNEL_RECIPIENT_REMOVE', (e) => void invalidate(qc, dms, chatKeys.channel(inst, e.channel_id)));
  gateway.on('CHANNEL_READ', (e) => {
    patchChannel(qc, inst, e.channel_id, (c) => withReadState(c, e.last_read_message_id, e.mention_count));
    void qc.invalidateQueries({ queryKey: ['notifications-unread', inst] });
  });
  gateway.on('READ_RECEIPT', (e) =>
    qc.setQueryData<{ user_id: string; last_read_message_id: string | null; updated_at: string }[]>(chatKeys.receipts(inst, e.channel_id), (list) =>
      list ? [...list.filter((r) => r.user_id !== e.user_id), { user_id: e.user_id, last_read_message_id: e.last_read_message_id, updated_at: new Date().toISOString() }] : list,
    ),
  );
  gateway.on('NOTIFICATION_CREATE', (n) => {
    if (!n.read) qc.setQueryData<number>(['notifications-unread', inst], (count) => (typeof count === 'number' ? count + 1 : count));
    void qc.invalidateQueries({ queryKey: ['notifications', inst] });
  });
  gateway.on('PRESENCE_UPDATE', (e) => presenceStore.setState((s) => ({ byUser: { ...s.byUser, [e.user_id]: e.status } })));
  const placesChanged = () => void invalidate(qc, ['places', inst], ['place', inst], placeChannels, ['boards', inst], ['discover', inst]);
  gateway.on('PLACE_JOIN', placesChanged);
  gateway.on('PLACE_LEAVE', placesChanged);
  gateway.on('PLACE_DELETE', placesChanged);

  void loadMyStatus(inst).then((status) => {
    if (disposed) return;
    gateway.setStatus(status);
    gateway.start();
  });

  return () => {
    disposed = true;
    gateway.stop();
    offState();
    offSignOut();
    if (current === conn) current = null;
    connectionStore.setState({ instanceId: null, state: 'idle', disconnectedAt: null, downSince: null });
    presenceStore.setState({ byUser: {} });
    typingStore.setState({ byChannel: {} });
  };
}

/** Keeps one gateway connection open for the active instance while signed in. Render once, near the root. */
export function RealtimeHost(): null {
  const active = useActiveInstance();
  const session = useSession();
  const qc = useQueryClient();
  const inst = active?.id;
  const gatewayUrl = active?.gatewayUrl;
  const apiBaseUrl = active?.apiBaseUrl;
  const sessionId = session?.sessionId;
  const myId = session?.userId;

  useEffect(() => {
    if (!inst || !gatewayUrl || !apiBaseUrl || !sessionId) return;
    return startConnection(qc, inst, gatewayUrl, apiBaseUrl, myId);
  }, [qc, inst, gatewayUrl, apiBaseUrl, sessionId, myId]);

  // Coming back online or to the foreground is the moment to retry, not whenever the backoff ends.
  useEffect(() => {
    const retry = () => current?.gateway.retryNow();
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      window.addEventListener('online', retry);
      return () => window.removeEventListener('online', retry);
    }
    const sub = AppState.addEventListener('change', (state) => state === 'active' && retry());
    return () => sub.remove();
  }, []);

  return null;
}

/** False while the browser says it has no network; native targets rely on the gateway alone. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => Platform.OS !== 'web' || typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
