import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_PUSH_TO_TALK,
  applyVoiceState,
  bindingAccelerator,
  bindingFromEvent,
  bindingLabels,
  callDuration,
  createSpeakingRelay,
  gridColumns,
  isKeyBinding,
  micStatus,
  orderTiles,
  pressesBinding,
  qualityLook,
  releasesBinding,
  statsTotals,
  telemetrySample,
  voiceStatesByChannel,
  type StatsTotals,
  type VoiceState,
} from './voice.ts';

function state(over: Partial<VoiceState> & { user_id: string }): VoiceState {
  return {
    can_speak: true,
    can_stream: true,
    channel_id: 'c1',
    connected: true,
    deaf: false,
    joined_at: '2026-10-05T10:00:00Z',
    mute: false,
    place_id: 'p1',
    self_deaf: false,
    self_mute: false,
    self_stream: false,
    self_video: false,
    session_id: `s-${over.user_id}`,
    user: { id: over.user_id, username: over.user_id, display_name: over.user_id } as VoiceState['user'],
    ...over,
  };
}

describe('applyVoiceState', () => {
  const ana = state({ user_id: 'ana' });
  const jonas = state({ user_id: 'jonas', joined_at: '2026-10-05T09:00:00Z' });

  it('adds a newcomer and replaces a changed state', () => {
    const list = applyVoiceState([ana], jonas, 'p1');
    expect(list).toEqual([ana, jonas]);
    const muted = { ...ana, self_mute: true };
    expect(applyVoiceState(list, muted, 'p1')).toEqual([muted, jonas]);
  });

  it('removes only the stay a "left" update names', () => {
    expect(applyVoiceState([ana, jonas], { ...ana, channel_id: null }, 'p1')).toEqual([jonas]);
    // Ana rejoined from another device before the old stay's "left" arrived.
    const rejoined = { ...ana, session_id: 'newer' };
    const list = [rejoined, jonas];
    expect(applyVoiceState(list, { ...ana, channel_id: null }, 'p1')).toBe(list);
  });

  it('moves someone who joins a channel in another place out of this one', () => {
    expect(applyVoiceState([ana, jonas], { ...ana, place_id: 'p2', channel_id: 'x', session_id: 'n' }, 'p1')).toEqual([jonas]);
    const list = [jonas];
    expect(applyVoiceState(list, { ...ana, place_id: 'p2' }, 'p1')).toBe(list);
  });

  it('groups by channel, earliest first', () => {
    const tomas = state({ user_id: 'tomas', channel_id: 'c2' });
    expect(voiceStatesByChannel([ana, tomas, jonas])).toEqual({ c1: [jonas, ana], c2: [tomas] });
  });
});

describe('micStatus', () => {
  it('shows deafened over muted over live', () => {
    const s = { self_mute: false, self_deaf: false, mute: false, deaf: false, can_speak: true };
    expect(micStatus(s)).toBe('live');
    expect(micStatus({ ...s, mute: true })).toBe('muted');
    expect(micStatus({ ...s, can_speak: false })).toBe('muted');
    expect(micStatus({ ...s, self_mute: true, deaf: true })).toBe('deafened');
  });
});

describe('callDuration', () => {
  it('formats hours, minutes and seconds', () => {
    const start = '2026-10-05T10:00:00Z';
    expect(callDuration(start, Date.parse(start) + (42 * 60 + 18) * 1000)).toBe('00:42:18');
    expect(callDuration(start, Date.parse(start) + (3 * 3600 + 5) * 1000)).toBe('03:00:05');
    expect(callDuration(start, Date.parse(start) - 5000)).toBe('00:00:00');
    expect(callDuration('nonsense', 0)).toBe('00:00:00');
  });
});

describe('qualityLook', () => {
  it('maps LiveKit quality to bars and words', () => {
    expect(qualityLook('excellent')).toEqual({ bars: 4, label: 'Good connection', tone: 'success' });
    expect(qualityLook('poor').tone).toBe('warning');
    expect(qualityLook('lost').bars).toBe(0);
    expect(qualityLook('unknown').label).toBe('Checking connection');
  });
});

