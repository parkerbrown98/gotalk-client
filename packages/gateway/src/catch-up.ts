/**
 * Loads what a channel missed while the gateway was down. The server cannot resume a session, so
 * after reconnecting the client asks for the messages after the last one it has, page by page.
 *
 * `complete` is false when more than `maxPages` pages were missing; the caller should then drop its
 * copy and load the latest page instead of filling a long gap.
 */
export async function catchUp<T extends { id: string }>(
  fetchAfter: (after: string, limit: number) => Promise<T[]>,
  after: string,
  { pageSize = 100, maxPages = 5 }: { pageSize?: number; maxPages?: number } = {},
): Promise<{ items: T[]; complete: boolean }> {
  const items: T[] = [];
  let cursor = after;
  for (let page = 0; page < maxPages; page++) {
    const batch = await fetchAfter(cursor, pageSize);
    items.push(...batch);
    if (batch.length < pageSize) return { items, complete: true };
    cursor = batch[batch.length - 1]!.id;
  }
  return { items, complete: false };
}
