import { ApiError, createGotalkClient, unwrap, type GotalkClient, type Schemas } from '@gotalk/api-client';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { KeyValueStorage } from './instances.ts';

export type SelfUser = Schemas['SelfUser'];
export type RegisterRequest = Schemas['RegisterRequest'];

/** The part of a saved instance auth needs. */
export interface AuthTarget {
  id: string;
  apiBaseUrl: string;
}

/** Where refresh tokens live: the keychain on mobile/desktop, localStorage on the web. */
export interface SecretStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Runs `fn` while holding a named lock shared by everything that can touch the same storage. */
export type LockProvider = <T>(name: string, fn: () => Promise<T>) => Promise<T>;

export interface AuthMessage {
  type: 'changed';
  instanceId: string;
  /** Set when the session was ended by the server, so other tabs can explain it too. */
  revoked?: { login: string };
}

export interface AuthBroadcast {
  post(message: AuthMessage): void;
  subscribe(listener: (message: AuthMessage) => void): () => void;
}

/** What the UI may know about a signed-in session. Tokens never appear here. */
export interface SessionIdentity {
  sessionId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface AuthState {
  hydrated: boolean;
  /** Signed-in sessions by instance id. */
  sessions: Record<string, SessionIdentity>;
  /** Instances whose session the server ended while the app was running; sign-in explains and keeps the username. */
  revoked: Record<string, { login: string }>;
}

interface SessionRecord {
  sessionId: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface AuthManagerOptions {
  secrets: SecretStorage;
  /** Non-secret identities for instant UI after launch. */
  identities: KeyValueStorage;
  lock?: LockProvider;
  broadcast?: AuthBroadcast;
  fetch?: typeof globalThis.fetch;
  /** Sent as `User-Agent` where the platform allows it (not browsers), so devices can be told apart. */
  userAgent?: string;
  now?: () => number;
}

export interface AuthManager {
  readonly store: StoreApi<AuthState>;
  hydrate(): Promise<void>;
  signIn(target: AuthTarget, credentials: { login: string; password: string }): Promise<SelfUser>;
  register(target: AuthTarget, request: RegisterRequest): Promise<SelfUser>;
  /** Ends the session on the server when reachable, and always on this device. */
  signOut(target: AuthTarget): Promise<void>;
  /** Drops local credentials without telling the server (the instance is being forgotten). */
  forget(instanceId: string): Promise<void>;
  /** A client that sends the access token, refreshes it when needed, and retries a rejected request once. */
  clientFor(target: AuthTarget): GotalkClient;
  getAccessToken(target: AuthTarget): Promise<string | null>;
  /** Called when the instance reports this session is gone (for example after deleting the account). */
  endSession(instanceId: string, options?: { revoked?: boolean }): Promise<void>;
  /** Refreshes the cached identity after the profile changed. */
  setUser(instanceId: string, user: SelfUser): Promise<void>;
  dispose(): void;
}

const IDENTITIES_KEY = 'gotalk.auth.identities';
const REFRESH_LEEWAY_MS = 30_000;

/** Keychain-safe key for an instance id (an origin like `https://host:8080`). */
export function sessionKey(instanceId: string): string {
  return 'gotalk.session.' + instanceId.replace(/[^A-Za-z0-9.\-_]/g, (c) => '_' + c.charCodeAt(0).toString(16) + '_');
}

/** In-process mutex per name; enough where only one process can run (native apps). */
export function createLocalLock(): LockProvider {
  const tails = new Map<string, Promise<unknown>>();
  return (name, fn) => {
    const run = (tails.get(name) ?? Promise.resolve()).then(fn, fn);
    tails.set(name, run.catch(() => undefined));
    return run;
  };
}

function parseRecord(raw: string | null): SessionRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<SessionRecord>;
    return r.refreshToken && r.sessionId && r.refreshTokenExpiresAt ? (r as SessionRecord) : null;
  } catch {
    return null;
  }
}

function identityOf(user: SelfUser, sessionId: string): SessionIdentity {
  return { sessionId, userId: user.id, username: user.username, displayName: user.display_name, avatarUrl: user.avatar_url };
}

