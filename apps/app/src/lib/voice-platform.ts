import { bindingAccelerator, pressesBinding, releasesBinding, type KeyBinding } from '@gotalk/core';
import * as livekit from 'livekit-client';

import type { VoicePlatformApi } from './voice-platform-types';
import { isDesktop } from './desktop';

const hasDom = typeof document !== 'undefined';

/** Remote audio plays through hidden elements; LiveKit routes them to the chosen speaker. */
let sink: HTMLDivElement | null = null;

function audioSink(): HTMLDivElement {
  if (!sink) {
    sink = document.createElement('div');
    sink.style.display = 'none';
    sink.dataset.gotalk = 'voice-audio';
    document.body.appendChild(sink);
  }
  return sink;
}

/** Push to talk while this window has focus. */
function startWindowPushToTalk(binding: KeyBinding, onChange: (held: boolean) => void): () => void {
  const down = (e: KeyboardEvent) => {
    if (!pressesBinding(binding, e)) return;
    e.preventDefault();
    if (!e.repeat) onChange(true);
  };
  const up = (e: KeyboardEvent) => releasesBinding(binding, e) && onChange(false);
  const release = () => onChange(false);
  window.addEventListener('keydown', down, true);
  window.addEventListener('keyup', up, true);
  window.addEventListener('blur', release);
  return () => {
    window.removeEventListener('keydown', down, true);
    window.removeEventListener('keyup', up, true);
    window.removeEventListener('blur', release);
  };
}

/** Push to talk anywhere on the system, through the desktop shell's global shortcut plugin. */
function startGlobalPushToTalk(binding: KeyBinding, onChange: (held: boolean) => void, onProblem: (text: string) => void): () => void {
  const accelerator = bindingAccelerator(binding);
  let stopped = false;
  let undo: (() => void) | null = null;
  void import('@tauri-apps/plugin-global-shortcut').then(async (shortcuts) => {
    if (stopped) return;
    try {
      await shortcuts.register(accelerator, (e) => onChange(e.state === 'Pressed'));
      if (stopped) return void shortcuts.unregister(accelerator).catch(() => undefined);
      undo = () => void shortcuts.unregister(accelerator).catch(() => undefined);
    } catch {
      if (stopped) return;
      // Another app holds the shortcut: it still works while Gotalk has focus.
      onProblem('Another app is using your push-to-talk key, so it only works while Gotalk is in front. Choose another key in voice settings.');
      undo = startWindowPushToTalk(binding, onChange);
    }
  });
  return () => {
    stopped = true;
    undo?.();
  };
}

export const platform: VoicePlatformApi = {
  voicePlatform: {
    name: isDesktop ? 'desktop' : 'web',
    pickDevices: true,
    pickOutput: hasDom && livekit.supportsAudioOutputSelection(),
    shareScreen: typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function',
    pushToTalk: isDesktop ? 'global' : 'window',
    flipCamera: false,
    micTest: true,
    mac: typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
  },
  loadLiveKit: async () => livekit,
  startMedia: async () => undefined,
  stopMedia: async () => undefined,
  playRemoteAudio(track) {
    if (!hasDom) return () => undefined;
    const el = track.attach();
    audioSink().appendChild(el);
    return () => {
      track.detach(el);
      el.remove();
    };
  },
  startPushToTalk(binding, onChange, onProblem) {
    if (typeof window === 'undefined') return () => undefined;
    return isDesktop ? startGlobalPushToTalk(binding, onChange, onProblem) : startWindowPushToTalk(binding, onChange);
  },
  async startMicTest({ deviceId, noiseSuppression }, onLevel) {
    const track = await livekit.createLocalAudioTrack({ deviceId: deviceId ?? undefined, noiseSuppression, echoCancellation: true, autoGainControl: true });
    const analyser = livekit.createAudioAnalyser(track);
    const timer = setInterval(() => onLevel(analyser.calculateVolume()), 80);
    return () => {
      clearInterval(timer);
      void analyser.cleanup();
      track.stop();
    };
  },
  async listDevices(kind) {
    const devices = await livekit.Room.getLocalDevices(kind, true);
    return devices.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) => ({ id: d.deviceId, label: d.label || `${kind === 'audioinput' ? 'Microphone' : 'Speaker'} ${i + 1}` }));
  },
  onDevicesChanged(listener) {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!md?.addEventListener) return () => undefined;
    md.addEventListener('devicechange', listener);
    return () => md.removeEventListener('devicechange', listener);
  },
};
