import type { KeyBinding } from '@gotalk/core';
import type * as LiveKit from 'livekit-client';

/** What voice can do on this target. Web and desktop share one implementation, phones another. */
export interface VoicePlatform {
  name: 'web' | 'desktop' | 'native';
  /** Microphone and speaker pickers (phones leave routing to the system). */
  pickDevices: boolean;
  /** The browser can route call audio to a chosen output. */
  pickOutput: boolean;
  shareScreen: boolean;
  /** System-wide in the desktop app, while the window has focus on the web, not on phones. */
  pushToTalk: 'global' | 'window' | 'none';
  flipCamera: boolean;
  micTest: boolean;
  /** Keycaps use Mac symbols. */
  mac: boolean;
}

export interface AudioDevice {
  id: string;
  label: string;
}

export interface MicTestOptions {
  deviceId: string | null;
  noiseSuppression: boolean;
}

/** The functions each platform file provides. */
export interface VoicePlatformApi {
  voicePlatform: VoicePlatform;
  /** livekit-client, with whatever the platform needs set up first. */
  loadLiveKit(): Promise<typeof LiveKit>;
  startMedia(): Promise<void>;
  stopMedia(): Promise<void>;
  /** Plays a remote audio track until the returned function is called. */
  playRemoteAudio(track: LiveKit.RemoteTrack): () => void;
  startPushToTalk(binding: KeyBinding, onChange: (held: boolean) => void, onProblem: (text: string) => void): () => void;
  /** Reports the input level from 0 to 1 until stopped. */
  startMicTest(options: MicTestOptions, onLevel: (level: number) => void): Promise<() => void>;
  listDevices(kind: 'audioinput' | 'audiooutput'): Promise<AudioDevice[]>;
  onDevicesChanged(listener: () => void): () => void;
}
