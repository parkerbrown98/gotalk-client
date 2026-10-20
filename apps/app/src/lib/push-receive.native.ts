import { unwrap } from '@gotalk/api-client';
import {
  base64UrlDecode,
  decodePushPlaintext,
  decryptPushBodyWithAny,
  payloadFromNotification,
  pushDisplay,
  pushFallbackDisplay,
  type PushDisplay,
  type PushEnvelope,
} from '@gotalk/core';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { authManager } from './auth';
import { ensurePushChannels, pushPlatform, type StoredPushKeys } from './push-platform.native';
import { notificationWords, sameInstance, shouldSuppressPush } from './push-shared';

/** Keys in a shown notification's data (Android) or `userInfo.body` (set by the iOS extension). */
const OPEN = 'gotalk_open';
const INSTANCE = 'gotalk_instance';

// Decides what a notification does while the app is open. Pushes already on screen through the realtime
// connection are held back; everything else shows as usual.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
    const instance = typeof data[INSTANCE] === 'string' ? data[INSTANCE] : null;
    const show = !shouldSuppressPush(instance);
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: true };
  },
});

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** `id_only`: fetch the notification with the stored session, within the time Android gives a data message. */
async function fetchNotification(record: StoredPushKeys, notificationId: string): Promise<PushDisplay | null> {
  await authManager.hydrate();
  const client = authManager.clientFor({ id: record.instanceId, apiBaseUrl: record.apiBaseUrl });
  const page = await withTimeout(
    client.GET('/users/@me/notifications', { params: { query: { limit: 50 } } }).then(unwrap),
    15_000,
  ).catch(() => null);
  const n = page?.items?.find((item) => item.id === notificationId);
  if (!n) return null;
  return pushDisplay(payloadFromNotification(record.instance, record.userId, n, notificationWords(n)), record.name);
}

/** What to show for a push: its decrypted text, the fetched notification, or the generic text with the instance. */
export async function displayForEnvelope(envelope: PushEnvelope, record: StoredPushKeys): Promise<PushDisplay> {
  const fallback = pushFallbackDisplay({ origin: record.instance, name: record.name }, envelope.mode === 'id_only' ? envelope.notificationId : null);
  if (envelope.mode === 'encrypted') {
    try {
      const opened = decryptPushBodyWithAny(base64UrlDecode(envelope.body), record.keys);
      const payload = opened ? decodePushPlaintext(opened.plaintext) : null;
      // The instance that holds these keys is the only one that may speak through them.
      if (payload && sameInstance(payload.instance, record.instance)) return pushDisplay(payload, record.name);
    } catch {
      // Unreadable: show the generic text.
    }
    return fallback;
  }
  if (!sameInstance(envelope.instance, record.instance)) return fallback;
  return (await fetchNotification(record, envelope.notificationId).catch(() => null)) ?? fallback;
}

/**
 * Android: FCM data messages from the gateway arrive in the background task (in every app state), are decrypted
 * here and posted to their category's channel. A notification with the same ID replaces the earlier one, so a
 * push delivered twice shows once.
 */
export async function receiveAndroidPush(envelope: PushEnvelope): Promise<void> {
  const record = await pushPlatform.readKeys(envelope.sub);
  // Keys deleted when push was turned off: nothing here can read it, and there is no one to show it for.
  if (!record) return;
  const display = await displayForEnvelope(envelope, record);
  if (shouldSuppressPush(display.instance)) return;
  await ensurePushChannels();
  await Notifications.scheduleNotificationAsync({
    ...(display.notificationId ? { identifier: `${record.instance}|${display.notificationId}` } : null),
    content: {
      title: display.title,
      subtitle: display.subtitle,
      body: display.body || null,
      data: { [OPEN]: display.openPath, [INSTANCE]: display.instance },
      ...(display.badge !== null ? { badge: display.badge } : null),
    },
    trigger: { channelId: display.channelId },
  });
}

let lastHandled: string | null = null;

function openFromResponse(response: Notifications.NotificationResponse | null) {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  const key = `${response.notification.request.identifier}|${response.notification.date}`;
  if (key === lastHandled) return;
  lastHandled = key;
  const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
  const path = typeof data[OPEN] === 'string' && data[OPEN].startsWith('/') ? data[OPEN] : '/inbox';
  router.push(path as Href);
}

/** Opens the screen a tapped notification points at, including the one that launched the app. */
export function usePushOpening(): void {
  useEffect(() => {
    let alive = true;
    // Give the navigator a frame to mount before routing the launch notification.
    const timer = setTimeout(() => {
      void Notifications.getLastNotificationResponseAsync()
        .then((r) => alive && openFromResponse(r))
        .catch(() => undefined);
    }, 0);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => openFromResponse(r));
    return () => {
      alive = false;
      clearTimeout(timer);
      sub.remove();
    };
  }, []);
}

/** Keeps the app icon's badge at the account's unread count while the app is open. */
export function setAppBadge(count: number): void {
  if (Platform.OS === 'web') return;
  void Notifications.setBadgeCountAsync(Math.max(0, count)).catch(() => undefined);
}
