import type { ConnectionState } from '@gotalk/gateway';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

interface ConnectionInfo {
  /** The instance the gateway belongs to; null when there is none (signed out). */
  instanceId: string | null;
  state: ConnectionState;
  /** When the last ready connection dropped; null while connected. */
  disconnectedAt: number | null;
  /** When the client started reconnecting, whether or not it had been connected before; null otherwise. */
  downSince: number | null;
  /** The gateway has connected at least once for this instance; a refused handshake never does. */
  everReady: boolean;
}

/** Mirrors the active instance's gateway state for the UI and for code that must not import the gateway itself. */
export const connectionStore = createStore<ConnectionInfo>(() => ({ instanceId: null, state: 'idle', disconnectedAt: null, downSince: null, everReady: false }));

export function isGatewayReady(instanceId: string): boolean {
  const s = connectionStore.getState();
  return s.instanceId === instanceId && s.state === 'ready';
}

export function useConnection<T>(selector: (s: ConnectionInfo) => T): T {
  return useStore(connectionStore, selector);
}

/** True while events arrive live, so polling can stop. */
export function useGatewayReady(): boolean {
  return useConnection((s) => s.state === 'ready');
}

/** False while the browser says it has no network; native targets rely on the gateway alone. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => Platform.OS !== 'web' || typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
