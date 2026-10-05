import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { catchUp } from './catch-up.ts';
import { createGatewayClient, type GatewayClientOptions, type WebSocketLike } from './client.ts';
import { CloseCode } from './protocol.ts';

class FakeSocket implements WebSocketLike {
  readyState = 0;
  onopen: WebSocketLike['onopen'] = null;
  onmessage: WebSocketLike['onmessage'] = null;
  onclose: WebSocketLike['onclose'] = null;
  onerror: WebSocketLike['onerror'] = null;
  sent: Array<{ op: string; d?: unknown }> = [];
  closedByClient: { code?: number; reason?: string } | null = null;

  constructor(readonly url: string) {}

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code?: number, reason?: string) {
    this.closedByClient = { code, reason };
    this.readyState = 3;
  }
  /** Server side. */
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  frame(op: string, d?: unknown, t?: string) {
    this.onmessage?.({ data: JSON.stringify({ op, d, t }) });
  }
  hello(interval = 30_000) {
    this.open();
    this.frame('hello', { heartbeat_interval: interval });
  }
  ready(sessionId = 's1') {
    this.frame('dispatch', { user: { id: 'u1' }, session_id: sessionId, place_ids: [], status: 'online', heartbeat_interval: 30_000, voice_state: null }, 'READY');
  }
  serverClose(code: number, reason = '') {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
  ops() {
    return this.sent.map((f) => f.op);
  }
}

function setup(overrides: Partial<GatewayClientOptions> = {}) {
  const sockets: FakeSocket[] = [];
  let token: string | null = 'tok-1';
  const client = createGatewayClient({
    url: 'wss://x.example/api/v1/gateway',
    getToken: async () => token,
    WebSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    random: () => 1,
    ...overrides,
  });
  return {
    client,
    sockets,
    last: () => sockets[sockets.length - 1]!,
    setToken: (t: string | null) => {
      token = t;
    },
  };
}

