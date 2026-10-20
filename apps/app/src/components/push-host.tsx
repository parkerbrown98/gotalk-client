import { useEffect, useRef } from 'react';

import { useOnAppFocus } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useForumActions, useUnreadCount } from '@/lib/forums';
import { useActiveInstance, useInstances } from '@/lib/instances';
import { syncAllPush, usePushStore } from '@/lib/push';
import { pushPlatform } from '@/lib/push-platform';
import { setAppBadge, usePushOpening } from '@/lib/push-receive';

/**
 * Keeps this device's push registrations current: on start, when sessions or instances change, when the app
 * returns to the foreground (at most once a minute) and when the platform token changes. Also opens tapped
 * notifications and keeps the app badge at the unread count while the app is open.
 */
export function PushHost() {
  usePushOpening();
  const sessionKey = useAuth((s) =>
    Object.entries(s.sessions)
      .map(([id, v]) => `${id}:${v.sessionId}`)
      .sort()
      .join(','),
  );
  const instanceKey = useInstances((s) => s.instances.map((i) => i.id).join(','));
  const lastSync = useRef(0);

  useEffect(() => {
    lastSync.current = Date.now();
    void syncAllPush();
  }, [sessionKey, instanceKey]);

  useOnAppFocus(() => {
    if (Date.now() - lastSync.current < 60_000) return;
    lastSync.current = Date.now();
    void syncAllPush();
  });

  useEffect(() => pushPlatform.onTokenChange(() => void syncAllPush()), []);

  const active = useActiveInstance();
  const registered = usePushStore((s) => !!active && !!s.registrations[active.id]);
  const unread = useUnreadCount().data;
  useEffect(() => {
    if (registered && typeof unread === 'number') setAppBadge(unread);
  }, [registered, unread]);

  return null;
}

/** Marks the notification a push opened as read, once its instance is active and signed in. */
export function useMarkPushRead(notificationId: string | null, ready: boolean) {
  const actions = useForumActions();
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !notificationId || done.current === notificationId) return;
    done.current = notificationId;
    void actions.markNotificationRead(notificationId).catch(() => undefined);
  }, [actions, notificationId, ready]);
}
