import { base64UrlDecode, base64UrlEncode, createLocalStorageSecrets, describeUserAgent } from '@gotalk/core';

import { isDesktop } from './desktop';
import type { PushPermission, PushPlatformAdapter } from './push-platform-types';

export type { PushDeviceToken, PushPermission, PushPlatformAdapter, StoredPushKeys } from './push-platform-types';

/** Served from `public/`, so it ships at the root of the web export. */
export const PUSH_SERVICE_WORKER = '/push-sw.js';

const nav = () => (typeof navigator === 'undefined' ? undefined : navigator);

function browserSupportsPush(): boolean {
  const n = nav();
  return !!n && 'serviceWorker' in n && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
}

function isAppleMobile(): boolean {
  const n = nav();
  if (!n) return false;
  // iPadOS reports itself as a Mac; touch points give it away.
  return /iPhone|iPad|iPod/.test(n.userAgent) || (/Macintosh/.test(n.userAgent) && n.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (nav() as { standalone?: boolean } | undefined)?.standalone === true;
}

function isBrave(): boolean {
  return !!(nav() as { brave?: unknown } | undefined)?.brave;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const sw = nav()!.serviceWorker;
  await sw.register(PUSH_SERVICE_WORKER, { scope: '/' });
  return sw.ready;
}

function keyOf(subscription: PushSubscription): string | null {
  const key = subscription.options?.applicationServerKey;
  return key ? base64UrlEncode(new Uint8Array(key)) : null;
}

/** The browser's own error for a refused subscription, made actionable where we can tell why. */
export class BrowserPushError extends Error {
  constructor(
    message: string,
    readonly reason: 'brave' | 'blocked' | 'failed',
  ) {
    super(message);
    this.name = 'BrowserPushError';
  }
}

/** Browsers: Web Push through a service worker. The desktop app does not receive pushes yet. */
export const pushPlatform: PushPlatformAdapter = {
  platform: isDesktop ? null : 'web',
  nativeId: null,
  async unsupportedReason() {
    if (isDesktop) return 'desktop';
    if (isAppleMobile() && !isStandalone()) return 'ios_not_installed';
    if (!browserSupportsPush()) return 'browser_unsupported';
    return null;
  },
  async permission() {
    if (!browserSupportsPush()) return 'denied';
    return Notification.permission as PushPermission;
  },
  async requestPermission() {
    if (!browserSupportsPush()) return 'denied';
    return (await Notification.requestPermission()) as PushPermission;
  },
  async deviceToken({ vapidPublicKey, subscribe }) {
    if (!browserSupportsPush() || Notification.permission !== 'granted') return null;
    const reg = await registration();
    let subscription = await reg.pushManager.getSubscription();
    if (subscription && vapidPublicKey && keyOf(subscription) !== vapidPublicKey && subscribe) {
      // A subscription is bound to its VAPID key; a new key needs a new subscription.
      await subscription.unsubscribe();
      subscription = null;
    }
    if (!subscription) {
      if (!subscribe || !vapidPublicKey) return null;
      try {
        subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlDecode(vapidPublicKey) as BufferSource });
      } catch (e) {
        if (isBrave()) throw new BrowserPushError('Brave blocked the push subscription.', 'brave');
        if (e instanceof DOMException && e.name === 'NotAllowedError') throw new BrowserPushError('The browser blocked notifications for this site.', 'blocked');
        throw new BrowserPushError(e instanceof Error ? e.message : 'The browser could not subscribe to push notifications.', 'failed');
      }
    }
    const p256dh = subscription.getKey('p256dh');
    const auth = subscription.getKey('auth');
    if (!p256dh || !auth) return null;
    return {
      value: subscription.endpoint,
      vapidPublicKey: keyOf(subscription) ?? vapidPublicKey,
      keys: { p256dh: base64UrlEncode(new Uint8Array(p256dh)), auth: base64UrlEncode(new Uint8Array(auth)) },
    };
  },
  async createKeys(token) {
    if (!token.keys) throw new Error('The browser subscription has no keys.');
    return token.keys;
  },
  // The browser keeps the private key; the service worker gets pushes already decrypted.
  async saveKeys() {},
  async readKeys() {
    return null;
  },
  async deleteKeys() {},
  secrets: createLocalStorageSecrets(),
  onTokenChange() {
    // Browsers fire `pushsubscriptionchange` unreliably; the subscription is checked on every start instead.
    return () => undefined;
  },
  async releaseDevice() {
    if (!browserSupportsPush()) return;
    const reg = await nav()!.serviceWorker.getRegistration(PUSH_SERVICE_WORKER);
    const subscription = await reg?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  },
  deviceName() {
    const n = nav();
    return n ? describeUserAgent(n.userAgent).label : 'Browser';
  },
};
