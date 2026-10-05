import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PUSH_TO_TALK, isKeyBinding, type KeyBinding } from '@gotalk/core';
import { useEffect } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/** How the mic goes live: whenever you talk, or only while the push-to-talk key is held. */
export type InputMode = 'voice' | 'ptt';

/** Voice preferences for this device, shared by every instance. */
export interface VoiceSettings {
  inputMode: InputMode;
  pushToTalk: KeyBinding;
  /** Null follows the system default. */
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  noiseSuppression: boolean;
  /** Mute and deafen carry over to the next call, as set last. */
  joinMuted: boolean;
  joinDeafened: boolean;
}

const KEY = 'gotalk.voice';

const defaults: VoiceSettings = {
  inputMode: 'voice',
  pushToTalk: DEFAULT_PUSH_TO_TALK,
  inputDeviceId: null,
  outputDeviceId: null,
  noiseSuppression: true,
  joinMuted: false,
  joinDeafened: false,
};

export const voiceSettingsStore = createStore<VoiceSettings & { loaded: boolean }>(() => ({ ...defaults, loaded: false }));

function parse(raw: string | null): Partial<VoiceSettings> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<VoiceSettings> = {};
    if (v.inputMode === 'voice' || v.inputMode === 'ptt') out.inputMode = v.inputMode;
    if (isKeyBinding(v.pushToTalk)) out.pushToTalk = v.pushToTalk;
    if (typeof v.inputDeviceId === 'string') out.inputDeviceId = v.inputDeviceId;
    if (typeof v.outputDeviceId === 'string') out.outputDeviceId = v.outputDeviceId;
    for (const k of ['noiseSuppression', 'joinMuted', 'joinDeafened'] as const) if (typeof v[k] === 'boolean') out[k] = v[k];
    return out;
  } catch {
    return {};
  }
}

let loading: Promise<void> | null = null;

export function loadVoiceSettings(): Promise<void> {
  loading ??= AsyncStorage.getItem(KEY)
    .catch(() => null)
    .then((raw) => voiceSettingsStore.setState((s) => ({ ...s, ...parse(raw), loaded: true })));
  return loading;
}

export function updateVoiceSettings(patch: Partial<VoiceSettings>): void {
  voiceSettingsStore.setState(patch);
  const { loaded: _loaded, ...rest } = voiceSettingsStore.getState();
  void AsyncStorage.setItem(KEY, JSON.stringify(rest)).catch(() => undefined);
}

export function useVoiceSettings(): VoiceSettings {
  const settings = useStore(voiceSettingsStore);
  useEffect(() => void loadVoiceSettings(), []);
  return settings;
}
