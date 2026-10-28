// Usage: node capture.mjs <iphone|android|ipad>   (run reset.sh first for identical unread state)
// Captures the real client (web export) against the seeded throwaway server at the device's real pixel size.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, open, session, signIn, settle, APP, apiToken, channelId } from './lib.mjs';

const device = process.argv[2];
const tablet = device === 'ipad';
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../raw', device);
fs.mkdirSync(out, { recursive: true });

const b = await launch();
const token = await apiToken('marta');
const API = 'http://localhost:18080/api/v1';
const get = async (p) => (await fetch(API + p, { headers: { authorization: `Bearer ${token}` } })).json();
const items = (r) => (Array.isArray(r) ? r : r.items ?? r.topics ?? r.channels ?? []);
const benchId = await channelId('open-woodworkers', 'bench-talk', token);
const voiceId = await channelId('open-woodworkers', 'Open shop', token);
const topic = items(await get('/places/open-woodworkers/topics')).find((t) => t.title.startsWith('Dovetails keep gapping'));
if (!topic) throw new Error('dovetail topic not found');

const grab = async (page, name, ms = 1500) => {
  await page.mouse.move(0, 0); // park the pointer so no row shows a hover state
  await settle(page, ms);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(device, name);
};

// --- Welcome (first run: no saved servers) -------------------------------------------------------------------
if (!tablet) {
  const { ctx, page } = await open(b, device);
  await page.goto(APP + '/', { waitUntil: 'networkidle' });
  await page.getByText('Welcome to Gotalk').waitFor();
  await grab(page, 'welcome');
  await ctx.close();
}

// --- Signed in as Marta ----------------------------------------------------------------------------------------
const { ctx, page } = await session(b, device, 'marta');
page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 160)));

await page.waitForURL(/\/feed/);
await page.getByText('Dovetails keep gapping').first().waitFor();
await grab(page, 'home'); // first, so unread dots and counts are still showing

await page.goto(`${APP}/places/open-woodworkers`, { waitUntil: 'networkidle' });
if (!tablet) {
  await page.getByText('Forums and chat').tap();
  await page.getByText('bench-talk').first().waitFor();
} else {
  await page.getByText('Dovetails keep gapping').first().waitFor();
}
await grab(page, 'place'); // before opening bench-talk, so its unread badge is visible

await page.goto(`${APP}/places/open-woodworkers/topics/${topic.id}`, { waitUntil: 'networkidle' });
await page.getByText('Accepted solution').first().waitFor();
await grab(page, 'topic');

await page.goto(`${APP}/places/open-woodworkers/channels/${benchId}`, { waitUntil: 'networkidle' });
await page.getByText('Doors at 9').first().waitFor();
await grab(page, 'chat');

await page.goto(`${APP}/messages`, { waitUntil: 'networkidle' });
await page.getByText('Jonas Pike').first().waitFor();
if (tablet) {
  await page.getByText('Jonas Pike').first().tap();
  await page.getByText('Sent you the photos').first().waitFor();
}
await grab(page, 'messages');

// --- Voice: three other people join first, then Marta -----------------------------------------------------------
const others = [];
for (const u of ['jonas', 'ana', 'tomas']) {
  const s = await session(b, 'iphone', u, { dsf: 1 });
  await s.page.goto(`${APP}/places/open-woodworkers/channels/${voiceId}`, { waitUntil: 'networkidle' });
  await s.page.getByText('Join voice').first().waitFor();
  await s.page.getByText('Join voice').first().tap();
  await s.page.getByText(/\d\d:\d\d:\d\d/).first().waitFor({ timeout: 20000 });
  if (u === 'ana') await s.page.getByRole('button', { name: 'Mute' }).tap(); // one muted tile, like a real call
  others.push(s);
}
await page.goto(`${APP}/places/open-woodworkers/channels/${voiceId}`, { waitUntil: 'networkidle' });
await page.getByText('Join voice').first().waitFor();
await page.getByText('Join voice').first().tap();
await page.getByText(/\d\d:\d\d:\d\d/).first().waitFor({ timeout: 20000 });
await page.getByText('Checking connection').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
await grab(page, 'voice', 2500);

await page.getByRole('button', { name: 'Leave the call' }).tap().catch(() => {});
for (const s of others) await s.ctx.close();
await ctx.close();
await b.close();
