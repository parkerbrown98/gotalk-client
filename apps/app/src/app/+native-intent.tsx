import { gotalkLinkPath, parseGotalkLink } from '@gotalk/core';

/**
 * Links that open the phone apps: `gotalk://invite/…`, `gotalk://places/…` and `gotalk://topics/…`, and the
 * same links on a web client (`https://app.gotalk.sh/places/…?instance=…`) should the app ever claim them.
 * Each becomes its app route with a clean `instance`; anything else is left to Expo Router as it is.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const link = parseGotalkLink(path);
    return link ? gotalkLinkPath(link) : path;
  } catch {
    return path;
  }
}
