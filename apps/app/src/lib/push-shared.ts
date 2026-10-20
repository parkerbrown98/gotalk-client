import { describeNotification, normalizeLinkOrigin } from '@gotalk/core';
import { AppState } from 'react-native';

import { isGatewayReady } from './connection';
import { instancesStore } from './instances';

/** Whether two instance origins are the same instance. */
export function sameInstance(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeLinkOrigin(a);
  return !!x && x === normalizeLinkOrigin(b);
}

/**
 * A push for the instance on screen, while its realtime connection is live, is already showing in the app:
 * the inbox and unread counts update from the gateway. Pushes for other instances still show.
 */
export function shouldSuppressPush(instance: string | null | undefined, visible: boolean = AppState.currentState === 'active'): boolean {
  if (!visible || !instance) return false;
  const activeId = instancesStore.getState().activeId;
  return !!activeId && sameInstance(activeId, instance) && isGatewayReady(activeId);
}

/** The inbox's words for a fetched notification, as a push title and body. */
export function notificationWords(n: Parameters<typeof describeNotification>[0]): { title: string; body: string | null } {
  const view = describeNotification(n);
  const title = [view.actor, view.action].filter(Boolean).join(' ');
  return { title: title.charAt(0).toUpperCase() + title.slice(1), body: view.detail ?? (view.context || null) };
}
