import type { ConnectionState } from '@gotalk/gateway';
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
}

/** Mirrors the active instance's gateway state for the UI and for code that must not import the gateway itself. */
export const connectionStore = createStore<ConnectionInfo>(() => ({ instanceId: null, state: 'idle', disconnectedAt: null, downSince: null }));

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
