import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, unwrap, type GotalkClient } from '@gotalk/api-client';
import {
  choosePushMode,
  createPushGatewayClient,
  instanceDisplayName,
  normalizeGatewayUrl,
  pickGatewayApp,
  planPushSync,
  PushGatewayError,
  pushUnavailableMessage,
  type DeviceRegistrationRequest,
  type GatewayDiscovery,
  type PushInfo,
  type PushRegistration,
  type SavedInstance,
} from '@gotalk/core';
import { useStore } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

import { authManager, onSignOutTask } from './auth';
import { instancesStore } from './instances';
import { pushPlatform, type PushDeviceToken } from './push-platform';

/**
 * This device's push registrations, one per instance: the gateway subscription (`POST /v1/devices`) and the
 * instance's record of it with this device's keys (`POST /users/@me/push-subscriptions`). Turning push on is a
 * per-instance choice on this device; categories are the account's, shared by its devices.
 */
interface PushStoreState {
  /** Instances the person turned push on for here. Kept across sign-out, so signing back in resumes it. */
  enabled: Record<string, boolean>;
  registrations: Record<string, PushRegistration>;
}

export const pushStore = createStore<PushStoreState>()(
  persist(() => ({ enabled: {}, registrations: {} }), {
    name: 'gotalk.push',
    version: 1,
    storage: createJSONStorage(() => AsyncStorage),
  }),
);

interface PushRuntimeState {
  busy: Record<string, boolean>;
  /** The last sync's failure per instance, in words for settings. */
  errors: Record<string, string | null>;
}

export const pushRuntime = createStore<PushRuntimeState>(() => ({ busy: {}, errors: {} }));

export function usePushStore<T>(selector: (s: PushStoreState) => T): T {
  return useStore(pushStore, selector);
}

export function usePushRuntime<T>(selector: (s: PushRuntimeState) => T): T {
  return useStore(pushRuntime, selector);
}

/** A failure the person can act on, worded for settings. */
export class PushSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PushSetupError';
  }
}

/** The person (or the browser) refused notification permission. */
export class PushPermissionError extends Error {
  constructor(readonly permission: 'denied' | 'default') {
    super(permission === 'denied' ? 'Notifications are blocked for Gotalk.' : 'Notifications were not allowed.');
    this.name = 'PushPermissionError';
  }
}

/** Set at build time for custom builds served by their own gateway app. */
const PREFERRED_APP_ID = process.env.EXPO_PUBLIC_PUSH_APP_ID ?? null;

const secretKey = (subscriptionId: string) => `gotalk.push.secret.${subscriptionId.replace(/[^A-Za-z0-9._-]/g, '_')}`;

function hydrated(): Promise<void> {
  const p = (pushStore as unknown as { persist: { hasHydrated(): boolean; onFinishHydration(fn: () => void): () => void } }).persist;
  if (p.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = p.onFinishHydration(() => {
      stop();
      resolve();
    });
  });
}

const queues = new Map<string, Promise<unknown>>();

/** One sync at a time per instance: registering twice at once would leave an orphaned subscription. */
function serialize<T>(instanceId: string, fn: () => Promise<T>): Promise<T> {
  const run = (queues.get(instanceId) ?? Promise.resolve()).then(fn, fn);
  const settled = run.catch(() => undefined);
  queues.set(instanceId, settled);
  void settled.then(() => {
    if (queues.get(instanceId) === settled) queues.delete(instanceId);
  });
  return run;
}

const discoveries = new Map<string, { at: number; value: Promise<GatewayDiscovery> }>();

/** The gateway's discovery document, cached for five minutes like the gateway asks. */
function discover(gatewayUrl: string): Promise<GatewayDiscovery> {
  const cached = discoveries.get(gatewayUrl);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.value;
  const value = createPushGatewayClient({ baseUrl: gatewayUrl }).discover();
  discoveries.set(gatewayUrl, { at: Date.now(), value });
  value.catch(() => discoveries.delete(gatewayUrl));
  return value;
}

function setRegistration(instanceId: string, registration: PushRegistration | null) {
  pushStore.setState((s) => {
    const registrations = { ...s.registrations };
    if (registration) registrations[instanceId] = registration;
    else delete registrations[instanceId];
    return { registrations };
  });
}

function savedInstance(instanceId: string): SavedInstance | undefined {
  return instancesStore.getState().instances.find((i) => i.id === instanceId);
}

function clientFor(instance: SavedInstance): GotalkClient {
  return authManager.clientFor({ id: instance.id, apiBaseUrl: instance.apiBaseUrl });
}

