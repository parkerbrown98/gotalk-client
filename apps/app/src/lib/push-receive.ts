import { instanceDisplayName } from '@gotalk/core';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';

import { connectionStore } from './connection';
import { isDesktop } from './desktop';
import { instancesStore } from './instances';

const supported = () => !isDesktop && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

/**
 * Tells the service worker which instance is on screen and whether its realtime connection is live, so it can
 * hold back pushes the page already shows. The worker forgets this when the browser stops it, and then shows
 * everything, which is the safe side.
 */
function postState() {
  if (!supported()) return;
  const activeId = instancesStore.getState().activeId;
  const c = connectionStore.getState();
  const live = !!activeId && c.instanceId === activeId && c.state === 'ready';
  const message = { type: 'gotalk-push-state', instance: activeId, live, visible: document.visibilityState === 'visible', at: Date.now() };
  void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage(message)).catch(() => undefined);
}

/** Names the worker shows beside each push; it cannot read the page's storage. */
function postInstances() {
  if (!supported()) return;
  const instances = instancesStore.getState().instances.map((i) => ({ origin: i.origin, name: instanceDisplayName(i.origin, i.name) }));
  void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'gotalk-push-instances', instances })).catch(() => undefined);
}

/**
 * Web: a tapped notification focuses an open tab and the service worker asks it to navigate here; with no tab
 * open, the worker opens `/notification?…` itself.
 */
export function usePushOpening(): void {
  useEffect(() => {
    if (!supported()) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; path?: string } | null;
      if (data?.type === 'gotalk-push-open' && typeof data.path === 'string' && data.path.startsWith('/')) router.push(data.path as Href);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    const stopConnection = connectionStore.subscribe(postState);
    const stopInstances = instancesStore.subscribe(() => {
      postState();
      postInstances();
    });
    document.addEventListener('visibilitychange', postState);
    // Workers can be restarted between pushes; repeat the state now and then so a fresh one knows it.
    const timer = setInterval(postState, 30_000);
    postState();
    postInstances();
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      stopConnection();
      stopInstances();
      document.removeEventListener('visibilitychange', postState);
      clearInterval(timer);
    };
  }, []);
}

/** The installed web app's badge (where the browser supports it) follows the unread count while open. */
export function setAppBadge(count: number): void {
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> });
  if (!nav?.setAppBadge || isDesktop) return;
  void (count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge?.())?.catch(() => undefined);
}