describe('telemetry', () => {
  it('counts shared entries once and prefers the selected candidate pair', () => {
    const transport = { id: 'CP1', type: 'candidate-pair', nominated: true, state: 'succeeded', currentRoundTripTime: 0.042 };
    const t = statsTotals(
      [
        { id: 'IA', type: 'inbound-rtp', kind: 'audio', packetsReceived: 900, packetsLost: 10, bytesReceived: 50_000, jitter: 0.004 },
        transport,
        { id: 'IB', type: 'inbound-rtp', kind: 'audio', packetsReceived: 100, packetsLost: 0, bytesReceived: 5_000, jitter: 0.008 },
        transport,
        { id: 'O', type: 'outbound-rtp', bytesSent: 20_000 },
        { id: 'R', type: 'remote-inbound-rtp', roundTripTime: 0.5 },
      ],
      1_000,
    );
    expect(t).toEqual({ at: 1_000, packetsReceived: 1_000, packetsLost: 10, bytesReceived: 55_000, bytesSent: 20_000, jitterMs: 6, rttMs: 42 });
  });

  it('falls back to the remote round trip', () => {
    expect(statsTotals([{ id: 'R', type: 'remote-inbound-rtp', roundTripTime: 0.1 }], 0).rttMs).toBe(100);
    expect(statsTotals([], 0)).toMatchObject({ rttMs: null, jitterMs: null });
  });

  it('reports the period between two readings', () => {
    const a: StatsTotals = { at: 0, packetsReceived: 1_000, packetsLost: 0, bytesReceived: 0, bytesSent: 0, jitterMs: 5, rttMs: 40 };
    const b: StatsTotals = { at: 10_000, packetsReceived: 1_950, packetsLost: 50, bytesReceived: 40_000, bytesSent: 10_000, jitterMs: 7, rttMs: 60 };
    expect(telemetrySample(null, a)).toBeNull();
    expect(telemetrySample(b, a)).toBeNull();
    expect(telemetrySample(a, b)).toEqual({ packet_loss: 0.05, bitrate_kbps: 40, jitter_ms: 7, rtt_ms: 60 });
  });

  it('stays within the server limits', () => {
    const a: StatsTotals = { at: 0, packetsReceived: 0, packetsLost: 0, bytesReceived: 0, bytesSent: 0, jitterMs: null, rttMs: null };
    const silent = telemetrySample(a, { ...a, at: 1_000 });
    expect(silent).toEqual({ packet_loss: 0, bitrate_kbps: 0 });
    // A counter reset (a new transport after a reconnect) must not go negative.
    const reset = telemetrySample({ ...a, packetsReceived: 500, bytesReceived: 9_000 }, { ...a, at: 1_000, rttMs: 99_999 });
    expect(reset).toEqual({ packet_loss: 0, bitrate_kbps: 0, rtt_ms: 60_000 });
  });
});

