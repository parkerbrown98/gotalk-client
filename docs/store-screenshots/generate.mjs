// Composes the store listing images from the raw captures in ./raw: a device frame, status bar and headline on the
// brand backdrop. Needs playwright-core and Google Chrome; run it from a directory where playwright-core is installed.
//   node generate.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { chromium } = createRequire(process.cwd() + '/')('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));

const rawDir = path.join(here, 'raw');
const outDir = here;
const iconUrl = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(here, '../brand/icon.svg')).toString('base64');

// --- Copy ------------------------------------------------------------------------------------------------------
const COPY = {
  home: ['One feed for every community', 'Topics from all your places, sorted your way.'],
  place: ['Forums, chat and voice in one place', 'Everything a community needs, side by side.'],
  topic: ['Forums that find the answer', 'Accepted solutions are clearly marked.'],
  chat: ['Real-time chat, built in', 'Channels, threads and mentions that keep up.'],
  voice: ['Hop into voice with a tap', 'Talk with your community while you browse.'],
  messages: ['Direct and group messages', 'Stay in touch beyond any one community.'],
  welcome: ['Join communities on any server', 'Start on Gotalk Official, or connect to your own.'],
};
const FILE = { home: 'home-feed', place: 'place', topic: 'topic', chat: 'chat', voice: 'voice', messages: 'messages', welcome: 'welcome' };
const PHONE_ORDER = ['home', 'place', 'topic', 'chat', 'voice', 'messages', 'welcome'];
const IPAD_ORDER = ['home', 'place', 'topic', 'chat', 'messages', 'voice'];

// --- Device frames (natural units = capture pixels) -----------------------------------------------------------------
const white = '#fff';
const signal = (w, c = white) => `<svg width="${w}" viewBox="0 0 54 36"><g fill="${c}"><rect x="0" y="24" width="9" height="12" rx="3"/><rect x="15" y="16" width="9" height="20" rx="3"/><rect x="30" y="8" width="9" height="28" rx="3"/><rect x="45" y="0" width="9" height="36" rx="3"/></g></svg>`;
const wifi = (w, c = white) => `<svg width="${w}" viewBox="0 0 51 38" fill="none" stroke="${c}" stroke-width="5.2" stroke-linecap="round"><path d="M4 13a31 31 0 0 1 43 0"/><path d="M12 21.5a19.5 19.5 0 0 1 27 0"/><path d="M20 29.5a8 8 0 0 1 11 0"/><circle cx="25.5" cy="35" r="1.4" fill="${c}"/></svg>`;
const battery = (w, c = white) => `<svg width="${w}" viewBox="0 0 84 38"><rect x="1.5" y="1.5" width="72" height="35" rx="10.5" fill="none" stroke="${c}" stroke-opacity=".45" stroke-width="3"/><rect x="6" y="6" width="63" height="26" rx="7" fill="${c}"/><path d="M78 13v12c3-1 5-3.500 5-6s-2-5-5-6z" fill="${c}" fill-opacity=".5"/></svg>`;

const FRAMES = {
  iphone: {
    w: 1320, h: 2868, bezel: 30, radius: 165, inset: 186,
    chrome: () => `
      <div style="position:absolute;left:0;top:0;right:0;height:186px;font:600 51px/1 Inter,system-ui;color:#fff;">
        <div style="position:absolute;left:0;width:432px;top:62px;text-align:center;letter-spacing:.2px;">9:41</div>
        <div style="position:absolute;right:126px;top:62px;display:flex;gap:18px;align-items:center;height:40px;">${signal(54)}${wifi(51)}${battery(84)}</div>
      </div>
      <div style="position:absolute;left:50%;top:33px;width:378px;height:111px;margin-left:-189px;border-radius:56px;background:#000;"></div>
      <div style="position:absolute;left:50%;bottom:21px;width:417px;height:15px;margin-left:-208px;border-radius:8px;background:#fff;"></div>`,
    body: { ring: '#2b2d31', shadow: true },
  },
  android: {
    w: 1082, h: 2402, bezel: 14, radius: 96, inset: 84,
    chrome: () => `
      <div style="position:absolute;left:0;top:0;right:0;height:84px;font:500 37px/1 Inter,system-ui;color:#fff;">
        <div style="position:absolute;left:62px;top:24px;">9:41</div>
        <div style="position:absolute;right:58px;top:24px;display:flex;gap:16px;align-items:center;height:36px;">${wifi(44)}${signal(40)}${battery(70)}</div>
      </div>
      <div style="position:absolute;left:50%;top:26px;width:34px;height:34px;margin-left:-17px;border-radius:50%;background:#000;box-shadow:0 0 0 3px #0a0b0c;"></div>
      <div style="position:absolute;left:50%;bottom:26px;width:290px;height:11px;margin-left:-145px;border-radius:6px;background:#fff;opacity:.92;"></div>`,
    body: { ring: '#4a4d52', shadow: true },
  },
  ipad: {
    w: 2064, h: 2752, bezel: 56, radius: 78, inset: 48,
    // No status bar: the app's wide layout draws its headers under the top inset, so a status bar would overlap them.
    chrome: () => `
      <div style="position:absolute;left:50%;bottom:14px;width:300px;height:10px;margin-left:-150px;border-radius:5px;background:#fff;"></div>`,
    body: { ring: '#33363a', shadow: true },
    camera: true,
  },
};

