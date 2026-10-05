import { createStore, type StoreApi } from 'zustand/vanilla';

import { CloseCode, type Dispatch, type Frame, type GatewayEvents, type GatewayEventType, type PresenceStatus, type ReadyEvent } from './protocol.ts';

/** The subset of the WebSocket API the client needs; browsers, React Native and test fakes all provide it. */
export interface WebSocketLike {
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

/**
 * `connecting`: first attempt. `ready`: identified and receiving events. `reconnecting`: the
 * connection dropped and the client is waiting to retry or retrying. `stopped`: stopped by the
 * app, or the session ended.
 */
export type ConnectionState = 'idle' | 'connecting' | 'ready' | 'reconnecting' | 'stopped';

export interface GatewayState {
  state: ConnectionState;
  /** Failed attempts since the last READY. */
  attempt: number;
  /** When the next attempt starts, while waiting. */
  retryAt: number | null;
  lastClose: { code: number; reason: string } | null;
  /** The session id from the last READY. */
  sessionId: string | null;
  /** When the current connection became ready. */
  readyAt: number | null;
  /** When the last ready connection was lost; null while connected. */
  disconnectedAt: number | null;
}

export interface GatewayClientOptions {
  /** `gateway_url` from the instance, e.g. `wss://forum.example/api/v1/gateway`. */
  url: string;
  /** The current access token; null when signed out. Called for every identify, so tokens can rotate. */
  getToken: () => Promise<string | null>;
  /** Presence to identify with. */
  status?: PresenceStatus;
  WebSocket?: WebSocketFactory;
  /** The server ended this session (close code 4010), or the token is gone. The client has stopped. */
  onSessionEnded?: () => void;
  /**
   * The server rejected the token (4004). Resolve true when the session is still valid (for example after
   * an authenticated request refreshed it) to keep reconnecting, or false to stop.
   */
  onAuthFailed?: () => Promise<boolean>;
  /** Errors thrown by event listeners; they never stop the connection. */
  onListenerError?: (error: unknown) => void;
  backoff?: { initialMs?: number; maxMs?: number };
  random?: () => number;
  now?: () => number;
}

export interface GatewayClient {
  readonly store: StoreApi<GatewayState>;
  start(): void;
  stop(): void;
  /** Skips the wait before the next attempt, e.g. when the network comes back or the app returns to the foreground. */
  retryNow(): void;
  setStatus(status: PresenceStatus): void;
  setSpeaking(speaking: boolean): void;
  on<K extends GatewayEventType>(type: K, listener: (data: GatewayEvents[K]) => void): () => void;
  onDispatch(listener: (dispatch: Dispatch) => void): () => void;
  /** `reconnected` is true when an earlier connection of this client was ready, so events may have been missed. */
  onReady(listener: (ready: ReadyEvent, info: { reconnected: boolean }) => void): () => void;
}

const OPEN = 1;
const HELLO_TIMEOUT_MS = 15_000;
const READY_TIMEOUT_MS = 15_000;
const MAX_AUTH_FAILURES = 3;
const RATE_LIMITED_MIN_MS = 10_000;

const defaultFactory: WebSocketFactory = (url) => new globalThis.WebSocket(url) as unknown as WebSocketLike;

export function createGatewayClient(options: GatewayClientOptions): GatewayClient {
  const factory = options.WebSocket ?? defaultFactory;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const initialMs = options.backoff?.initialMs ?? 1_000;
  const maxMs = options.backoff?.maxMs ?? 30_000;

  const store = createStore<GatewayState>(() => ({
    state: 'idle',
    attempt: 0,
    retryAt: null,
    lastClose: null,
    sessionId: null,
    readyAt: null,
    disconnectedAt: null,
  }));
  const set = (patch: Partial<GatewayState>) => store.setState(patch);

  const dispatchListeners = new Set<(d: Dispatch) => void>();
  const readyListeners = new Set<(ready: ReadyEvent, info: { reconnected: boolean }) => void>();

  let running = false;
  let socket: WebSocketLike | null = null;
  /** Bumped for every socket; handlers of an abandoned socket see a stale value and do nothing. */
  let generation = 0;
  let status: PresenceStatus = options.status ?? 'online';
  let everReady = false;
  let authFailures = 0;
  let awaitingAck = false;
  let heartbeatMs = 30_000;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let beatTimer: ReturnType<typeof setTimeout> | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;

  function clearTimers() {
    for (const t of [retryTimer, beatTimer, watchdog]) if (t) clearTimeout(t);
    retryTimer = beatTimer = watchdog = null;
  }

  function send(frame: Frame) {
    if (socket && socket.readyState === OPEN) socket.send(JSON.stringify(frame));
  }

  function emit<T>(listeners: Set<T>, call: (l: T) => void) {
    for (const l of [...listeners]) {
      try {
        call(l);
      } catch (e) {
        options.onListenerError?.(e);
      }
    }
  }

  function backoffDelay(attempt: number) {
    const ceiling = Math.min(maxMs, initialMs * 2 ** attempt);
    return Math.round(ceiling / 2 + (random() * ceiling) / 2);
  }

  function scheduleRetry(delay: number) {
    const attempt = store.getState().attempt + 1;
    set({ state: 'reconnecting', attempt, retryAt: now() + delay });
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  }

  function terminate() {
    running = false;
    clearTimers();
    set({ state: 'stopped', retryAt: null });
  }

  /** Drops the current socket without waiting for its close event, then handles it like a lost connection. */
  function abandon(gen: number, reason: string) {
    if (gen !== generation) return;
    const ws = socket;
    generation++;
    socket = null;
    try {
      ws?.close(1000, reason);
    } catch {
      // Already closed.
    }
    disconnected(0, reason);
  }

  function disconnected(code: number, reason: string) {
    clearTimers();
    socket = null;
    const wasReady = store.getState().state === 'ready';
    set({ lastClose: { code, reason }, readyAt: null, ...(wasReady ? { disconnectedAt: now() } : {}) });
    if (!running) return;

    switch (code) {
      case CloseCode.SessionEnded:
        terminate();
        options.onSessionEnded?.();
        return;
      case CloseCode.AuthFailed: {
        authFailures++;
        if (authFailures >= MAX_AUTH_FAILURES || !options.onAuthFailed) {
          terminate();
          return;
        }
        const gen = generation;
        set({ state: 'reconnecting', retryAt: null });
        options.onAuthFailed().then(
          (valid) => {
            if (!running || gen !== generation) return;
            if (valid) scheduleRetry(backoffDelay(store.getState().attempt));
            else {
              terminate();
              options.onSessionEnded?.();
            }
          },
          () => running && gen === generation && scheduleRetry(backoffDelay(store.getState().attempt)),
        );
        return;
      }
      case CloseCode.Resync:
        // Nothing to resume: reconnect at once and let READY trigger the catch-up.
        scheduleRetry(0);
        return;
      case CloseCode.ServerShutdown:
        // Spread clients over the remaining replicas instead of reconnecting in lockstep.
        scheduleRetry(Math.round(500 + random() * 2_000));
        return;
      case CloseCode.RateLimited:
        scheduleRetry(Math.max(RATE_LIMITED_MIN_MS, backoffDelay(store.getState().attempt)));
        return;
      default:
        scheduleRetry(backoffDelay(store.getState().attempt));
    }
  }

  function heartbeat(gen: number, delay: number) {
    beatTimer = setTimeout(() => {
      if (gen !== generation) return;
      // No ack since the last beat: the connection is dead even if the socket has not noticed.
      if (awaitingAck) return abandon(gen, 'heartbeat not acknowledged');
      awaitingAck = true;
      send({ op: 'heartbeat' });
      heartbeat(gen, heartbeatMs);
    }, delay);
  }

  async function identify(gen: number) {
    let token: string | null;
    try {
      token = await options.getToken();
    } catch {
      // Offline or the instance refused to refresh: try again later.
      return abandon(gen, 'could not get a token');
    }
    if (gen !== generation) return;
    if (!token) {
      terminate();
      abandon(gen, 'signed out');
      options.onSessionEnded?.();
      return;
    }
    send({ op: 'identify', d: { token, status } });
    watchdog = setTimeout(() => abandon(gen, 'no READY'), READY_TIMEOUT_MS);
  }

  function handleFrame(gen: number, raw: unknown) {
    let frame: Frame;
    try {
      frame = JSON.parse(typeof raw === 'string' ? raw : String(raw)) as Frame;
    } catch {
      return;
    }
    switch (frame.op) {
      case 'hello': {
        if (watchdog) clearTimeout(watchdog);
        watchdog = null;
        const interval = (frame.d as { heartbeat_interval?: number } | undefined)?.heartbeat_interval;
        if (typeof interval === 'number' && interval > 0) heartbeatMs = interval;
        awaitingAck = false;
        // The first beat is jittered so clients that reconnected together do not beat together.
        heartbeat(gen, Math.round(heartbeatMs * random()));
        void identify(gen);
        return;
      }
      case 'heartbeat_ack':
        awaitingAck = false;
        return;
      case 'dispatch': {
        if (!frame.t) return;
        if (frame.t === 'READY') {
          if (watchdog) clearTimeout(watchdog);
          watchdog = null;
          const ready = frame.d as ReadyEvent;
          const reconnected = everReady;
          everReady = true;
          authFailures = 0;
          set({ state: 'ready', attempt: 0, retryAt: null, sessionId: ready.session_id, readyAt: now(), disconnectedAt: null });
          emit(readyListeners, (l) => l(ready, { reconnected }));
        }
        const dispatch = { type: frame.t, data: frame.d } as Dispatch;
        emit(dispatchListeners, (l) => l(dispatch));
        return;
      }
    }
  }

  function connect() {
    clearTimers();
    if (!running) return;
    const gen = ++generation;
    const first = !everReady && store.getState().attempt === 0;
    set({ state: first ? 'connecting' : 'reconnecting', retryAt: null });
    let ws: WebSocketLike;
    try {
      ws = factory(options.url);
    } catch {
      return disconnected(0, 'could not open the connection');
    }
    socket = ws;
    watchdog = setTimeout(() => abandon(gen, 'no hello'), HELLO_TIMEOUT_MS);
    ws.onmessage = (event) => gen === generation && handleFrame(gen, event.data);
    ws.onclose = (event) => {
      if (gen !== generation) return;
      generation++;
      disconnected(event.code, event.reason);
    };
    // A close event always follows an error.
    ws.onerror = () => undefined;
  }

  return {
    store,
    start() {
      if (running) return;
      running = true;
      authFailures = 0;
      set({ attempt: 0 });
      connect();
    },
    stop() {
      if (!running && !socket) return;
      running = false;
      const ws = socket;
      generation++;
      socket = null;
      clearTimers();
      try {
        ws?.close(1000, 'client stopped');
      } catch {
        // Already closed.
      }
      set({ state: 'stopped', retryAt: null, readyAt: null });
    },
    retryNow() {
      if (!running || !retryTimer) return;
      clearTimeout(retryTimer);
      retryTimer = null;
      connect();
    },
    setStatus(next) {
      status = next;
      if (store.getState().state === 'ready') send({ op: 'presence_update', d: { status: next } });
    },
    setSpeaking(speaking) {
      if (store.getState().state === 'ready') send({ op: 'voice_speaking', d: { speaking } });
    },
    on(type, listener) {
      const wrapped = (d: Dispatch) => {
        if (d.type === type) (listener as (data: unknown) => void)(d.data);
      };
      dispatchListeners.add(wrapped);
      return () => dispatchListeners.delete(wrapped);
    },
    onDispatch(listener) {
      dispatchListeners.add(listener);
      return () => dispatchListeners.delete(listener);
    },
    onReady(listener) {
      readyListeners.add(listener);
      return () => readyListeners.delete(listener);
    },
  };
}
