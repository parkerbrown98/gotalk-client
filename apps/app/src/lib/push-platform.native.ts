import { generatePushKeys, OTHER_PUSH_CHANNEL, PUSH_CATEGORIES, type PushUnavailableReason, type SecretStorage } from '@gotalk/core';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { PushPermission, PushPlatformAdapter, StoredPushKeys } from './push-platform-types';

export type { PushDeviceToken, PushPermission, PushPlatformAdapter, StoredPushKeys } from './push-platform-types';

/**
 * The keychain group the Notification Service Extension shares with the app. App Groups double as keychain access
 * groups, so no team prefix is needed; `plugins/with-notification-service` gives both targets the entitlement.
 */
export const PUSH_APP_GROUP = `group.${Application.applicationId ?? 'sh.gotalk.app'}`;
/** Read by the extension as service `gotalk.push:no-auth`, account `sub.<subscription_id>`. */
const KEYS_SERVICE = 'gotalk.push';

const keyOptions: SecureStore.SecureStoreOptions = {
  keychainService: KEYS_SERVICE,
  // The extension and the Android task run while the phone is locked.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  ...(Platform.OS === 'ios' ? { accessGroup: PUSH_APP_GROUP } : null),
};

const keysKey = (subscriptionId: string) => `sub.${subscriptionId.replace(/[^A-Za-z0-9._-]/g, '_')}`;

const secrets: SecretStorage = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  delete: (key) => SecureStore.deleteItemAsync(key),
};

const importance: Record<string, Notifications.AndroidImportance> = {
  high: Notifications.AndroidImportance.HIGH,
  default: Notifications.AndroidImportance.DEFAULT,
  low: Notifications.AndroidImportance.LOW,
};

let channelsReady: Promise<void> | null = null;

/** One Android channel per category, so people can silence reactions and keep mentions. Idempotent. */
export function ensurePushChannels(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  channelsReady ??= Promise.all(
    [...PUSH_CATEGORIES, OTHER_PUSH_CHANNEL].map((c) =>
      Notifications.setNotificationChannelAsync(c.id, {
        name: c.label,
        description: c.description,
        importance: importance[c.importance] ?? Notifications.AndroidImportance.DEFAULT,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        showBadge: true,
      }),
    ),
  ).then(
    () => undefined,
    (e) => {
      channelsReady = null;
      throw e;
    },
  );
  return channelsReady;
}

function toPermission(p: Notifications.NotificationPermissionsStatus): PushPermission {
  const ios = p.ios?.status;
  if (ios === Notifications.IosAuthorizationStatus.AUTHORIZED || ios === Notifications.IosAuthorizationStatus.PROVISIONAL || ios === Notifications.IosAuthorizationStatus.EPHEMERAL) {
    return 'granted';
  }
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'default' : 'denied';
}

/** Turns the errors a build without push setup throws into a reason settings can explain. */
export function nativeTokenFailure(error: unknown): PushUnavailableReason | null {
  const message = error instanceof Error ? error.message : String(error);
  if (/FirebaseApp|google-services|aps-environment|entitlement/i.test(message)) return 'build_unconfigured';
  return null;
}

async function apnsEnvironment(): Promise<'production' | 'sandbox'> {
  try {
    const env = await Application.getIosPushNotificationServiceEnvironmentAsync();
    if (env === 'development') return 'sandbox';
    if (env === 'production') return 'production';
  } catch {
    // Older OS versions or a missing provisioning profile: fall back on the build type.
  }
  return __DEV__ ? 'sandbox' : 'production';
}

/** iOS and Android: APNs and FCM tokens through expo-notifications, keys in the keychain or Keystore. */
export const pushPlatform: PushPlatformAdapter = {
  platform: Platform.OS === 'ios' ? 'ios' : 'android',
  nativeId: Application.applicationId,
  async unsupportedReason() {
    return null;
  },
  async permission() {
    return toPermission(await Notifications.getPermissionsAsync());
  },
  async requestPermission() {
    // Android 13 shows the prompt only once a channel exists.
    await ensurePushChannels();
    return toPermission(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } }));
  },
  async deviceToken() {
    if ((await this.permission()) !== 'granted') return null;
    await ensurePushChannels();
    const token = await Notifications.getDevicePushTokenAsync();
    if (typeof token.data !== 'string' || !token.data) return null;
    if (Platform.OS === 'ios') return { value: token.data.toLowerCase(), apnsEnvironment: await apnsEnvironment() };
    return { value: token.data };
  },
  async createKeys() {
    return generatePushKeys((n) => Crypto.getRandomBytes(n));
  },
  async saveKeys(subscriptionId, record) {
    await SecureStore.setItemAsync(keysKey(subscriptionId), JSON.stringify(record), keyOptions);
  },
  async readKeys(subscriptionId) {
    const raw = await SecureStore.getItemAsync(keysKey(subscriptionId), keyOptions);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredPushKeys;
      return parsed.v === 1 && Array.isArray(parsed.keys) ? parsed : null;
    } catch {
      return null;
    }
  },
  async deleteKeys(subscriptionId) {
    await SecureStore.deleteItemAsync(keysKey(subscriptionId), keyOptions);
  },
  secrets,
  onTokenChange(listener) {
    const sub = Notifications.addPushTokenListener(() => listener());
    return () => sub.remove();
  },
  async releaseDevice() {
    // Phones keep their token; the gateway subscriptions were deleted one by one.
  },
  deviceName() {
    return Device.deviceName || Device.modelName || (Platform.OS === 'ios' ? 'iPhone' : 'Android device');
  },
};
