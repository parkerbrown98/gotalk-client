import { refusedConnectionHint } from '@gotalk/core';
import { Platform } from 'react-native';

/** The origin this web or desktop page is served from; null on phones, which send no origin. */
export function pageOrigin(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window.location?.origin ?? null;
}

/**
 * The hint to add when reaching `instanceOrigin` failed: on the web the instance may be refusing
 * this site, which a browser reports exactly like an unreachable host.
 */
export function refusedHint(instanceOrigin: string | undefined): string | null {
  if (!instanceOrigin) return null;
  return refusedConnectionHint({ pageOrigin: pageOrigin(), instanceOrigin, web: Platform.OS === 'web' });
}
