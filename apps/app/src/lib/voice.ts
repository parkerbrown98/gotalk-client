import { ApiError, unwrap, type GotalkClient, type Schemas } from '@gotalk/api-client';
import {
  bindingAccelerator,
  createSpeakingRelay,
  statsTotals,
  telemetrySample,
  type CallQuality,
  type RtcStat,
  type SpeakingRelay,
  type StatsTotals,
  type VoiceState,
} from '@gotalk/core';
import { useQuery } from '@tanstack/react-query';
import type * as LiveKit from 'livekit-client';
import { useMemo } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { useApiClient } from './api';
import { failureMessage } from './failure';
import { useActiveInstance } from './instances';
import { platform } from './voice-platform';
import { loadVoiceSettings, updateVoiceSettings, voiceSettingsStore, type VoiceSettings } from './voice-settings';

export type VoiceConnection = Schemas['VoiceConnection'];
export type { VoiceState };
export const { voicePlatform } = platform;

/** The channel a call is in, with names for the call bars. */
export interface CallTarget {
  channelId: string;
  channelName: string;
  placeId: string;
  placeName: string;
  slug: string;
}

export interface Call extends CallTarget {
  inst: string;
  /** `joining` until the media server connection is up; `reconnecting` while it recovers. */
  status: 'joining' | 'connected' | 'reconnecting';
  sessionId: string | null;
  joinedAt: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
  selfVideo: boolean;
  selfStream: boolean;
  /** What the server allows: Speak (and not server-muted), and Share screen for camera and screen. */
  canSpeak: boolean;
  canStream: boolean;
  serverMute: boolean;
  serverDeaf: boolean;
  quality: CallQuality;
  /** The push-to-talk key is held. */
  talking: boolean;
}

export interface VideoTracks {
  camera?: LiveKit.Track;
  screen?: LiveKit.Track;
}

interface VoiceStoreState {
  call: Call | null;
  /** Who is talking, by user id: from the media server in your call, from the gateway elsewhere. */
  speaking: Record<string, boolean>;
  /** Cameras and screens in your call, by user id. */
  video: Record<string, VideoTracks>;
  /** Why a call ended or an action failed, shown in the call screen and the call bars. */
  notice: { text: string; channelId: string | null; tone: 'warning' | 'info' } | null;
  /** The browser blocked playback until the next click. */
  audioBlocked: boolean;
  /** A moderator moved this call: from one channel to another, for screens showing the old one. */
  moved: { from: string; to: string } | null;
}

export const voiceStore = createStore<VoiceStoreState>(() => ({ call: null, speaking: {}, video: {}, notice: null, audioBlocked: false, moved: null }));

export function useVoice<T>(selector: (s: VoiceStoreState) => T): T {
  return useStore(voiceStore, selector);
}

export const useCall = () => useVoice((s) => s.call);

// ---- The link to the signed-in instance, set by the gateway connection ----

export interface VoiceLink {
  inst: string;
  api: GotalkClient;
  myId: string | undefined;
  setSpeaking(speaking: boolean): void;
  channelName(channelId: string): string | undefined;
}

let link: VoiceLink | null = null;
let relay: SpeakingRelay | null = null;

/** Called when the gateway for an instance starts; the returned function ends any call on it. */
export function attachVoice(next: VoiceLink): () => void {
  link = next;
  relay = createSpeakingRelay((s) => next.setSpeaking(s));
  void loadVoiceSettings();
  return () => {
    if (link !== next) return;
    if (voiceStore.getState().call?.inst === next.inst) void leaveVoice();
    relay?.cancel();
    link = null;
    relay = null;
    voiceStore.setState({ speaking: {}, notice: null, moved: null });
  };
}

// ---- Engine state ----