/** Lets the identify step (which awaits the token) run. */
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('gateway client', () => {
  it('identifies with the token and status, then becomes ready', async () => {
    const { client, last } = setup({ status: 'dnd' });
    client.start();
    expect(client.store.getState().state).toBe('connecting');
    last().hello();
    await flush();
    expect(last().sent[0]).toEqual({ op: 'identify', d: { token: 'tok-1', status: 'dnd' } });
    last().ready('sess-9');
    expect(client.store.getState()).toMatchObject({ state: 'ready', sessionId: 'sess-9', attempt: 0 });
  });

  it('delivers dispatches to typed listeners and survives a throwing listener', async () => {
    const errors: unknown[] = [];
    const { client, last } = setup({ onListenerError: (e) => errors.push(e) });
    const created: string[] = [];
    client.on('MESSAGE_CREATE', () => {
      throw new Error('boom');
    });
    client.on('MESSAGE_CREATE', (m) => created.push(m.id));
    client.on('MESSAGE_DELETE', () => created.push('wrong'));
    client.start();
    last().hello();
    await flush();
    last().ready();
    last().frame('dispatch', { id: 'm1', channel_id: 'c1' }, 'MESSAGE_CREATE');
    expect(created).toEqual(['m1']);
    expect(errors).toHaveLength(1);
  });

  it('sends heartbeats and reconnects when one is not acknowledged', async () => {
    const { client, sockets, last } = setup({ random: () => 0.5 });
    client.start();
    last().hello(1_000);
    await flush();
    last().ready();
    await vi.advanceTimersByTimeAsync(500);
    expect(last().ops()).toEqual(['identify', 'heartbeat']);
    last().frame('heartbeat_ack');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(last().ops()).toEqual(['identify', 'heartbeat', 'heartbeat']);
    // No ack this time: the next beat finds the connection dead.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets[0]!.closedByClient).not.toBeNull();
    expect(client.store.getState().state).toBe('reconnecting');
    expect(client.store.getState().disconnectedAt).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(2);
  });

  it('backs off between failed attempts and resets after READY', async () => {
    const { client, sockets, last } = setup();
    client.start();
    last().serverClose(1006);
    expect(client.store.getState()).toMatchObject({ state: 'reconnecting', attempt: 1 });
    await vi.advanceTimersByTimeAsync(999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
    last().serverClose(1006);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);
    last().hello();
    await flush();
    last().ready();
    expect(client.store.getState().attempt).toBe(0);
  });

  it('caps the backoff', async () => {
    const { client, sockets, last } = setup({ backoff: { initialMs: 1_000, maxMs: 4_000 } });
    client.start();
    for (let i = 0; i < 5; i++) {
      last().serverClose(1006);
      await vi.advanceTimersByTimeAsync(4_000);
    }
    expect(sockets).toHaveLength(6);
  });

  it('reconnects at once on 4007 with a fresh identify, and reports the reconnect', async () => {
    const { client, sockets, last } = setup();
    const readies: boolean[] = [];
    client.onReady((_, info) => readies.push(info.reconnected));
    client.start();
    last().hello();
    await flush();
    last().ready('s1');
    last().serverClose(CloseCode.Resync, 'missed events');
    await flush();
    expect(sockets).toHaveLength(2);
    last().hello();
    await flush();
    expect(last().sent[0]?.op).toBe('identify');
    last().ready('s2');
    expect(readies).toEqual([false, true]);
    expect(client.store.getState().sessionId).toBe('s2');
  });

  it('spreads reconnects out after a server shutdown', async () => {
    const { client, sockets, last } = setup({ random: () => 0 });
    client.start();
    last().serverClose(CloseCode.ServerShutdown);
    await vi.advanceTimersByTimeAsync(499);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
  });

  it('waits at least ten seconds after being rate limited', async () => {
    const { client, sockets, last } = setup();
    client.start();
    last().serverClose(CloseCode.RateLimited);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
  });

  it('stops for good when the session ended', async () => {
    const ended = vi.fn();
    const { client, sockets, last } = setup({ onSessionEnded: ended });
    client.start();
    last().hello();
    await flush();
    last().ready();
    last().serverClose(CloseCode.SessionEnded, 'session ended');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ended).toHaveBeenCalledOnce();
    expect(sockets).toHaveLength(1);
    expect(client.store.getState().state).toBe('stopped');
  });

  it('asks whether the session is still valid after an auth failure', async () => {
    const verdicts = [true, false];
    const ended = vi.fn();
    const { client, sockets, last } = setup({ onAuthFailed: async () => verdicts.shift()!, onSessionEnded: ended });
    client.start();
    last().serverClose(CloseCode.AuthFailed);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(2);
    last().serverClose(CloseCode.AuthFailed);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(2);
    expect(ended).toHaveBeenCalledOnce();
    expect(client.store.getState().state).toBe('stopped');
  });

  it('stops when there is no token to identify with', async () => {
    const ended = vi.fn();
    const { client, sockets, last, setToken } = setup({ onSessionEnded: ended });
    setToken(null);
    client.start();
    last().hello();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ended).toHaveBeenCalledOnce();
    expect(sockets).toHaveLength(1);
    expect(client.store.getState().state).toBe('stopped');
  });

  it('retries when the token cannot be fetched (offline)', async () => {
    let fail = true;
    const { client, sockets, last } = setup({
      getToken: async () => {
        if (fail) throw new TypeError('network down');
        return 'tok';
      },
    });
    client.start();
    last().hello();
    await flush();
    expect(client.store.getState().state).toBe('reconnecting');
    fail = false;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(2);
  });

  it('gives up on a socket that never says hello', async () => {
    const { client, sockets } = setup();
    client.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(sockets[0]!.closedByClient).not.toBeNull();
    expect(client.store.getState().state).toBe('reconnecting');
  });

  it('retries immediately on request, for example when the network returns', async () => {
    const { client, sockets, last } = setup({ backoff: { initialMs: 20_000 } });
    client.start();
    last().serverClose(1006);
    client.retryNow();
    expect(sockets).toHaveLength(2);
  });

  it('sends presence updates only while ready, and identifies with the latest status', async () => {
    const { client, last } = setup();
    client.setStatus('idle');
    client.start();
    last().hello();
    await flush();
    expect(last().sent[0]).toMatchObject({ d: { status: 'idle' } });
    last().ready();
    client.setStatus('invisible');
    expect(last().sent.at(-1)).toEqual({ op: 'presence_update', d: { status: 'invisible' } });
  });

  it('stays down after stop', async () => {
    const { client, sockets, last } = setup();
    client.start();
    last().hello();
    await flush();
    last().ready();
    client.stop();
    expect(sockets[0]!.closedByClient?.code).toBe(1000);
    last().serverClose(1000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);
    expect(client.store.getState().state).toBe('stopped');
  });

  it('ignores frames from an abandoned socket', async () => {
    const { client, sockets, last } = setup();
    const created: string[] = [];
    client.on('MESSAGE_CREATE', (m) => created.push(m.id));
    client.start();
    const first = last();
    first.serverClose(1006);
    await vi.advanceTimersByTimeAsync(1_000);
    first.frame('dispatch', { id: 'late' }, 'MESSAGE_CREATE');
    expect(created).toEqual([]);
    expect(sockets).toHaveLength(2);
  });
});

describe('catchUp', () => {
  const ids = (n: number, from: number) => Array.from({ length: n }, (_, i) => ({ id: `m${from + i}` }));

  it('pages until a short page', async () => {
    const cursors: string[] = [];
    const result = await catchUp(
      async (after) => {
        cursors.push(after);
        return cursors.length === 1 ? ids(2, 1) : ids(1, 3);
      },
      'm0',
      { pageSize: 2 },
    );
    expect(cursors).toEqual(['m0', 'm2']);
    expect(result).toEqual({ items: ids(3, 1), complete: true });
  });

  it('reports an incomplete catch-up when the gap is too long', async () => {
    let n = 0;
    const result = await catchUp(async () => ids(2, (n++) * 2), 'm0', { pageSize: 2, maxPages: 3 });
    expect(result.complete).toBe(false);
    expect(result.items).toHaveLength(6);
  });
});