const frameHtml = (kind, rawPath) => {
  const f = FRAMES[kind];
  const nw = f.w + f.bezel * 2, nh = f.h + f.bezel * 2;
  const html = `
  <div class="device" style="position:absolute;transform-origin:0 0;width:${nw}px;height:${nh}px;box-sizing:border-box;padding:${f.bezel}px;background:#000;border-radius:${f.radius + f.bezel}px;
      box-shadow:0 0 0 ${Math.round(f.bezel / 5)}px ${f.body.ring}, inset 0 0 0 2px #3a3c41, 0 ${Math.round(nh * 0.012)}px ${Math.round(nh * 0.035)}px rgba(0,0,0,.6), 0 0 ${Math.round(nw * .1)}px rgba(255,87,87,.10);">
    <div style="position:relative;width:${f.w}px;height:${f.h}px;border-radius:${f.radius}px;overflow:hidden;background:#0e0f11;">
      <img src="file://${rawPath}" style="display:block;width:${f.w}px;height:${f.h}px;">
      ${f.chrome()}
    </div>
    ${f.camera ? `<div style="position:absolute;left:50%;top:${f.bezel / 2 - 9}px;width:18px;height:18px;margin-left:-9px;border-radius:50%;background:#15171a;box-shadow:inset 0 0 0 3px #1c1e22;"></div>` : ''}
  </div>`;
  return { html, nw, nh };
};

// --- Canvas -------------------------------------------------------------------------------------------------------
const backdrop = (glowX = '50%') => `background:
  radial-gradient(ellipse 80% 38% at ${glowX} 0%, rgba(255,87,87,.26), rgba(255,87,87,0) 70%),
  radial-gradient(ellipse 70% 30% at 50% 100%, rgba(255,87,87,.07), rgba(255,87,87,0) 70%), #0e0f11;`;
const FONT = `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">`;

function storeHtml({ width, height }, kind, slug, rawPath) {
  const [title, sub] = COPY[slug];
  const titleSize = Math.round(width * 0.068), subSize = Math.round(width * 0.031);
  const textTop = Math.round(height * 0.05);
  const textBlock = Math.round(titleSize * 2.5 + subSize * 1.6 + width * 0.05);
  const availH = height - textTop - textBlock - Math.round(height * 0.035);
  const { html, nw, nh } = frameHtml(kind, rawPath);
  const scale = Math.min(availH / nh, (width * 0.86) / nw);
  const left = (width - nw * scale) / 2;
  return `<!doctype html><meta charset="utf-8">${FONT}<body style="margin:0;width:${width}px;height:${height}px;overflow:hidden;position:relative;${backdrop()}font-family:Inter,system-ui;-webkit-font-smoothing:antialiased;">
    <div style="position:absolute;left:0;right:0;top:${textTop}px;text-align:center;padding:0 ${Math.round(width * 0.07)}px;">
      <div style="font-size:${titleSize}px;line-height:1.1;font-weight:600;letter-spacing:-0.02em;color:#fff;text-wrap:balance;">${title}</div>
      <div style="margin-top:${Math.round(titleSize * 0.35)}px;font-size:${subSize}px;line-height:1.4;color:#a8a9ab;text-wrap:balance;">${sub}</div>
    </div>
    <div style="position:absolute;left:${left}px;top:${textTop + textBlock}px;transform:scale(${scale});transform-origin:0 0;">${html.replace('position:absolute;transform-origin:0 0;', 'position:relative;')}</div>
  </body>`;
}

function featureHtml(width, height, rawPath) {
  const { html, nw, nh } = frameHtml('android', rawPath);
  const scale = (height * 1.12) / nh;
  const left = width - nw * scale - 70;
  return `<!doctype html><meta charset="utf-8">${FONT}<body style="margin:0;width:${width}px;height:${height}px;overflow:hidden;position:relative;${backdrop('28%')}font-family:Inter,system-ui;-webkit-font-smoothing:antialiased;">
    <div style="position:absolute;left:64px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center;gap:18px;">
      <div style="display:flex;align-items:center;gap:18px;"><img src="${iconUrl}" width="76" height="76" alt=""><span style="font-size:52px;font-weight:600;letter-spacing:-0.02em;color:#fff;">Gotalk</span></div>
      <div style="font-size:34px;line-height:1.2;font-weight:500;letter-spacing:-0.01em;color:#f4f4f6;">Forum-first communities with chat and voice.</div>
      <div style="font-size:19px;color:#a8a9ab;">Open source and self-hostable.</div>
    </div>
    <div style="position:absolute;left:${left}px;top:${height * 0.1}px;transform:scale(${scale});transform-origin:0 0;">${html.replace('position:absolute;transform-origin:0 0;', 'position:relative;')}</div>
  </body>`;
}

