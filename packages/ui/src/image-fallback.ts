import { useCallback, useSyncExternalStore } from 'react';

/**
 * Image URLs that failed to load, so every avatar or icon showing the same URL falls back to its
 * initials at once instead of each one requesting it again. Uploaded files are deleted when replaced,
 * so a cached URL can start answering 404. Failures are forgotten after a while in case it was the
 * network rather than the file.
 */
export const IMAGE_FAILURE_TTL_MS = 10 * 60_000;

const failed = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;

const notify = () => {
  version++;
  for (const l of listeners) l();
};

export function markImageFailed(uri: string, now: number = Date.now()): void {
  if (failed.get(uri) === now) return;
  failed.set(uri, now);
  notify();
}

export function isImageFailed(uri: string | null | undefined, now: number = Date.now()): boolean {
  if (!uri) return false;
  const at = failed.get(uri);
  if (at === undefined) return false;
  if (now - at > IMAGE_FAILURE_TTL_MS) {
    failed.delete(uri);
    return false;
  }
  return true;
}

/** Forgets every failure (tests, or after the device comes back online). */
export function resetImageFailures(): void {
  if (!failed.size) return;
  failed.clear();
  notify();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getVersion = () => version;

/** The URL to render, or null to show the fallback; pass `onError` to the image. */
export function useImageFallback(uri: string | null | undefined): { uri: string | null; onError: () => void } {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const onError = useCallback(() => {
    if (uri) markImageFailed(uri);
  }, [uri]);
  return { uri: uri && !isImageFailed(uri) ? uri : null, onError };
}