let lk: typeof LiveKit | null = null;
let room: LiveKit.Room | null = null;
/** Bumped by every join, leave and move, so work for an older attempt stops. */
let generation = 0;
/** A join request is in flight: state events for this user are about it, not about the call. */
let joining = false;
let endTimer: ReturnType<typeof setTimeout> | null = null;
let checkTimer: ReturnType<typeof setTimeout> | null = null;
let telemetryTimer: ReturnType<typeof setInterval> | null = null;
let lastStats: StatsTotals | null = null;
let stopPtt: (() => void) | null = null;
let pttKey: string | null = null;
let micQueue: Promise<void> = Promise.resolve();
/** Deafening is what muted the mic, so undeafening unmutes it too. */
let deafenMuted = false;
const audio = new Map<string, () => void>();

const getCall = () => voiceStore.getState().call;
const patchCall = (patch: Partial<Call>) => voiceStore.setState((s) => (s.call ? { call: { ...s.call, ...patch } } : s));
const notify = (text: string) => voiceStore.setState((s) => ({ notice: { text, channelId: s.call?.channelId ?? null, tone: 'warning' } }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function dismissVoiceNotice(): void {
  voiceStore.setState({ notice: null });
}

function captureOptions(s: VoiceSettings): LiveKit.AudioCaptureOptions {
  return { deviceId: s.inputDeviceId ?? undefined, noiseSuppression: s.noiseSuppression, echoCancellation: true, autoGainControl: true };
}

function mediaProblem(e: unknown, device: 'microphone' | 'camera' | 'screen'): string {
  const name = e instanceof Error ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return device === 'screen' ? 'Gotalk is not allowed to share your screen. Allow screen recording in your system settings.' : `Gotalk can't use your ${device}. Allow access in your browser or system settings, then try again.`;
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return `No ${device} was found. Connect one or choose another in voice settings.`;
  if (name === 'NotReadableError') return `Your ${device} is in use by another app.`;
  return e instanceof Error && e.message ? e.message : `Could not start your ${device}.`;
}

// ---- Joining and leaving ----

/** Joins a voice channel, leaving any other call first. Failures end up in the notice. */
export async function joinVoice(target: CallTarget): Promise<void> {
  const l = link;
  if (!l) return;
  const existing = getCall();
  if (existing && existing.inst === l.inst && existing.channelId === target.channelId) return;
  const gen = ++generation;
  cancelTimers();
  await closeRoom();
  await loadVoiceSettings();
  const prefs = voiceSettingsStore.getState();
  const selfDeaf = prefs.joinDeafened;
  const selfMute = prefs.joinMuted || selfDeaf;
  deafenMuted = selfDeaf && !prefs.joinMuted;
  voiceStore.setState({
    call: {
      ...target,
      inst: l.inst,
      status: 'joining',
      sessionId: null,
      joinedAt: null,
      selfMute,
      selfDeaf,
      selfVideo: false,
      selfStream: false,
      canSpeak: true,
      canStream: false,
      serverMute: false,
      serverDeaf: false,
      quality: 'unknown',
      talking: false,
    },
    video: {},
    notice: null,
    moved: null,
    audioBlocked: false,
  });
  let answered = false;
  joining = true;
  try {
    const conn = unwrap(await l.api.POST('/channels/{channelID}/voice', { params: { path: { channelID: target.channelId } }, body: { self_mute: selfMute, self_deaf: selfDeaf } }));
    answered = true;
    joining = false;
    if (gen !== generation) return;
    await connect(conn, gen);
  } catch (e) {
    joining = false;
    if (gen !== generation) return;
    endCall(failureMessage(e, 'Could not connect to the voice channel. Try again.'));
    // Unless the server refused, it may count this as a join (or still hold the call this one replaced).
    if (answered || existing || !(e instanceof ApiError)) void l.api.DELETE('/users/@me/voice').catch(() => undefined);
  }
}

/** Leaves the call on purpose. */
export async function leaveVoice(): Promise<void> {
  const c = getCall();
  if (!c) return;
  const l = link;
  endCall(null);
  if (l && l.inst === c.inst) await l.api.DELETE('/users/@me/voice').catch(() => undefined);
}

function cancelTimers() {
  if (endTimer) clearTimeout(endTimer);
  if (checkTimer) clearTimeout(checkTimer);
  endTimer = checkTimer = null;
}

/** Ends the call here without telling the server (it already knows, or someone else holds the call now). */
function endCall(text: string | null) {
  const c = getCall();
  generation++;
  joining = false;
  cancelTimers();
  void closeRoom();
  voiceStore.setState({ call: null, video: {}, speaking: {}, audioBlocked: false, notice: text && c ? { text, channelId: c.channelId, tone: 'warning' } : null });
}

/** Ends the call after a moment, unless a move (`VOICE_SERVER_UPDATE`) arrives first. */
function scheduleEnd(text: string) {
  if (endTimer) clearTimeout(endTimer);
  const gen = generation;
  endTimer = setTimeout(() => {
    endTimer = null;
    if (gen === generation) endCall(text);
  }, 1_500);
}

async function closeRoom() {
  const r = room;
  room = null;
  if (telemetryTimer) clearInterval(telemetryTimer);
  telemetryTimer = null;
  lastStats = null;
  stopPtt?.();
  stopPtt = null;
  pttKey = null;
  relay?.set(false);
  for (const stop of audio.values()) stop();
  audio.clear();
  if (!r) return;
  await r.disconnect().catch(() => undefined);
  await platform.stopMedia().catch(() => undefined);
}

/** Connects to the media server with a token from a join or a move. */
async function connect(conn: VoiceConnection, gen: number) {
  const lib = (lk ??= await platform.loadLiveKit());
  await platform.startMedia();
  if (gen !== generation) return;
  const settings = voiceSettingsStore.getState();
  const r = new lib.Room({
    adaptiveStream: true,
    dynacast: true,
    disconnectOnPageLeave: true,
    audioCaptureDefaults: captureOptions(settings),
    audioOutput: settings.outputDeviceId ? { deviceId: settings.outputDeviceId } : undefined,
  });
  room = r;
  wireRoom(lib, r, gen);
  try {
    await r.connect(conn.url, conn.token, { autoSubscribe: true });
  } catch (e) {
    if (room === r) room = null;
    await r.disconnect().catch(() => undefined);
    throw e;
  }
  if (gen !== generation || room !== r) return void r.disconnect().catch(() => undefined);
  cancelTimers();
  applyOwnState(conn.state);
  patchCall({ status: 'connected' });
  voiceStore.setState({ audioBlocked: !r.canPlaybackAudio });
  // A fresh connection has no camera or screen yet, whatever the server remembers.
  if (conn.state.self_video || conn.state.self_stream) void patchSelf({ self_video: false, self_stream: false });
  applyDeafen();
  refreshVideo();
  startTelemetry(r);
  syncPushToTalk();
  await syncMic();
}

/** The server's view of this user's call: the parts it decides. Self flags stay as set here. */
function applyOwnState(s: VoiceState) {
  const c = getCall();
  if (!c) return;
  const regained = s.can_speak && !c.canSpeak;
  const lost = !s.can_speak && c.canSpeak;
  patchCall({
    sessionId: s.session_id,
    joinedAt: s.joined_at,
    channelId: s.channel_id ?? c.channelId,
    canSpeak: s.can_speak,
    canStream: s.can_stream,
    serverMute: s.mute,
    serverDeaf: s.deaf,
  });
  if (regained || lost) void syncMic();
  if (!s.can_stream && (c.selfVideo || c.selfStream)) {
    void room?.localParticipant.setCameraEnabled(false).catch(() => undefined);
    void room?.localParticipant.setScreenShareEnabled(false).catch(() => undefined);
    patchCall({ selfVideo: false, selfStream: false });
  }
}

function wireRoom(lib: typeof LiveKit, r: LiveKit.Room, gen: number) {
  const E = lib.RoomEvent;
  const live = () => room === r && gen === generation;
  r.on(E.Reconnecting, () => live() && patchCall({ status: 'reconnecting' }))
    .on(E.Reconnected, () => live() && patchCall({ status: 'connected' }))
    .on(E.Disconnected, (reason) => live() && onDisconnected(lib, reason))
    .on(E.TrackSubscribed, (track, pub) => {
      if (!live()) return;
      if (track.kind === lib.Track.Kind.Audio) {
        audio.get(track.sid ?? '')?.();
        audio.set(track.sid ?? pub.trackSid, platform.playRemoteAudio(track));
        if (getCall()?.selfDeaf) deafen(pub, true);
      }
      refreshVideo();
    })
    .on(E.TrackUnsubscribed, (track, pub) => {
      const key = track.sid ?? pub.trackSid;
      audio.get(key)?.();
      audio.delete(key);
      if (live()) refreshVideo();
    })
    .on(E.TrackPublished, (pub) => {
      if (!live()) return;
      if (pub.kind === lib.Track.Kind.Audio && getCall()?.selfDeaf) deafen(pub, true);
      refreshVideo();
    })
    .on(E.TrackMuted, () => live() && refreshVideo())
    .on(E.TrackUnmuted, () => live() && refreshVideo())
    .on(E.TrackUnpublished, () => live() && refreshVideo())
    .on(E.LocalTrackPublished, () => live() && refreshVideo())
    .on(E.LocalTrackUnpublished, (pub) => {
      if (!live()) return;
      refreshVideo();
      // Stopped from outside the app: the browser's "Stop sharing", or a camera unplugged.
      const c = getCall();
      if (pub.source === lib.Track.Source.ScreenShare && c?.selfStream) {
        patchCall({ selfStream: false });
        void patchSelf({ self_stream: false });
      } else if (pub.source === lib.Track.Source.Camera && c?.selfVideo) {
        patchCall({ selfVideo: false });
        void patchSelf({ self_video: false });
      }
    })
    .on(E.ParticipantDisconnected, (p) => {
      if (!live()) return;
      voiceStore.setState((s) => ({ speaking: { ...s.speaking, [p.identity]: false } }));
      refreshVideo();
    })
    .on(E.ActiveSpeakersChanged, (speakers) => {
      if (!live()) return;
      const ids = new Set(speakers.map((p) => p.identity));
      const speaking = { ...voiceStore.getState().speaking };
      for (const p of [r.localParticipant, ...r.remoteParticipants.values()]) speaking[p.identity] = ids.has(p.identity);
      voiceStore.setState({ speaking });
      relay?.set(ids.has(r.localParticipant.identity));
    })
    .on(E.ConnectionQualityChanged, (quality, p) => live() && p === r.localParticipant && patchCall({ quality: quality as CallQuality }))
    .on(E.AudioPlaybackStatusChanged, () => live() && voiceStore.setState({ audioBlocked: !r.canPlaybackAudio }))
    .on(E.MediaDevicesError, (e) => live() && notify(mediaProblem(e, 'microphone')));
}

function onDisconnected(lib: typeof LiveKit, reason: LiveKit.DisconnectReason | undefined) {
  const D = lib.DisconnectReason;
  const c = getCall();
  room = null;
  void closeRoom();
  if (!c) return;
  if (reason === D.DUPLICATE_IDENTITY) return endCall(`You joined ${c.channelName} somewhere else, so you left it here.`);
  if (reason === D.PARTICIPANT_REMOVED) return scheduleEnd(`You were disconnected from ${c.channelName}.`);
  if (reason === D.ROOM_DELETED) return scheduleEnd(`${c.channelName} was closed.`);
  void rejoin();
}

/** The media connection dropped for good: ask for a fresh token and connect again, a few times. */
async function rejoin() {
  const c = getCall();
  const l = link;
  if (!c || !l) return;
  const gen = ++generation;
  patchCall({ status: 'reconnecting', selfVideo: false, selfStream: false });
  voiceStore.setState({ video: {} });
  for (const wait of [1_000, 3_000, 6_000]) {
    await sleep(wait);
    const now = getCall();
    if (gen !== generation || !now) return;
    joining = true;
    try {
      const conn = unwrap(await l.api.POST('/channels/{channelID}/voice', { params: { path: { channelID: now.channelId } }, body: { self_mute: now.selfMute, self_deaf: now.selfDeaf } }));
      joining = false;
      if (gen !== generation) return;
      await connect(conn, gen);
      return;
    } catch (e) {
      joining = false;
      if (gen !== generation) return;
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) return endCall(failureMessage(e, `You can no longer join ${now.channelName}.`));
    }
  }
  if (gen !== generation) return;
  const sessionId = getCall()?.sessionId;
  endCall('Lost the connection to voice.');
  // Leave only if the server still holds this call, not one started on another device meanwhile.
  try {
    const held = unwrap(await l.api.GET('/users/@me/voice'));
    if (held.session_id === sessionId) await l.api.DELETE('/users/@me/voice');
  } catch {
    // Not in voice, or unreachable: the server times the call out by itself.
  }
}

// ---- Your microphone, speakers, camera and screen ----

/** Brings the published mic in line with mute, deafen, push to talk and what the server allows. One change at a time. */
function syncMic(): Promise<void> {
  micQueue = micQueue.then(applyMic, applyMic);
  return micQueue;
}

async function applyMic() {
  const r = room;
  const c = getCall();
  const lib = lk;
  if (!r || !c || !lib || c.status === 'joining') return;
  const settings = voiceSettingsStore.getState();
  const ptt = settings.inputMode === 'ptt' && voicePlatform.pushToTalk !== 'none';
  const allowed = c.canSpeak && !c.selfMute && !c.selfDeaf;
  const live = allowed && (!ptt || c.talking);
  const lp = r.localParticipant;
  const pub = lp.getTrackPublication(lib.Track.Source.Microphone);
  try {
    if (live) {
      await lp.setMicrophoneEnabled(true, captureOptions(settings));
    } else if (pub?.track) {
      await lp.setMicrophoneEnabled(false);
    } else if (allowed && ptt) {
      // Publish muted ahead of the first key press, so talking starts the moment the key goes down.
      const track = await lib.createLocalAudioTrack(captureOptions(settings));
      await track.mute();
      if (room === r && !lp.getTrackPublication(lib.Track.Source.Microphone)) await lp.publishTrack(track, { source: lib.Track.Source.Microphone });
      else track.stop();
    }
  } catch (e) {
    if (room !== r) return;
    notify(mediaProblem(e, 'microphone'));
    if (!getCall()?.selfMute) {
      patchCall({ selfMute: true });
      void patchSelf({ self_mute: true });
    }
  }
}

function deafen(pub: LiveKit.TrackPublication, deaf: boolean) {
  const remote = pub as LiveKit.RemoteTrackPublication;
  remote.setEnabled?.(!deaf);
  (remote.track as LiveKit.RemoteAudioTrack | undefined)?.setVolume?.(deaf ? 0 : 1);
}

function applyDeafen() {
  const r = room;
  const deaf = !!getCall()?.selfDeaf;
  if (!r) return;
  for (const p of r.remoteParticipants.values()) for (const pub of p.audioTrackPublications.values()) deafen(pub, deaf);
}

function refreshVideo() {
  const r = room;
  const lib = lk;
  if (!r || !lib) return voiceStore.setState({ video: {} });
  const video: Record<string, VideoTracks> = {};
  for (const p of [r.localParticipant, ...r.remoteParticipants.values()]) {
    for (const pub of p.videoTrackPublications.values()) {
      if (!pub.track || pub.isMuted) continue;
      const slot = pub.source === lib.Track.Source.ScreenShare ? 'screen' : pub.source === lib.Track.Source.Camera ? 'camera' : null;
      if (slot) (video[p.identity] ??= {})[slot] = pub.track;
    }
  }
  voiceStore.setState({ video });
}

async function patchSelf(body: Schemas['VoiceSelfRequest']) {
  const l = link;
  const gen = generation;
  if (!l || !getCall()) return;
  try {
    const s = unwrap(await l.api.PATCH('/users/@me/voice', { body }));
    if (gen === generation) applyOwnState(s);
  } catch (e) {
    if (gen === generation) notify(failureMessage(e, 'Others may not see your latest mute or camera state. Check your connection.'));
  }
}

function remember(c: Pick<Call, 'selfMute' | 'selfDeaf'>) {
  updateVoiceSettings({ joinMuted: c.selfMute && !deafenMuted, joinDeafened: c.selfDeaf });
}

/** Mutes or unmutes; before joining it sets how you join. Unmuting while deafened undeafens too. */
export function setSelfMute(mute: boolean): void {
  const c = getCall();
  if (!c) return updateVoiceSettings({ joinMuted: mute, joinDeafened: mute ? voiceSettingsStore.getState().joinDeafened : false });
  const selfDeaf = mute ? c.selfDeaf : false;
  deafenMuted = false;
  patchCall({ selfMute: mute, selfDeaf });
  remember({ selfMute: mute, selfDeaf });
  applyDeafen();
  void syncMic();
  void patchSelf({ self_mute: mute, self_deaf: selfDeaf });
}

/** Deafening also mutes; undeafening unmutes again unless you had muted yourself first. */
export function setSelfDeaf(deaf: boolean): void {
  const c = getCall();
  if (!c) return updateVoiceSettings({ joinDeafened: deaf });
  let selfMute: boolean;
  if (deaf) {
    deafenMuted = !c.selfMute;
    selfMute = true;
  } else {
    selfMute = c.selfMute && !deafenMuted;
    deafenMuted = false;
  }
  patchCall({ selfDeaf: deaf, selfMute });
  remember({ selfMute, selfDeaf: deaf });
  applyDeafen();
  void syncMic();
  void patchSelf({ self_deaf: deaf, self_mute: selfMute });
}

export async function setCamera(on: boolean): Promise<void> {
  const r = room;
  const c = getCall();
  if (!r || !c) return;
  if (on && !c.canStream) return notify('You need the Share screen permission to turn on your camera here.');
  if (!on) patchCall({ selfVideo: false });
  try {
    await r.localParticipant.setCameraEnabled(on, on ? { facingMode: 'user', resolution: { width: 1280, height: 720, frameRate: 30 } } : undefined);
  } catch (e) {
    patchCall({ selfVideo: false });
    return notify(mediaProblem(e, 'camera'));
  }
  if (room !== r) return;
  patchCall({ selfVideo: on });
  refreshVideo();
  void patchSelf({ self_video: on });
}

let facing: 'user' | 'environment' = 'user';

/** Switches between the front and back camera on phones. */
export async function flipCamera(): Promise<void> {
  const lib = lk;
  const pub = room && lib ? room.localParticipant.getTrackPublication(lib.Track.Source.Camera) : undefined;
  const track = pub?.track as LiveKit.LocalVideoTrack | undefined;
  if (!track) return;
  facing = facing === 'user' ? 'environment' : 'user';
  await track.restartTrack({ facingMode: facing }).catch((e: unknown) => notify(mediaProblem(e, 'camera')));
}

export async function setScreenShare(on: boolean): Promise<void> {
  const r = room;
  const c = getCall();
  if (!r || !c) return;
  if (on && !c.canStream) return notify('You need the Share screen permission to share here.');
  if (!on) patchCall({ selfStream: false });
  try {
    await r.localParticipant.setScreenShareEnabled(
      on,
      on ? { audio: true, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'include', resolution: { width: 1920, height: 1080, frameRate: 15 } } : undefined,
    );
  } catch (e) {
    patchCall({ selfStream: false });
    // Closing the picker is a choice, not a failure; a block by the system is.
    if (e instanceof Error && e.name === 'NotAllowedError' && !/system/i.test(e.message)) return;
    return notify(mediaProblem(e, 'screen'));
  }
  if (room !== r) return;
  patchCall({ selfStream: on });
  refreshVideo();
  void patchSelf({ self_stream: on });
}

/** Lets the browser play call audio after it blocked autoplay; call from a click. */
export function resumeAudio(): void {
  void room?.startAudio().then(() => voiceStore.setState({ audioBlocked: !room?.canPlaybackAudio }));
}

// ---- Push to talk and device changes ----

function syncPushToTalk() {
  const c = getCall();
  const s = voiceSettingsStore.getState();
  const binding = c && room && s.inputMode === 'ptt' && voicePlatform.pushToTalk !== 'none' ? s.pushToTalk : null;
  const key = binding ? bindingAccelerator(binding) : null;
  if (key === pttKey) return;
  stopPtt?.();
  stopPtt = null;
  pttKey = key;
  if (binding) {
    stopPtt = platform.startPushToTalk(
      binding,
      (held) => {
        if (!getCall() || getCall()!.talking === held) return;
        patchCall({ talking: held });
        void syncMic();
      },
      notify,
    );
  } else if (c?.talking) patchCall({ talking: false });
}

voiceSettingsStore.subscribe((next, prev) => {
  if (!room) return;
  if (next.inputMode !== prev.inputMode || next.pushToTalk !== prev.pushToTalk) {
    syncPushToTalk();
    void syncMic();
  }
  if (next.inputDeviceId !== prev.inputDeviceId) void room.switchActiveDevice('audioinput', next.inputDeviceId ?? 'default').catch((e: unknown) => notify(mediaProblem(e, 'microphone')));
  if (next.outputDeviceId !== prev.outputDeviceId) void room.switchActiveDevice('audiooutput', next.outputDeviceId ?? 'default').catch(() => undefined);
  if (next.noiseSuppression !== prev.noiseSuppression && lk) {
    const mic = room.localParticipant.getTrackPublication(lk.Track.Source.Microphone)?.track as LiveKit.LocalAudioTrack | undefined;
    void mic?.restartTrack(captureOptions(next)).catch(() => undefined);
  }
});

// ---- Call-quality telemetry ----

function startTelemetry(r: LiveKit.Room) {
  if (telemetryTimer) clearInterval(telemetryTimer);
  const read = async () => {
    const tracks = [r.localParticipant, ...r.remoteParticipants.values()].flatMap((p) => [...p.trackPublications.values()]).flatMap((pub) => (pub.track ? [pub.track] : []));
    const entries: RtcStat[] = [];
    await Promise.all(
      tracks.map(async (t) => {
        const report = await t.getRTCStatsReport().catch(() => undefined);
        report?.forEach((s: RtcStat) => entries.push(s));
      }),
    );
    return statsTotals(entries, Date.now());
  };
  void read().then((s) => {
    if (room === r) lastStats = s;
  });
  telemetryTimer = setInterval(async () => {
    if (room !== r) return;
    const now = await read();
    const sample = telemetrySample(lastStats, now);
    lastStats = now;
    if (sample && link && room === r) void link.api.POST('/users/@me/voice/telemetry', { body: sample }).catch(() => undefined);
  }, 30_000);
}

// ---- Gateway events ----

/** A user's voice state changed. The place caches are updated by the caller; this handles your own call. */
export function onVoiceState(s: VoiceState): void {
  if (s.channel_id === null && voiceStore.getState().speaking[s.user_id]) voiceStore.setState((st) => ({ speaking: { ...st.speaking, [s.user_id]: false } }));
  const c = getCall();
  if (!link || !c || s.user_id !== link.myId || joining || c.status === 'joining') return;
  if (s.session_id !== c.sessionId) return; // Another device's call; the media server tells this one if it is replaced.
  if (s.channel_id !== null) return applyOwnState(s);
  // The server says this call ended. Being removed or replaced also disconnects the media connection,
  // which ends the call; if the connection is still up a moment later, the server lost track of it.
  if (checkTimer) clearTimeout(checkTimer);
  const gen = generation;
  checkTimer = setTimeout(() => {
    checkTimer = null;
    const now = getCall();
    if (gen !== generation || !now || !room || !link) return;
    joining = true;
    void link.api
      .POST('/channels/{channelID}/voice', { params: { path: { channelID: now.channelId } }, body: { self_mute: now.selfMute, self_deaf: now.selfDeaf } })
      .then((res) => {
        joining = false;
        if (gen === generation && res.data) applyOwnState(res.data.state);
      })
      .catch(() => (joining = false));
  }, 3_000);
}

/** A moderator moved you: connect to the new channel with the token that came with the event. */
export async function onVoiceServerUpdate(conn: VoiceConnection): Promise<void> {
  const c = getCall();
  const to = conn.state.channel_id;
  if (!c || !link || !to || c.inst !== link.inst) return;
  const gen = ++generation;
  cancelTimers();
  await closeRoom();
  const name = link.channelName(to) ?? 'another channel';
  patchCall({ status: 'joining', channelId: to, channelName: name, selfVideo: false, selfStream: false, sessionId: conn.state.session_id });
  voiceStore.setState({ video: {}, moved: { from: c.channelId, to }, notice: { text: `A moderator moved you to ${name}.`, channelId: to, tone: 'info' } });
  try {
    await connect(conn, gen);
  } catch (e) {
    if (gen === generation) endCall(failureMessage(e, `Could not connect to ${name}.`));
  }
}

export function onVoiceSpeaking(e: { user_id: string; channel_id: string; speaking: boolean }): void {
  const c = getCall();
  // In your own call the media server is quicker and already says who is talking.
  if (c && room && e.channel_id === c.channelId) return;
  voiceStore.setState((s) => ({ speaking: { ...s.speaking, [e.user_id]: e.speaking } }));
}

// ---- Who is in which channel ----

export const voiceKeys = {
  all: (inst: string | undefined) => ['voice-states', inst] as const,
  place: (inst: string | undefined, placeId: string | undefined) => ['voice-states', inst, placeId] as const,
};

/** Who is in the voice channels of a place, kept current by `VOICE_STATE_UPDATE`. */
export function useVoiceStates(placeId: string | undefined, enabled = true) {
  const inst = useActiveInstance()?.id;
  const client = useApiClient();
  return useQuery({
    queryKey: voiceKeys.place(inst, placeId),
    enabled: !!client && !!placeId && enabled,
    queryFn: async () => unwrap(await client!.GET('/places/{place}/voice-states', { params: { path: { place: placeId! } } })) ?? [],
  });
}

/** Moderator actions on someone in a voice channel. The server checks permissions and rank. */
export function useVoiceModeration(placeId: string | undefined) {
  const client = useApiClient();
  return useMemo(() => {
    const api = () => {
      if (!client || !placeId) throw new Error('No active instance');
      return client;
    };
    const patch = async (userID: string, body: Schemas['MemberVoiceRequest']) =>
      unwrap(await api().PATCH('/places/{place}/members/{userID}/voice', { params: { path: { place: placeId!, userID } }, body }));
    return {
      setMute: (userId: string, mute: boolean) => patch(userId, { mute }),
      setDeaf: (userId: string, deaf: boolean) => patch(userId, { deaf }),
      move: (userId: string, channelId: string) => patch(userId, { channel_id: channelId }),
      disconnect: async (userId: string) => unwrap(await api().DELETE('/places/{place}/members/{userID}/voice', { params: { path: { place: placeId!, userID: userId } } })),
    };
  }, [client, placeId]);
}