// --- Targets ---------------------------------------------------------------------------------------------------------
const targets = [
  { dir: 'ios/iphone-6.3-inch', width: 1179, height: 2556, kind: 'iphone', raw: 'iphone', order: PHONE_ORDER },
  { dir: 'ios/iphone-6.9-inch', width: 1320, height: 2868, kind: 'iphone', raw: 'iphone', order: PHONE_ORDER },
  { dir: 'ios/iphone-6.5-inch', width: 1284, height: 2778, kind: 'iphone', raw: 'iphone', order: PHONE_ORDER },
  { dir: 'ios/ipad-13-inch', width: 2064, height: 2752, kind: 'ipad', raw: 'ipad', order: IPAD_ORDER },
  { dir: 'android/phone', width: 1080, height: 1920, kind: 'android', raw: 'android', order: PHONE_ORDER },
];

// --- App Store header and search results images ----------------------------------------------------------------------------
// One idea: what Gotalk is, with two real screens. The 16:9 universal image is cropped to 21:9 for the header and to 3:2 for
// search, so its text and phones stay inside the central region that both crops keep (x 410-4834, y 351-2599).
const HERO = [
  { file: 'app-store-header-3840x1646.png', w: 3840, h: 1646, u: 64, glow: '30%', text: { x: 240, w: 1700 },
    phones: [{ raw: 'home', x: 2150, y: 170, h: 1650 }, { raw: 'chat', x: 2960, y: 330, h: 1650 }] },
  { file: 'search-results-3840x2560.png', w: 3840, h: 2560, u: 70, glow: '30%', text: { x: 170, w: 1450 },
    phones: [{ raw: 'home', x: 1750, y: 420, h: 2000 }, { raw: 'chat', x: 2750, y: 700, h: 2000 }] },
  { file: 'header-and-search-5244x2950.png', w: 5244, h: 2950, u: 84, glow: '35%', text: { x: 743, w: 1500 },
    phones: [{ raw: 'home', x: 2443, y: 425, h: 2100 }, { raw: 'chat', x: 3512, y: 485, h: 2100 }] },
];

function heroHtml({ w, h, u, glow, text, phones }) {
  const devices = phones.map((p) => {
    const { html, nh } = frameHtml('iphone', path.join(rawDir, 'iphone', `${p.raw}.png`));
    return `<div style="position:absolute;left:${p.x}px;top:${p.y}px;transform:scale(${p.h / nh});transform-origin:0 0;">${html.replace('position:absolute;transform-origin:0 0;', 'position:relative;')}</div>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8">${FONT}<body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;position:relative;${backdrop(glow)}font-family:Inter,system-ui;-webkit-font-smoothing:antialiased;">
    <div style="position:absolute;left:${text.x}px;top:0;bottom:0;width:${text.w}px;display:flex;flex-direction:column;justify-content:center;gap:${Math.round(u * 0.6)}px;">
      <div style="display:flex;align-items:center;gap:${Math.round(u * 0.8)}px;"><img src="${iconUrl}" width="${Math.round(u * 3.2)}" height="${Math.round(u * 3.2)}" alt=""><span style="font-size:${Math.round(u * 2.6)}px;font-weight:600;letter-spacing:-0.02em;color:#fff;">Gotalk</span></div>
      <div style="font-size:${Math.round(u * 1.5)}px;line-height:1.2;font-weight:500;letter-spacing:-0.01em;color:#f4f4f6;text-wrap:balance;">Forum-first communities with chat and voice.</div>
      <div style="font-size:${Math.round(u * 0.95)}px;color:#a8a9ab;">Open source and self-hostable.</div>
    </div>
    ${devices}
  </body>`;
}

for (const d of ['ios', 'android']) fs.rmSync(path.join(outDir, d), { recursive: true, force: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gotalk-compose-'));
const browser = await chromium.launch({ channel: 'chrome' });
const shoot = async (htmlStr, file, width, height) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const htmlFile = path.join(tmp, 'page.html');
  fs.writeFileSync(htmlFile, htmlStr);
  await page.goto('file://' + htmlFile, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width, height } });
  await page.close();
  console.log(path.relative(outDir, file));
};
try {
  for (const t of targets) {
    for (const [i, slug] of t.order.entries()) {
      const rawPath = path.join(rawDir, t.raw, `${slug}.png`);
      if (!fs.existsSync(rawPath)) { console.log('missing', rawPath); continue; }
      await shoot(storeHtml(t, t.kind, slug, rawPath), path.join(outDir, t.dir, `${String(i + 1).padStart(2, '0')}-${FILE[slug]}.png`), t.width, t.height);
    }
  }
  for (const c of HERO) await shoot(heroHtml(c), path.join(outDir, 'ios', 'app-store-header', c.file), c.w, c.h);
  await shoot(featureHtml(1024, 500, path.join(rawDir, 'android', 'home.png')), path.join(outDir, 'android', 'feature-graphic.png'), 1024, 500);
} finally {
  await browser.close();
}
