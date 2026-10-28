import { createRequire } from 'node:module';

// playwright-core is not a repo dependency; resolve it from the directory the script is run from (see README).
const { chromium } = createRequire(process.cwd() + '/')('playwright-core');

export const APP = 'http://localhost:18081';
export const SERVER = 'localhost:18080';
export const PASS = 'shots-pass-123';

// CSS-pixel viewport, device scale factor and safe-area insets (CSS px) for each device class we capture.
export const DEVICES = {
  iphone: { width: 440, height: 956, dsf: 3, insets: { top: 62, bottom: 34, left: 0, right: 0 } },
  android: { width: 412, height: 915, dsf: 2.625, insets: { top: 32, bottom: 24, left: 0, right: 0 } },
  ipad: { width: 1032, height: 1376, dsf: 2, insets: { top: 24, bottom: 20, left: 0, right: 0 } },
};

export async function launch(extra = {}) {
  return chromium.launch({
    channel: 'chrome',
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    ...extra,
  });
}

/** A fresh context + page for one device class, with real safe-area insets. */
export async function open(browser, device, { storageState, dsf } = {}) {
  const d = DEVICES[device];
  const ctx = await browser.newContext({
    viewport: { width: d.width, height: d.height },
    deviceScaleFactor: dsf ?? d.dsf,
    isMobile: device !== 'ipad' ? true : true,
    hasTouch: true,
    timezoneId: 'UTC',
    locale: 'en-US',
    permissions: ['microphone', 'camera'],
    storageState,
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: d.insets });
  return { ctx, page };
}

export async function signIn(page, username) {
  await page.goto(APP + '/', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('forum.example.com').fill(SERVER);
  await page.getByText('Look up').click();
  await page.getByPlaceholder('Password').waitFor();
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.getByPlaceholder('Password').fill(PASS);
  await page.getByText('Sign in', { exact: true }).last().click();
  await page.waitForURL((u) => !/welcome|sign-in|connect/.test(u.pathname), { timeout: 20000 });
  await page.waitForLoadState('networkidle');
}

/** Lets fonts, images and in-flight queries settle before a screenshot. */
export async function settle(page, ms = 900) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

/** Opens a device context and signs in as `username` (fresh session each run; refresh tokens are single-use). */
export async function session(browser, device, username, opts = {}) {
  const s = await open(browser, device, opts);
  await signIn(s.page, username);
  return s;
}

/** API helpers for finding ids without hardcoding them. */
export async function apiToken(username) {
  const r = await fetch('http://localhost:18080/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: username, password: PASS }) });
  return (await r.json()).access_token;
}
export async function channelId(place, name, token) {
  const r = await fetch(`http://localhost:18080/api/v1/places/${place}/channels`, { headers: { authorization: `Bearer ${token}` } });
  const list = await r.json();
  const found = (Array.isArray(list) ? list : list.items ?? list.channels ?? []).find((c) => c.name === name);
  if (!found) throw new Error('channel not found: ' + name);
  return found.id;
}