/** Removes a registration everywhere it exists. Each step is best effort: what stays behind expires on its own. */
async function removeRegistration(registration: PushRegistration, client: GotalkClient | null, options: { replacing?: boolean } = {}): Promise<void> {
  const signedIn = !!authManager.store.getState().sessions[registration.instanceId];
  if (client && signedIn) {
    await client
      .DELETE('/users/@me/push-subscriptions/{subscriptionID}', { params: { path: { subscriptionID: registration.serverId } } })
      .catch(() => undefined);
  }
  const secret = await pushPlatform.secrets.get(secretKey(registration.subscriptionId)).catch(() => null);
  if (secret) {
    await createPushGatewayClient({ baseUrl: registration.gatewayUrl })
      .remove(registration.subscriptionId, secret)
      .catch(() => undefined);
  }
  await pushPlatform.deleteKeys(registration.subscriptionId).catch(() => undefined);
  await pushPlatform.secrets.delete(secretKey(registration.subscriptionId)).catch(() => undefined);
  setRegistration(registration.instanceId, null);
  // The browser's subscription is shared by every instance; end it once none is left (not while re-registering).
  if (!options.replacing && Object.keys(pushStore.getState().registrations).length === 0) await pushPlatform.releaseDevice().catch(() => undefined);
}

async function register(
  instance: SavedInstance,
  client: GotalkClient,
  session: { userId: string; sessionId: string },
  info: PushInfo,
  device: PushDeviceToken,
  webApp: { appId: string; vapidPublicKey?: string } | null,
  previous: PushRegistration | undefined,
): Promise<void> {
  const platform = pushPlatform.platform!;
  const gatewayUrl = normalizeGatewayUrl(info.gateway_url)!;
  if (previous) await removeRegistration(previous, client, { replacing: true });

  const app = webApp ?? pickGatewayApp(await discover(gatewayUrl), platform, { nativeId: pushPlatform.nativeId, preferredAppId: PREFERRED_APP_ID });
  if (!app) throw new PushSetupError(pushUnavailableMessage('no_app'));
  const mode = choosePushMode(info.modes, platform);
  if (!mode) throw new PushSetupError("This server only sends notifications this device can't receive.");

  const base = { app_id: app.appId, instance_origin: instance.origin };
  const request: DeviceRegistrationRequest =
    platform === 'ios'
      ? { ...base, platform, token: device.value, apns_environment: device.apnsEnvironment ?? 'production' }
      : platform === 'android'
        ? { ...base, platform, token: device.value }
        : { ...base, platform, endpoint: device.value };
  const gateway = createPushGatewayClient({ baseUrl: gatewayUrl });
  const created = await gateway.register(request);
  await pushPlatform.secrets.set(secretKey(created.subscription_id), created.subscription_secret);

  try {
    const keys = await pushPlatform.createKeys(device);
    if ('privateKey' in keys) {
      await pushPlatform.saveKeys(created.subscription_id, {
        v: 1,
        instanceId: instance.id,
        instance: instance.origin,
        name: instanceDisplayName(instance.origin, instance.name),
        apiBaseUrl: instance.apiBaseUrl,
        userId: session.userId,
        mode,
        keys: [keys],
      });
    }
    const server = unwrap(
      await client.POST('/users/@me/push-subscriptions', {
        body: {
          subscription_id: created.subscription_id,
          gateway_url: info.gateway_url,
          app_id: app.appId,
          platform,
          keys: { p256dh: keys.p256dh, auth: keys.auth },
          mode,
          device_name: pushPlatform.deviceName().slice(0, 100),
        },
      }),
    );
    setRegistration(instance.id, {
      instanceId: instance.id,
      origin: instance.origin,
      userId: session.userId,
      sessionId: session.sessionId,
      gatewayUrl,
      appId: app.appId,
      platform,
      mode,
      subscriptionId: created.subscription_id,
      serverId: server.id,
      device: device.value,
      ...(device.apnsEnvironment ? { apnsEnvironment: device.apnsEnvironment } : null),
      ...(device.vapidPublicKey ? { vapidPublicKey: device.vapidPublicKey } : null),
      refreshedAt: Date.now(),
      expiresAt: created.expires_at,
    });
  } catch (e) {
    await gateway.remove(created.subscription_id, created.subscription_secret).catch(() => undefined);
    await pushPlatform.deleteKeys(created.subscription_id).catch(() => undefined);
    await pushPlatform.secrets.delete(secretKey(created.subscription_id)).catch(() => undefined);
    throw e;
  }
}

/** The gateway lost the subscription, or the token moved to another one: register afresh. */
const needsNewRegistration = (e: unknown) => e instanceof PushGatewayError && (e.status === 404 || e.status === 409 || e.status === 410);

