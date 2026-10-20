import type { PushKeys, PushMode, PushPlatform, PushUnavailableReason, SecretStorage } from '@gotalk/core';

/** The device's current push address: a platform token, or a browser endpoint with the keys it was made with. */
export interface PushDeviceToken {
  value: string;
  apnsEnvironment?: 'production' | 'sandbox';
  /** Web: the VAPID key the browser subscription is bound to. */
  vapidPublicKey?: string;
  /** Web: the browser's own key material for the subscription. */
  keys?: Pick<PushKeys, 'p256dh' | 'auth'>;
}

export type PushPermission = 'granted' | 'denied' | 'default';

/**
 * What a device keeps for one gateway subscription, readable by whatever shows pushes while the app is closed
 * (the Android task, the iOS Notification Service Extension through a shared keychain group). Not the gateway
 * secret, which only the app needs.
 */
export interface StoredPushKeys {
  v: 1;
  instanceId: string;
  instance: string;
  /** Shown with every notification. */
  name: string;
  apiBaseUrl: string;
  userId: string;
  mode: PushMode;
  /** One key per account on the instance. */
  keys: PushKeys[];
  /** iOS `id_only` only: a short-lived access token the extension may use to fetch the notification. */
  accessToken?: string;
}

export interface PushPlatformAdapter {
  /** null where pushes are not received at all (the desktop app). */
  platform: PushPlatform | null;
  /** iOS bundle ID or Android package name, to find this app in the gateway's registry. */
  nativeId: string | null;
  /** Why this device cannot receive pushes, checked before asking for permission. */
  unsupportedReason(): Promise<PushUnavailableReason | null>;
  permission(): Promise<PushPermission>;
  /** Shows the system prompt. Must run from a tap on the web. */
  requestPermission(): Promise<PushPermission>;
  /**
   * The current token or endpoint. Null without permission. On the web, `subscribe` creates (or recreates for a
   * new VAPID key) the browser subscription; without it only an existing one is returned.
   */
  deviceToken(options: { vapidPublicKey?: string; subscribe: boolean }): Promise<PushDeviceToken | null>;
  /** The key material for a new subscription: generated on phones, the browser's own on the web. */
  createKeys(token: PushDeviceToken): Promise<PushKeys | Pick<PushKeys, 'p256dh' | 'auth'>>;
  saveKeys(subscriptionId: string, record: StoredPushKeys): Promise<void>;
  readKeys(subscriptionId: string): Promise<StoredPushKeys | null>;
  deleteKeys(subscriptionId: string): Promise<void>;
  /** Gateway subscription secrets. */
  secrets: SecretStorage;
  /** Called when the platform token changes. */
  onTokenChange(listener: () => void): () => void;
  /** Ends the browser's push subscription once no instance uses it. */
  releaseDevice(): Promise<void>;
  deviceName(): string;
}
