import type { Schemas } from '@gotalk/api-client';

export type VoiceState = Schemas['VoiceState'];
export type VoiceTelemetry = Schemas['VoiceTelemetryRequest'];

// ---- Who is where ----

/**
 * Applies a `VOICE_STATE_UPDATE` to the voice states of one place. A user is in one voice channel at
 * a time, so joining a channel elsewhere removes them here. A "left" update (`channel_id` null) only
 * removes the stay it names: a newer stay of the same user stays put.
 */
export function applyVoiceState(list: readonly VoiceState[], update: VoiceState, placeId: string): VoiceState[] {
  const held = list.find((s) => s.user_id === update.user_id);
  if (update.channel_id === null) {
    if (!held || held.session_id !== update.session_id) return list as VoiceState[];
    return list.filter((s) => s !== held);
  }
  if (update.place_id !== placeId) return held ? list.filter((s) => s !== held) : (list as VoiceState[]);
  if (!held) return [...list, update];
  return list.map((s) => (s === held ? update : s));
}

/** Voice states grouped by channel, earliest arrival first. */
export function voiceStatesByChannel(list: readonly VoiceState[]): Record<string, VoiceState[]> {
  const out: Record<string, VoiceState[]> = {};
  for (const s of [...list].sort((a, b) => a.joined_at.localeCompare(b.joined_at))) {
    if (!s.channel_id) continue;
    (out[s.channel_id] ??= []).push(s);
  }
  return out;
}

/** What a participant's mic icon shows: deafened beats muted, which beats a live mic. */
export function micStatus(s: Pick<VoiceState, 'self_mute' | 'self_deaf' | 'mute' | 'deaf' | 'can_speak'>): 'deafened' | 'muted' | 'live' {
  if (s.self_deaf || s.deaf) return 'deafened';
  if (s.self_mute || s.mute || !s.can_speak) return 'muted';
  return 'live';
}

// ---- Time in a call ----