/** Instances whose instance-side record was checked since the app started (gone subscriptions are deleted there). */
const checkedThisRun = new Set<string>();

async function doSync(instanceId: string, options: { subscribe: boolean }): Promise<void> {
  await hydrated();
  const instance = savedInstance(instanceId);
  const registration = pushStore.getState().registrations[instanceId];
  const enabled = !!instance && !!pushStore.getState().enabled[instanceId];
  const identity = authManager.store.getState().sessions[instanceId];
  const session = identity ? { userId: identity.userId, sessionId: identity.sessionId } : null;
  const client = instance ? clientFor(instance) : null;

  if (!enabled || !session || !instance || !client) {
    if (registration) await removeRegistration(registration, client);
    return;
  }
  const unsupported = await pushPlatform.unsupportedReason();
  if (unsupported || !pushPlatform.platform) throw new PushSetupError(pushUnavailableMessage(unsupported ?? 'desktop'));

  const info = unwrap(await client.GET('/instance')).push ?? null;
  let device: PushDeviceToken | null = null;
  let webApp: { appId: string; vapidPublicKey?: string } | null = null;
  if (info?.enabled && info.available) {
    const gatewayUrl = normalizeGatewayUrl(info.gateway_url);
    if (!gatewayUrl) throw new PushSetupError("This server's push gateway address isn't valid.");
    if (pushPlatform.platform === 'web') {
      webApp = pickGatewayApp(await discover(gatewayUrl), 'web', { preferredAppId: PREFERRED_APP_ID }, info.web_apps ?? []);
      if (!webApp) throw new PushSetupError(pushUnavailableMessage('no_app'));
      const others = Object.values(pushStore.getState().registrations).filter((r) => r.instanceId !== instanceId && r.vapidPublicKey);
      if (others.some((r) => r.vapidPublicKey !== webApp!.vapidPublicKey)) {
        throw new PushSetupError(
          'Another server in this browser uses a different push gateway, and a browser can only use one. Turn its notifications off first, or use the phone apps.',
        );
      }
    }
    device = await pushPlatform.deviceToken({ vapidPublicKey: webApp?.vapidPublicKey, subscribe: options.subscribe || !!registration });
  }

  let step = planPushSync(registration, {
    enabled,
    session,
    info,
    device: device && { value: device.value, apnsEnvironment: device.apnsEnvironment, vapidPublicKey: device.vapidPublicKey },
    now: Date.now(),
  });
  // A new browser subscription comes with new keys, which the instance must have.
  if (step === 'update' && pushPlatform.platform === 'web') step = 'register';
  if (step === 'none' && registration && device && !checkedThisRun.has(instanceId)) {
    const mine = unwrap(await client.GET('/users/@me/push-subscriptions')) ?? [];
    checkedThisRun.add(instanceId);
    if (!mine.some((s) => s.id === registration.serverId && s.subscription_id === registration.subscriptionId)) step = 'register';
  }

  switch (step) {
    case 'none':
      break;
    case 'unregister':
      if (registration) await removeRegistration(registration, client);
      break;
    case 'register':
      await register(instance, client, session, info!, device!, webApp, registration);
      checkedThisRun.add(instanceId);
      break;
    case 'update':
    case 'refresh': {
      const r = registration!;
      const secret = await pushPlatform.secrets.get(secretKey(r.subscriptionId));
      try {
        if (!secret) throw new PushGatewayError(404, 'subscription_not_found', '');
        const update =
          step === 'refresh' ? {} : r.platform === 'ios' ? { token: device!.value, apns_environment: device!.apnsEnvironment } : { token: device!.value };
        const res = await createPushGatewayClient({ baseUrl: r.gatewayUrl }).update(r.subscriptionId, secret, update);
        setRegistration(instanceId, {
          ...r,
          device: device!.value,
          ...(device!.apnsEnvironment ? { apnsEnvironment: device!.apnsEnvironment } : null),
          refreshedAt: Date.now(),
          expiresAt: res.expires_at,
        });
      } catch (e) {
        if (!needsNewRegistration(e)) throw e;
        await register(instance, client, session, info!, device!, webApp, r);
      }
      break;
    }
  }
  await shareAccessToken(instance);
}

/**
 * iOS `id_only` registrations: the extension fetches the notification itself and has no way to refresh a session,
 * so it gets a copy of the current short-lived access token. Encrypted registrations never need one.
 */