describe('push to talk', () => {
  const ev = (code: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({ code, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });

  it('waits for a real key while only modifiers are down', () => {
    expect(bindingFromEvent(ev('AltLeft', { altKey: true }))).toBeNull();
    expect(bindingFromEvent(ev('Space', { altKey: true }))).toEqual(DEFAULT_PUSH_TO_TALK);
    expect(bindingFromEvent(ev('F13'))).toEqual({ code: 'F13', alt: false, ctrl: false, meta: false, shift: false });
  });

  it('presses on the exact combination and releases on the key or a modifier', () => {
    expect(pressesBinding(DEFAULT_PUSH_TO_TALK, ev('Space', { altKey: true }))).toBe(true);
    expect(pressesBinding(DEFAULT_PUSH_TO_TALK, ev('Space'))).toBe(false);
    expect(pressesBinding(DEFAULT_PUSH_TO_TALK, ev('Space', { altKey: true, shiftKey: true }))).toBe(false);
    expect(releasesBinding(DEFAULT_PUSH_TO_TALK, ev('Space'))).toBe(true);
    expect(releasesBinding(DEFAULT_PUSH_TO_TALK, ev('AltRight'))).toBe(true);
    expect(releasesBinding(DEFAULT_PUSH_TO_TALK, ev('ShiftLeft'))).toBe(false);
  });

  it('labels keys for each platform and for the desktop shortcut', () => {
    expect(bindingLabels(DEFAULT_PUSH_TO_TALK, true)).toEqual(['⌥', 'Space']);
    expect(bindingLabels(DEFAULT_PUSH_TO_TALK, false)).toEqual(['Alt', 'Space']);
    const b = { code: 'KeyV', alt: false, ctrl: true, meta: true, shift: true };
    expect(bindingLabels(b, true)).toEqual(['⌃', '⇧', '⌘', 'V']);
    expect(bindingLabels({ ...b, code: 'Backquote' }, false)).toEqual(['Ctrl', 'Shift', 'Win', '`']);
    expect(bindingAccelerator(b)).toBe('Control+Shift+Super+KeyV');
    expect(bindingAccelerator(DEFAULT_PUSH_TO_TALK)).toBe('Alt+Space');
  });

  it('validates stored bindings', () => {
    expect(isKeyBinding(DEFAULT_PUSH_TO_TALK)).toBe(true);
    expect(isKeyBinding({ code: '', alt: true, ctrl: false, meta: false, shift: false })).toBe(false);
    expect(isKeyBinding({ code: 'Space' })).toBe(false);
    expect(isKeyBinding(null)).toBe(false);
  });
});

describe('createSpeakingRelay', () => {
  afterEach(() => vi.useRealTimers());

  it('sends the first change at once and collapses the rest into one send per interval', () => {
    vi.useFakeTimers();
    const sent: boolean[] = [];
    const relay = createSpeakingRelay((s) => sent.push(s), { minIntervalMs: 1_500, now: () => Date.now() });
    relay.set(true);
    expect(sent).toEqual([true]);
    relay.set(false);
    relay.set(true);
    relay.set(false);
    expect(sent).toEqual([true]);
    vi.advanceTimersByTime(1_500);
    expect(sent).toEqual([true, false]);
    // Flickering back to where it was sends nothing.
    relay.set(true);
    relay.set(false);
    vi.advanceTimersByTime(5_000);
    expect(sent).toEqual([true, false]);
  });

  it('stays under the gateway limit however fast speech flickers', () => {
    vi.useFakeTimers();
    let count = 0;
    const relay = createSpeakingRelay(() => count++, { now: () => Date.now() });
    for (let i = 0; i < 600; i++) {
      relay.set(i % 2 === 0);
      vi.advanceTimersByTime(100);
    }
    expect(count).toBeLessThanOrEqual(41);
  });

  it('forgets a pending change when cancelled', () => {
    vi.useFakeTimers();
    const sent: boolean[] = [];
    const relay = createSpeakingRelay((s) => sent.push(s), { now: () => Date.now() });
    relay.set(true);
    relay.set(false);
    relay.cancel();
    vi.advanceTimersByTime(5_000);
    expect(sent).toEqual([true]);
  });
});

describe('layout', () => {
  it('puts cameras first, then arrival order', () => {
    const tiles = [
      { userId: 'a', joinedAt: '2', camera: false },
      { userId: 'b', joinedAt: '3', camera: true },
      { userId: 'c', joinedAt: '1', camera: false },
      { userId: 'd', joinedAt: '4', camera: true },
    ];
    expect(orderTiles(tiles).map((t) => t.userId)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('chooses grid columns', () => {
    expect([1, 2, 4, 5, 9, 10].map((n) => gridColumns(n, true))).toEqual([1, 2, 2, 3, 3, 4]);
    expect([1, 2, 7].map((n) => gridColumns(n, false))).toEqual([1, 2, 2]);
  });
});
