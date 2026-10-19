import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/** Places whose "this place is public" notice was dismissed on this device, by instance. */
interface IndexNotices {
  dismissed: Record<string, string[]>;
  loaded: boolean;
}

const KEY = 'gotalk.indexNotices';

const store = createStore<IndexNotices>(() => ({ dismissed: {}, loaded: false }));

function parse(raw: string | null): Record<string, string[]> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object') return {};
    const out: Record<string, string[]> = {};
    for (const [inst, ids] of Object.entries(v as Record<string, unknown>)) {
      if (Array.isArray(ids)) out[inst] = ids.filter((id): id is string => typeof id === 'string');
    }
    return out;
  } catch {
    return {};
  }
}

let loading: Promise<void> | null = null;

function load(): Promise<void> {
  loading ??= AsyncStorage.getItem(KEY)
    .catch(() => null)
    .then((raw) => store.setState((s) => ({ dismissed: { ...parse(raw), ...s.dismissed }, loaded: true })));
  return loading;
}

export function dismissIndexNotice(inst: string, placeId: string): void {
  const current = store.getState().dismissed[inst] ?? [];
  if (current.includes(placeId)) return;
  const dismissed = { ...store.getState().dismissed, [inst]: [...current, placeId] };
  store.setState({ dismissed });
  void AsyncStorage.setItem(KEY, JSON.stringify(dismissed)).catch(() => undefined);
}

/** Dismissed places on an instance; undefined until loaded, so the notice doesn't flash. */
export function useDismissedIndexNotices(inst: string | undefined): readonly string[] | undefined {
  const loaded = useStore(store, (s) => s.loaded);
  const list = useStore(store, (s) => (inst ? s.dismissed[inst] : undefined));
  useEffect(() => void load(), []);
  if (!loaded) return undefined;
  return list ?? [];
}
