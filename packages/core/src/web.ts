import { createLocalLock, type AuthBroadcast, type AuthMessage, type LockProvider, type SecretStorage } from './auth.ts';

/**
 * Web Locks make refresh single-flight across tabs. Without them two tabs could present the same
 * single-use refresh token and the server would revoke the session as stolen.
 */
export function createWebLock(): LockProvider {
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  if (!locks) return createLocalLock();
  return (name, fn) => locks.request(name, fn) as Promise<Awaited<ReturnType<typeof fn>>>;
}

/** Tells other tabs a session changed. A no-op where BroadcastChannel is unavailable. */
export function createWebBroadcast(channelName = 'gotalk.auth'): AuthBroadcast | undefined {
  const Channel = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
  if (!Channel) return undefined;
  const channel = new Channel(channelName);
  return {
    post: (message) => channel.postMessage(message),
    subscribe(listener) {
      const handler = (event: MessageEvent<AuthMessage>) => listener(event.data);
      channel.addEventListener('message', handler);
      return () => channel.removeEventListener('message', handler);
    },
  };
}

/**
 * Refresh tokens in `localStorage`. Any script on the page can read them, so a cross-site scripting
 * bug exposes the session; the short-lived access token stays in memory only. Native builds use the
 * keychain instead.
 */
export function createLocalStorageSecrets(): SecretStorage {
  const storage = () => (globalThis as { localStorage?: Storage }).localStorage;
  return {
    get: async (key) => storage()?.getItem(key) ?? null,
    set: async (key, value) => storage()?.setItem(key, value),
    delete: async (key) => storage()?.removeItem(key),
  };
}
