export type DeviceKind = 'browser' | 'phone' | 'desktop';

export interface DeviceDescription {
  label: string;
  kind: DeviceKind;
}

/** Names the device behind a session from its stored `User-Agent`. */
export function describeUserAgent(userAgent: string): DeviceDescription {
  const app = /^Gotalk\/[\w.+-]+ \((ios|android)\)/i.exec(userAgent);
  if (app) return { label: app[1]!.toLowerCase() === 'ios' ? 'Gotalk for iOS' : 'Gotalk for Android', kind: 'phone' };

  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(userAgent)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /CrOS/.test(userAgent)
            ? 'ChromeOS'
            : /Linux|X11/.test(userAgent)
              ? 'Linux'
              : null;
  // Order matters: Edge and Opera also say Chrome, and Chrome also says Safari.
  const browser = /Edg(e|A|iOS)?\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\/|FxiOS\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : null;
  const kind: DeviceKind = os === 'iOS' || os === 'Android' ? 'phone' : 'browser';

  if (/Gotalk Desktop|Tauri/i.test(userAgent)) return { label: `Gotalk Desktop${os ? ` on ${os}` : ''}`, kind: 'desktop' };
  if (browser && os) return { label: `${browser} on ${os}`, kind };
  return { label: browser ?? os ?? 'Unknown device', kind };
}

/** "Active now" within five minutes of use, otherwise the largest whole unit. */
export function describeLastUsed(lastUsedAt: string | number | Date, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(lastUsedAt).getTime()) / 1000));
  if (seconds < 300) return 'Active now';
  const unit = (n: number, name: string) => `${n} ${name}${n === 1 ? '' : 's'} ago`;
  if (seconds < 3600) return unit(Math.floor(seconds / 60), 'minute');
  if (seconds < 86_400) return unit(Math.floor(seconds / 3600), 'hour');
  return unit(Math.floor(seconds / 86_400), 'day');
}