export function createAuthManager(options: AuthManagerOptions): AuthManager {
  const { secrets, identities } = options;
  const now = options.now ?? Date.now;
  const lock = options.lock ?? createLocalLock();
  const baseFetch: typeof globalThis.fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const store = createStore<AuthState>(() => ({ hydrated: false, sessions: {}, revoked: {} }));
  const access = new Map<string, { token: string; expiresAt: number }>();
  const inflight = new Map<string, Promise<string | null>>();
  /** Refreshing is paused for an instance until this time after it answered 429/503 with Retry-After. */
  const throttled = new Map<string, { until: number; error: ApiError }>();
  let hydrating: Promise<void> | null = null;

  const readRecord = async (id: string) => parseRecord(await secrets.get(sessionKey(id)));

  async function persistIdentities() {
    await identities.setItem(IDENTITIES_KEY, JSON.stringify(store.getState().sessions));
  }

  async function loadIdentities(): Promise<Record<string, SessionIdentity>> {
    try {
      const raw = await identities.getItem(IDENTITIES_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, SessionIdentity>) : {};
      const verified: Record<string, SessionIdentity> = {};
      for (const [id, identity] of Object.entries(parsed)) {
        if (await readRecord(id)) verified[id] = identity;
      }
      return verified;
    } catch {
      return {};
    }
  }

  const post = (message: AuthMessage) => options.broadcast?.post(message);

  const rawClient = (target: AuthTarget) =>
    createGotalkClient({ baseUrl: target.apiBaseUrl, fetch: baseFetch, userAgent: options.userAgent });

  async function applyTokens(target: AuthTarget, tokens: Schemas['Tokens']) {
    const record: SessionRecord = {
      sessionId: tokens.session_id,
      refreshToken: tokens.refresh_token,
      refreshTokenExpiresAt: tokens.refresh_token_expires_at,
    };
    await secrets.set(sessionKey(target.id), JSON.stringify(record));
    access.set(target.id, { token: tokens.access_token, expiresAt: Date.parse(tokens.access_token_expires_at) });
    store.setState((s) => {
      const revoked = { ...s.revoked };
      delete revoked[target.id];
      return { sessions: { ...s.sessions, [target.id]: identityOf(tokens.user, tokens.session_id) }, revoked };
    });
    await persistIdentities();
  }

  async function clearLocal(instanceId: string, revoked?: { login: string }) {
    access.delete(instanceId);
    store.setState((s) => {
      const sessions = { ...s.sessions };
      delete sessions[instanceId];
      const nextRevoked = { ...s.revoked };
      if (revoked) nextRevoked[instanceId] = revoked;
      else delete nextRevoked[instanceId];
      return { sessions, revoked: nextRevoked };
    });
    await secrets.delete(sessionKey(instanceId));
    await persistIdentities();
  }

  async function endSession(instanceId: string, opts: { revoked?: boolean } = {}) {
    const known = store.getState().sessions[instanceId];
    const revoked = opts.revoked && known ? { login: known.username } : undefined;
    await clearLocal(instanceId, revoked);
    post({ type: 'changed', instanceId, revoked });
  }

  async function doRefresh(target: AuthTarget): Promise<string | null> {
    // Re-read inside the lock: another tab may have rotated the token while this one waited.
    const record = await readRecord(target.id);
    if (!record) {
      if (store.getState().sessions[target.id]) await endSession(target.id, { revoked: true });
      return null;
    }
    if (Date.parse(record.refreshTokenExpiresAt) <= now()) {
      await endSession(target.id, { revoked: true });
      return null;
    }
    let tokens: Schemas['Tokens'];
    const pause = throttled.get(target.id);
    if (pause && pause.until > now()) throw pause.error;
    try {
      tokens = unwrap(await rawClient(target).POST('/auth/refresh', { body: { refresh_token: record.refreshToken } }));
      throttled.delete(target.id);
    } catch (e) {
      // Only a definitive rejection ends the session; being offline or throttled must not sign anyone out.
      if (e instanceof ApiError && e.status === 401) {
        await endSession(target.id, { revoked: true });
        return null;
      }
      if (e instanceof ApiError && (e.status === 429 || e.status === 503) && e.retryAfter) {
        throttled.set(target.id, { until: now() + e.retryAfter * 1000, error: e });
      }
      throw e;
    }
    await applyTokens(target, tokens);
    post({ type: 'changed', instanceId: target.id });
    return tokens.access_token;
  }

  function refresh(target: AuthTarget): Promise<string | null> {
    const existing = inflight.get(target.id);
    if (existing) return existing;
    const p = lock(`gotalk.refresh.${target.id}`, () => doRefresh(target)).finally(() => inflight.delete(target.id));
    inflight.set(target.id, p);
    return p;
  }

  async function getAccessToken(target: AuthTarget): Promise<string | null> {
    const current = access.get(target.id);
    if (current && current.expiresAt - now() > REFRESH_LEEWAY_MS) return current.token;
    if (!store.getState().sessions[target.id]) return null;
    return refresh(target);
  }

  async function authedFetch(target: AuthTarget, request: Request): Promise<Response> {
    const replay = request.clone();
    const sent = request.headers.get('Authorization');
    const res = await baseFetch(request);
    if (res.status !== 401 || !sent) return res;

    let fresh: string | null;
    try {
      const current = access.get(target.id);
      // Another request may already have rotated the token since this one was sent.
      fresh = current && `Bearer ${current.token}` !== sent ? current.token : await refresh(target);
    } catch {
      return res;
    }
    if (!fresh) return res;

    replay.headers.set('Authorization', `Bearer ${fresh}`);
    const second = await baseFetch(replay);
    if (second.status === 401) await endSession(target.id, { revoked: true });
    return second;
  }

  const unsubscribe = options.broadcast?.subscribe(async (message) => {
    // Another tab changed this instance's session: rebuild from shared storage.
    const record = await readRecord(message.instanceId);
    if (!record) {
      access.delete(message.instanceId);
      store.setState((s) => {
        const sessions = { ...s.sessions };
        delete sessions[message.instanceId];
        return { sessions, revoked: message.revoked ? { ...s.revoked, [message.instanceId]: message.revoked } : s.revoked };
      });
      return;
    }
    const stored = await loadIdentities();
    const identity = stored[message.instanceId];
    if (identity) store.setState((s) => ({ sessions: { ...s.sessions, [message.instanceId]: identity } }));
  });

  const clientFor = (target: AuthTarget) =>
    createGotalkClient({
      baseUrl: target.apiBaseUrl,
      getAccessToken: () => getAccessToken(target),
      fetch: (input) => authedFetch(target, input as Request),
      userAgent: options.userAgent,
    });

  return {
    store,
    hydrate() {
      hydrating ??= loadIdentities().then((sessions) => {
        store.setState({ sessions, hydrated: true });
      });
      return hydrating;
    },
    async signIn(target, credentials) {
      const tokens = unwrap(await rawClient(target).POST('/auth/login', { body: credentials }));
      await applyTokens(target, tokens);
      post({ type: 'changed', instanceId: target.id });
      return tokens.user;
    },
    async register(target, request) {
      const tokens = unwrap(await rawClient(target).POST('/auth/register', { body: request }));
      await applyTokens(target, tokens);
      post({ type: 'changed', instanceId: target.id });
      return tokens.user;
    },
    async signOut(target) {
      try {
        if (store.getState().sessions[target.id]) {
          await clientFor(target).POST('/auth/logout');
        }
      } catch {
        // Offline or already ended: the device is signed out either way.
      }
      await endSession(target.id);
    },
    async forget(instanceId) {
      await endSession(instanceId);
    },
    clientFor,
    getAccessToken,
    endSession,
    async setUser(instanceId, user) {
      const current = store.getState().sessions[instanceId];
      if (!current) return;
      store.setState((s) => ({ sessions: { ...s.sessions, [instanceId]: identityOf(user, current.sessionId) } }));
      await persistIdentities();
    },
    dispose() {
      unsubscribe?.();
    },
  };
}
