import AsyncStorage from '@react-native-async-storage/async-storage';
import { createInstancesStore, selectActiveInstance, type InstancesState } from '@gotalk/core';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';

/** Saved instances for this device. AsyncStorage maps to localStorage on web and desktop. */
export const instancesStore = createInstancesStore(AsyncStorage);

export function useInstances<T>(selector: (state: InstancesState) => T): T {
  return useStore(instancesStore, selector);
}

export function useActiveInstance() {
  return useInstances(selectActiveInstance);
}

export function useInstancesHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => instancesStore.persist.hasHydrated());
  useEffect(() => {
    if (hydrated) return;
    const unsubscribe = instancesStore.persist.onFinishHydration(() => setHydrated(true));
    if (instancesStore.persist.hasHydrated()) setHydrated(true);
    return unsubscribe;
  }, [hydrated]);
  return hydrated;
}
