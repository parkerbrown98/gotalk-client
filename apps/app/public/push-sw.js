/*
 * Gotalk push service worker. Browsers decrypt each push (RFC 8291) before it gets here, so `event.data` is the
 * plaintext of the gateway's payload format. Every push shows a notification (browsers require it), except one
 * for the instance the visible page shows while its realtime connection is live: that page already has it.
 *
 * The page posts which instance is on screen ("gotalk-push-state") and the names of saved instances
 * ("gotalk-push-instances"); see src/lib/push-receive.ts.
 */

const NAMES_CACHE = 'gotalk-push';
const NAMES_KEY = '/__gotalk/push-instances';
const FALLBACK_TITLE = 'New notification';
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const TARGETS = { place_id: 'place', board_id: 'board', topic_id: 'topic', channel_id: 'channel', conversation_id: 'conversation', message_id: 'message', post_id: 'post' };

let pageState = { instance: null, live: false, visible: false, at: 0 };

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function origin(value) {
  if (typeof value !== 'string' || !/^https?:\/\/[^/?#\s]+\/*$/i.test(value.trim())) return null;
  return value.trim().replace(/\/+$/, '').toLowerCase();
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'gotalk-push-state') {
    pageState = { instance: origin(data.instance), live: !!data.live, visible: !!data.visible, at: Date.now() };
  } else if (data.type === 'gotalk-push-instances' && Array.isArray(data.instances)) {
    const names = {};
    for (const i of data.instances) {
      const o = origin(i && i.origin);
      if (o && typeof i.name === 'string') names[o] = i.name.slice(0, 100);
    }
    event.waitUntil(caches.open(NAMES_CACHE).then((c) => c.put(NAMES_KEY, new Response(JSON.stringify(names), { headers: { 'Content-Type': 'application/json' } }))));
  }
});

async function instanceName(instance) {
  try {
    const res = await (await caches.open(NAMES_CACHE)).match(NAMES_KEY);
    const names = res ? await res.json() : {};
    if (names[instance]) return names[instance];
  } catch {
    // Fall through to the host name.
  }
  return new URL(instance).host;
}

/** The v1 plaintext, or null. Mirrors parsePushPayload in @gotalk/core. */
function parse(data) {
  let p = null;
  try {
    p = data ? data.json() : null;
  } catch {
    return null;
  }
  if (!p || typeof p !== 'object' || p.v !== 1) return null;
  const instance = origin(p.instance);
  if (!instance || typeof p.user_id !== 'string' || typeof p.notification_id !== 'string' || !ID.test(p.notification_id)) return null;
  const target = {};
  if (p.target && typeof p.target === 'object') {
    for (const key of Object.keys(TARGETS)) {
      if (typeof p.target[key] === 'string' && ID.test(p.target[key])) target[key] = p.target[key];
    }
  }
  return {
    instance,
    notificationId: p.notification_id,
    title: typeof p.title === 'string' && p.title.trim() ? p.title : FALLBACK_TITLE,
    body: typeof p.body === 'string' ? p.body : '',
    thread: typeof p.thread_id === 'string' ? p.thread_id : p.notification_id,
    badge: Number.isInteger(p.badge) && p.badge >= 0 ? p.badge : null,
    createdAt: typeof p.created_at === 'string' ? Date.parse(p.created_at) : NaN,
    target,
  };
}

function openPath(p) {
  const parts = ['instance=' + encodeURIComponent(p.instance), 'notification=' + encodeURIComponent(p.notificationId)];
  for (const [key, name] of Object.entries(TARGETS)) if (p.target[key]) parts.push(name + '=' + encodeURIComponent(p.target[key]));
  return '/notification?' + parts.join('&');
}

async function pageShowsIt(instance) {
  if (!pageState.live || !pageState.visible || pageState.instance !== instance || Date.now() - pageState.at > 90_000) return false;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return windows.some((c) => c.visibilityState === 'visible');
}

async function onPush(event) {
  const p = parse(event.data);
  if (!p) {
    await self.registration.showNotification(FALLBACK_TITLE, { body: 'Open Gotalk to see it.', tag: 'gotalk-fallback', data: { open: '/inbox' } });
    return;
  }
  if (await pageShowsIt(p.instance)) return;
  if (p.badge !== null && self.navigator.setAppBadge) await self.navigator.setAppBadge(p.badge).catch(() => undefined);

  const tag = p.instance + '|' + p.thread;
  const existing = await self.registration.getNotifications({ tag });
  // Push services may deliver twice: the same notification replaces itself quietly.
  const duplicate = existing.some((n) => n.data && n.data.notificationId === p.notificationId);
  const name = await instanceName(p.instance);
  await self.registration.showNotification(p.title, {
    // The instance's name always shows, so an instance cannot pass for another sender.
    body: p.body ? name + ' · ' + p.body : name,
    tag,
    renotify: !duplicate,
    timestamp: Number.isFinite(p.createdAt) ? p.createdAt : Date.now(),
    icon: '/favicon.ico',
    data: { open: openPath(p), instance: p.instance, notificationId: p.notificationId },
  });
}

self.addEventListener('push', (event) => event.waitUntil(onPush(event)));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const path = typeof data.open === 'string' && data.open.startsWith('/') ? data.open : '/inbox';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const tab = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (tab) {
        await tab.focus();
        tab.postMessage({ type: 'gotalk-push-open', path });
        return;
      }
      await self.clients.openWindow(path);
    })(),
  );
});
