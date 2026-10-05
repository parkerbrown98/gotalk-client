import type * as LiveKit from 'livekit-client';

import type { VoicePlatformApi } from './voice-platform-types';

let ready: Promise<typeof LiveKit> | null = null;

// The LiveKit native modules load on first use, so the rest of the app still runs in Expo Go.
async function nativeSdk() {
  try {
    return await import('@livekit/react-native');
  } catch {
    throw new Error('Voice needs a build of Gotalk with calling support; Expo Go does not include it.');
  }
}

export const platform: VoicePlatformApi = {
  voicePlatform: { name: 'native', pickDevices: false, pickOutput: false, shareScreen: false, pushToTalk: 'none', flipCamera: true, micTest: false, mac: false },
  loadLiveKit() {
    ready ??= (async () => {
      const sdk = await nativeSdk();
      try {
        sdk.registerGlobals();
      } catch {
        throw new Error('Voice needs a build of Gotalk with calling support; Expo Go does not include it.');
      }
      return import('livekit-client');
    })().catch((e: unknown) => {
      ready = null;
      throw e;
    });
    return ready;
  },
  async startMedia() {
    await (await nativeSdk()).AudioSession.startAudioSession();
  },
  async stopMedia() {
    await (await nativeSdk()).AudioSession.stopAudioSession();
  },
  // WebRTC plays remote audio by itself on phones.
  playRemoteAudio: () => () => undefined,
  startPushToTalk: () => () => undefined,
  startMicTest: async () => {
    throw new Error('Testing the microphone is not available on phones.');
  },
  listDevices: async () => [],
  onDevicesChanged: () => () => undefined,
};
