import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createAuthManager,
  createLocalStorageSecrets,
  createWebBroadcast,
  createWebLock,
  type AuthState,
  type SecretStorage,
  type SessionIdentity,
} from '@gotalk/core';
import { invoke } from '@tauri-apps/api/core';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { useStore } from 'zustand';

import { instancesStore, useActiveInstance } from './instances';
import { isDesktop } from './desktop';

const isWeb = Platform.OS === 'web';

/** iOS Keychain / Android Keystore. Items never leave this device or its backups. */
const nativeSecrets: SecretStorage = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  delete: (key) => SecureStore.deleteItemAsync(key),
};

/** The OS keychain through the `secret_*` commands in `apps/desktop/src-tauri`. */
const desktopSecrets: SecretStorage = {
  get: (key) => invoke<string | null>('secret_get', { key }),
  set: async (key, value) => void (await invoke('secret_set', { key, value })),
  delete: async (key) => void (await invoke('secret_delete', { key })),
};

const secrets = !isWeb ? nativeSecrets : isDesktop ? desktopSecrets : createLocalStorageSecrets();

/**
 * Credentials for every saved instance. Refresh tokens live in `secrets`; access tokens stay in
 * memory. On the web, tabs coordinate refreshes with Web Locks and BroadcastChannel.
 */
export const authManager = createAuthManager({
  secrets,
  identities: AsyncStorage,
  lock: isWeb ? createWebLock() : undefined,
  broadcast: isWeb ? createWebBroadcast() : undefined,
  // Browsers forbid setting User-Agent; native builds identify themselves so devices can be told apart.
  userAgent: isWeb ? undefined : `Gotalk/${Constants.expoConfig?.version ?? '0'} (${Platform.OS})`,
});

void authManager.hydrate();

export function useAuth<T>(selector: (state: AuthState) => T): T {
  return useStore(authManager.store, selector);
}

export function useAuthHydrated(): boolean {
  return useAuth((s) => s.hydrated);
}

/** The signed-in session for the active instance, if any. */
export function useSession(): SessionIdentity | undefined {
  const active = useActiveInstance();
  return useAuth((s) => (active ? s.sessions[active.id] : undefined));
}

/** Set when the active instance ended this device's session while the app was open. */
export function useRevokedNotice(instanceId: string | undefined): { login: string } | undefined {
  return useAuth((s) => (instanceId ? s.revoked[instanceId] : undefined));
}

/** The active instance in the shape auth needs. */
export function useAuthTarget() {
  const active = useActiveInstance();
  return active ? { id: active.id, apiBaseUrl: active.apiBaseUrl } : null;
}

const beforeSignOut = new Set<(instanceId: string) => void>();

/**
 * Runs before this device ends a session on purpose. The gateway uses it to disconnect first, so the
 * server closing the connection is not mistaken for the session being ended elsewhere.
 */
export function onBeforeSignOut(listener: (instanceId: string) => void): () => void {
  beforeSignOut.add(listener);
  return () => beforeSignOut.delete(listener);
}

export function prepareSignOut(instanceId: string): void {
  for (const l of beforeSignOut) l(instanceId);
}

export async function signOut(target: { id: string; apiBaseUrl: string }): Promise<void> {
  prepareSignOut(target.id);
  await authManager.signOut(target);
}

/** Signs out (best effort on the server) and drops the instance from this device. */
export async function forgetInstance(id: string): Promise<void> {
  const instance = instancesStore.getState().instances.find((i) => i.id === id);
  if (instance) await signOut({ id: instance.id, apiBaseUrl: instance.apiBaseUrl });
  instancesStore.getState().removeInstance(id);
}
