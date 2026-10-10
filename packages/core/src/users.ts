/** Fields of a user that every embedded copy (authors, members, senders) carries. */
export interface UserPatch {
  avatar_url?: string | null;
  display_name?: string;
}

const MAX_DEPTH = 12;

/**
 * Applies a change to a user wherever they appear in cached data: any object with the user's `id`
 * and the patched fields. Unchanged branches keep their identity, so only what changed re-renders.
 */
export function patchUserDeep<T>(data: T, userId: string, patch: UserPatch): T {
  const keys = Object.keys(patch) as (keyof UserPatch)[];
  if (!keys.length) return data;

  const visit = (value: unknown, depth: number): unknown => {
    if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      let changed = false;
      const next = value.map((item) => {
        const v = visit(item, depth + 1);
        if (v !== item) changed = true;
        return v;
      });
      return changed ? next : value;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;

    const obj = value as Record<string, unknown>;
    let out: Record<string, unknown> | null = null;
    if (obj.id === userId) {
      for (const k of keys) {
        if (k in obj && obj[k] !== patch[k]) {
          out ??= { ...obj };
          out[k] = patch[k];
        }
      }
    }
    for (const [k, v] of Object.entries(obj)) {
      const nv = visit(v, depth + 1);
      if (nv !== v) {
        out ??= { ...obj };
        out[k] = nv;
      }
    }
    return out ?? value;
  };

  return visit(data, 0) as T;
}
