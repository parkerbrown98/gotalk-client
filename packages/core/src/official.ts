/** The instance Gotalk runs. The app offers it first and shows it with the app icon. */
export const OFFICIAL_INSTANCE = {
  origin: 'https://api.gotalk.sh',
  host: 'api.gotalk.sh',
  name: 'Gotalk Official',
  description: 'Open to everyone. A good first home for new communities, and where we post updates about Gotalk.',
} as const;

const trimOrigin = (origin: string) => origin.trim().replace(/\/+$/, '').toLowerCase();

export function isOfficialInstance(origin: string | null | undefined): boolean {
  return !!origin && trimOrigin(origin) === OFFICIAL_INSTANCE.origin;
}

/** The name to show for an instance: Gotalk Official for ours, whatever the server calls itself otherwise. */
export function instanceDisplayName(origin: string | null | undefined, name: string): string {
  return isOfficialInstance(origin) ? OFFICIAL_INSTANCE.name : name;
}

/**
 * How an instance appears in the welcome screen's address: the host for HTTPS, the full origin for plain
 * HTTP so it is not upgraded on the way back in. Discovery accepts both.
 */
export function serverParam(origin: string): string {
  const o = trimOrigin(origin);
  return o.startsWith('https://') ? o.slice('https://'.length) : o;
}

/** Saved servers, most recently used first. */
export function sortServers<T extends { lastUsedAt: number }>(servers: readonly T[]): T[] {
  return [...servers].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}