/** "00:42:18": how long since `fromIso`, for the call's top bar. */
export function callDuration(fromIso: string, now: number = Date.now()): string {
  const start = new Date(fromIso).getTime();
  if (Number.isNaN(start)) return '00:00:00';
  const total = Math.max(0, Math.floor((now - start) / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

// ---- Connection quality ----

/** LiveKit's connection quality for the local participant. */
export type CallQuality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

export interface QualityLook {
  /** Lit bars out of four. */
  bars: number;
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'muted';
}

export function qualityLook(q: CallQuality): QualityLook {
  switch (q) {
    case 'excellent':
      return { bars: 4, label: 'Good connection', tone: 'success' };
    case 'good':
      return { bars: 3, label: 'Good connection', tone: 'success' };
    case 'poor':
      return { bars: 1, label: 'Poor connection', tone: 'warning' };
    case 'lost':
      return { bars: 0, label: 'Connection lost', tone: 'danger' };
    default:
      return { bars: 0, label: 'Checking connection', tone: 'muted' };
  }
}

// ---- Call-quality telemetry ----

/** Running totals read from WebRTC stats at one moment. */
export interface StatsTotals {
  /** Milliseconds, any clock. */
  at: number;
  packetsReceived: number;
  packetsLost: number;
  bytesReceived: number;
  bytesSent: number;
  /** Average jitter of incoming audio right now, if any. */
  jitterMs: number | null;
  /** Round trip to the media server right now, if known. */
  rttMs: number | null;
}

/** The fields of `RTCStats` entries this reads. */
export interface RtcStat {
  id: string;
  type: string;
  kind?: string;
  packetsReceived?: number;
  packetsLost?: number;
  bytesReceived?: number;
  bytesSent?: number;
  jitter?: number;
  nominated?: boolean;
  selected?: boolean;
  state?: string;
  currentRoundTripTime?: number;
  roundTripTime?: number;
}

/**
 * Totals across the stats of every track in a call. Each track's report repeats shared entries
 * (the transport, the candidate pair), so entries count once by id.
 */
export function statsTotals(entries: Iterable<RtcStat>, at: number): StatsTotals {
  const seen = new Map<string, RtcStat>();
  for (const e of entries) seen.set(e.id, e);
  const totals: StatsTotals = { at, packetsReceived: 0, packetsLost: 0, bytesReceived: 0, bytesSent: 0, jitterMs: null, rttMs: null };
  const jitters: number[] = [];
  let remoteRtt: number | null = null;
  for (const e of seen.values()) {
    if (e.type === 'inbound-rtp') {
      totals.packetsReceived += e.packetsReceived ?? 0;
      totals.packetsLost += Math.max(0, e.packetsLost ?? 0);
      totals.bytesReceived += e.bytesReceived ?? 0;
      if (e.kind === 'audio' && typeof e.jitter === 'number') jitters.push(e.jitter * 1000);
    } else if (e.type === 'outbound-rtp') {
      totals.bytesSent += e.bytesSent ?? 0;
    } else if (e.type === 'candidate-pair' && (e.selected || (e.nominated && e.state === 'succeeded')) && typeof e.currentRoundTripTime === 'number') {
      totals.rttMs = Math.max(totals.rttMs ?? 0, e.currentRoundTripTime * 1000);
    } else if (e.type === 'remote-inbound-rtp' && typeof e.roundTripTime === 'number') {
      remoteRtt = Math.max(remoteRtt ?? 0, e.roundTripTime * 1000);
    }
  }
  if (totals.rttMs === null) totals.rttMs = remoteRtt;
  if (jitters.length) totals.jitterMs = jitters.reduce((a, b) => a + b, 0) / jitters.length;
  return totals;
}

const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Number.isFinite(v) ? v : 0));

/**
 * One telemetry report for the period between two readings, within the server's limits. Null for the
 * first reading (there is no period yet) or when the clock did not move.
 */
export function telemetrySample(prev: StatsTotals | null, now: StatsTotals): VoiceTelemetry | null {
  if (!prev || now.at <= prev.at) return null;
  const received = Math.max(0, now.packetsReceived - prev.packetsReceived);
  const lost = Math.max(0, now.packetsLost - prev.packetsLost);
  const bytes = Math.max(0, now.bytesReceived - prev.bytesReceived) + Math.max(0, now.bytesSent - prev.bytesSent);
  const sample: VoiceTelemetry = {
    packet_loss: received + lost > 0 ? clamp(lost / (received + lost), 1) : 0,
    // Bits per millisecond are kilobits per second.
    bitrate_kbps: clamp((bytes * 8) / (now.at - prev.at), 100_000),
  };
  if (now.jitterMs !== null) sample.jitter_ms = clamp(now.jitterMs, 10_000);
  if (now.rttMs !== null) sample.rtt_ms = clamp(now.rttMs, 60_000);
  return sample;
}

// ---- Push to talk ----

/** A key with modifiers, by physical key (`KeyboardEvent.code`), so layouts do not change it. */
export interface KeyBinding {
  code: string;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

export const DEFAULT_PUSH_TO_TALK: KeyBinding = { code: 'Space', alt: true, ctrl: false, meta: false, shift: false };

export interface KeyEventLike {
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

const MODIFIER_CODES: Record<string, keyof Omit<KeyBinding, 'code'>> = {
  AltLeft: 'alt',
  AltRight: 'alt',
  ControlLeft: 'ctrl',
  ControlRight: 'ctrl',
  MetaLeft: 'meta',
  MetaRight: 'meta',
  OSLeft: 'meta',
  OSRight: 'meta',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
};

/** The binding a key press makes, or null while only modifiers are down (keep listening). */
export function bindingFromEvent(e: KeyEventLike): KeyBinding | null {
  if (!e.code || e.code in MODIFIER_CODES) return null;
  return { code: e.code, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey };
}

/** Whether a key-down starts push to talk. */
export function pressesBinding(b: KeyBinding, e: KeyEventLike): boolean {
  return e.code === b.code && e.altKey === b.alt && e.ctrlKey === b.ctrl && e.metaKey === b.meta && e.shiftKey === b.shift;
}

/** Whether a key-up ends push to talk: the key itself, or one of its modifiers, let go. */
export function releasesBinding(b: KeyBinding, e: Pick<KeyEventLike, 'code'>): boolean {
  if (e.code === b.code) return true;
  const mod = MODIFIER_CODES[e.code];
  return !!mod && b[mod];
}

const KEY_NAMES: Record<string, string> = {
  Space: 'Space',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  CapsLock: 'Caps Lock',
};

function keyName(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1]!;
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (digit) return digit[1]!;
  return code;
}

/** Keycap labels, e.g. ["⌥", "Space"] on a Mac or ["Alt", "Space"] elsewhere. */
export function bindingLabels(b: KeyBinding, mac: boolean): string[] {
  const out: string[] = [];
  if (b.ctrl) out.push(mac ? '⌃' : 'Ctrl');
  if (b.alt) out.push(mac ? '⌥' : 'Alt');
  if (b.shift) out.push(mac ? '⇧' : 'Shift');
  if (b.meta) out.push(mac ? '⌘' : 'Win');
  out.push(keyName(b.code));
  return out;
}

/** The shortcut string the desktop app's global shortcut plugin takes, e.g. "Alt+Space". */
export function bindingAccelerator(b: KeyBinding): string {
  const parts: string[] = [];
  if (b.ctrl) parts.push('Control');
  if (b.alt) parts.push('Alt');
  if (b.shift) parts.push('Shift');
  if (b.meta) parts.push('Super');
  parts.push(b.code);
  return parts.join('+');
}

export function isKeyBinding(v: unknown): v is KeyBinding {
  if (!v || typeof v !== 'object') return false;
  const b = v as Record<string, unknown>;
  return typeof b.code === 'string' && b.code !== '' && ['alt', 'ctrl', 'meta', 'shift'].every((k) => typeof b[k] === 'boolean');
}

// ---- Speaking indicators over the gateway ----

export interface SpeakingRelay {
  set(speaking: boolean): void;
  /** Drops anything waiting, e.g. after leaving the call. */
  cancel(): void;
}

/**
 * Relays the local speaking state without flooding the gateway, which closes connections that send
 * more than 120 frames a minute. Sends at most once per `minIntervalMs`; changes in between collapse
 * into the latest state, sent when the interval is up (nothing if it ends where it started).
 */
export function createSpeakingRelay(
  send: (speaking: boolean) => void,
  { minIntervalMs = 1_500, now = () => Date.now() }: { minIntervalMs?: number; now?: () => number } = {},
): SpeakingRelay {
  let sent = false;
  let wanted = false;
  let lastAt = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    if (wanted === sent) return;
    sent = wanted;
    lastAt = now();
    send(sent);
  };
  return {
    set(speaking) {
      wanted = speaking;
      if (timer) return;
      const wait = lastAt + minIntervalMs - now();
      if (wait <= 0) flush();
      else timer = setTimeout(flush, wait);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      wanted = sent = false;
    },
  };
}

// ---- Layout ----

export interface TileInput {
  userId: string;
  joinedAt: string;
  camera: boolean;
}

/** Tiles in a call: cameras first, then everyone else, each in the order they arrived. */
export function orderTiles<T extends TileInput>(tiles: readonly T[]): T[] {
  return [...tiles].sort((a, b) => Number(b.camera) - Number(a.camera) || a.joinedAt.localeCompare(b.joinedAt) || a.userId.localeCompare(b.userId));
}

/** Columns for an even grid of `count` tiles: two on phones, up to four on wide screens. */
export function gridColumns(count: number, wide: boolean): number {
  if (!wide) return count <= 1 ? 1 : 2;
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}