async function shareAccessToken(instance: SavedInstance): Promise<void> {
  const r = pushStore.getState().registrations[instance.id];
  if (!r || r.platform !== 'ios' || r.mode !== 'id_only') return;
  const record = await pushPlatform.readKeys(r.subscriptionId);
  const token = await authManager.getAccessToken({ id: instance.id, apiBaseUrl: instance.apiBaseUrl }).catch(() => null);
  if (record && token && record.accessToken !== token) await pushPlatform.saveKeys(r.subscriptionId, { ...record, accessToken: token });
}

function describe(e: unknown): string {
  if (e instanceof PushSetupError || e instanceof PushPermissionError) return e.message;
  if (e instanceof PushGatewayError) {
    if (e.code === 'instance_not_verified') return pushUnavailableMessage('server_pending');
    if (e.code === 'instance_blocked') return `The push gateway blocked this server${e.detail ? `: ${e.detail}` : '.'}`;
    if (e.code === 'unknown_app') return pushUnavailableMessage('no_app');
    if (e.code === 'rate_limited') return 'The push gateway is busy. Try again in a few minutes.';
    return `The push gateway refused this device${e.detail ? `: ${e.detail}` : '.'}`;
  }
  if (e instanceof ApiError) return e.message || 'The server refused this device.';
  if (e instanceof Error && e.name === 'BrowserPushError') return e.message;
  return 'Push notifications could not be set up. Check your connection and try again.';
}

/** Brings this device's registration with one instance up to date. Failures are kept for settings and rethrown. */
export function syncPush(instanceId: string, options: { subscribe?: boolean } = {}): Promise<void> {
  pushRuntime.setState((s) => ({ busy: { ...s.busy, [instanceId]: true } }));
  return serialize(instanceId, () => doSync(instanceId, { subscribe: options.subscribe ?? false }))
    .then(() => pushRuntime.setState((s) => ({ errors: { ...s.errors, [instanceId]: null } })))
    .catch((e: unknown) => {
      pushRuntime.setState((s) => ({ errors: { ...s.errors, [instanceId]: describe(e) } }));
      throw e;
    })
    .finally(() => pushRuntime.setState((s) => ({ busy: { ...s.busy, [instanceId]: false } })));
}

/** Every instance this device registered or wants to register with. */
export async function syncAllPush(): Promise<void> {
  await hydrated();
  const { enabled, registrations } = pushStore.getState();
  const ids = new Set([...Object.keys(enabled).filter((id) => enabled[id]), ...Object.keys(registrations)]);
  await Promise.allSettled([...ids].map((id) => syncPush(id)));
}

function setEnabled(instanceId: string, on: boolean) {
  pushStore.setState((s) => {
    const enabled = { ...s.enabled };
    if (on) enabled[instanceId] = true;
    else delete enabled[instanceId];
    return { enabled };
  });
}

/**
 * Turns push on for an instance from a tap: asks for permission when it has not been asked, then registers.
 * The prompt comes first because browsers only show it in response to a gesture.
 */
export async function enablePush(instanceId: string): Promise<void> {
  let permission = await pushPlatform.permission();
  if (permission === 'default') permission = await pushPlatform.requestPermission();
  if (permission !== 'granted') {
    const error = new PushPermissionError(permission);
    pushRuntime.setState((s) => ({ errors: { ...s.errors, [instanceId]: error.message } }));
    throw error;
  }
  await hydrated();
  setEnabled(instanceId, true);
  try {
    await syncPush(instanceId, { subscribe: true });
  } catch (e) {
    // Leave it off when the first registration fails, so settings don't claim it is on.
    if (!pushStore.getState().registrations[instanceId]) setEnabled(instanceId, false);
    throw e;
  }
}

export async function disablePush(instanceId: string): Promise<void> {
  await hydrated();
  setEnabled(instanceId, false);
  await syncPush(instanceId);
}

// Signing out removes the registration while the session can still tell the instance.
onSignOutTask(async (instanceId) => {
  await hydrated();
  const registration = pushStore.getState().registrations[instanceId];
  const instance = savedInstance(instanceId);
  if (registration) await serialize(instanceId, () => removeRegistration(registration, instance ? clientFor(instance) : null));
});

// A session ended elsewhere (revoked, deleted account): drop what this device holds for it.
authManager.store.subscribe((state, previous) => {
  for (const id of Object.keys(previous.sessions)) {
    if (!state.sessions[id] && pushStore.getState().registrations[id]) void syncPush(id).catch(() => undefined);
  }
});

// A forgotten instance takes its push choice with it.
instancesStore.subscribe((state, previous) => {
  for (const old of previous.instances) {
    if (state.instances.some((i) => i.id === old.id)) continue;
    setEnabled(old.id, false);
    if (pushStore.getState().registrations[old.id]) void syncPush(old.id).catch(() => undefined);
  }
});
