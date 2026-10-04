import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { DiscoveredInstance } from './discovery.ts';

/** What a device remembers about an instance it has connected to. Credentials live elsewhere. */
export interface SavedInstance {
  id: string;
  origin: string;
  apiBaseUrl: string;
  gatewayUrl: string;
  name: string;
  description: string;
  iconUrl: string | null;
  addedAt: number;
  lastUsedAt: number;
}

export interface InstancesState {
  instances: SavedInstance[];
  activeId: string | null;
  /** Saves (or refreshes) an instance and makes it active. */
  addInstance: (discovered: DiscoveredInstance) => SavedInstance;
  setActive: (id: string | null) => void;
  removeInstance: (id: string) => void;
}

export type InstancesStore = StoreApi<InstancesState> & {
  persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void; rehydrate: () => Promise<void> | void };
};

export type KeyValueStorage = StateStorage;

export function createInstancesStore(storage: KeyValueStorage, now: () => number = Date.now): InstancesStore {
  return createStore<InstancesState>()(
    persist(
      (set, get) => ({
        instances: [],
        activeId: null,
        addInstance: (d) => {
          const existing = get().instances.find((i) => i.id === d.id);
          const t = now();
          const saved: SavedInstance = {
            id: d.id,
            origin: d.origin,
            apiBaseUrl: d.apiBaseUrl,
            gatewayUrl: d.gatewayUrl,
            name: d.instance.name,
            description: d.instance.description,
            iconUrl: d.instance.icon_url ?? null,
            addedAt: existing?.addedAt ?? t,
            lastUsedAt: t,
          };
          set((s) => ({
            instances: [saved, ...s.instances.filter((i) => i.id !== d.id)],
            activeId: d.id,
          }));
          return saved;
        },
        setActive: (id) =>
          set((s) => ({
            activeId: id,
            instances: s.instances.map((i) => (i.id === id ? { ...i, lastUsedAt: now() } : i)),
          })),
        removeInstance: (id) =>
          set((s) => ({
            instances: s.instances.filter((i) => i.id !== id),
            activeId: s.activeId === id ? null : s.activeId,
          })),
      }),
      {
        name: 'gotalk.instances',
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: (s) => ({ instances: s.instances, activeId: s.activeId }),
      },
    ),
  ) as InstancesStore;
}

export function selectActiveInstance(state: InstancesState): SavedInstance | undefined {
  return state.instances.find((i) => i.id === state.activeId);
}
