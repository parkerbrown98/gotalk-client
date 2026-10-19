import type { Href } from 'expo-router';

/** The invite someone opened before they had an account on its instance, so sign-in can carry on to it. */
export interface PendingInvite {
  code: string;
  /** Origin of the instance the invite belongs to. */
  origin: string;
}

/** A place or topic link opened before signing in to its instance, so sign-in can carry on to it. */
export type PendingLink = { kind: 'place'; slug: string; origin: string } | { kind: 'topic'; topicId: string; origin: string };

let pending: PendingInvite | null = null;
let pendingTarget: PendingLink | null = null;

export const pendingInvite = {
  get: () => pending,
  set: (invite: PendingInvite) => {
    pending = invite;
  },
  clear: () => {
    pending = null;
  },
};

export const pendingLink = {
  get: () => pendingTarget,
  set: (link: PendingLink) => {
    pendingTarget = link;
  },
  clear: () => {
    pendingTarget = null;
  },
};

export function inviteHref(invite: PendingInvite) {
  return { pathname: '/invite/[code]', params: { code: invite.code, instance: invite.origin } } as const;
}

/** The place or topic again, with its instance, so the link screens switch to it and open it. */
export function linkHref(link: PendingLink): Href {
  return link.kind === 'place'
    ? { pathname: '/places/[slug]', params: { slug: link.slug, instance: link.origin } }
    : { pathname: '/topics/[id]', params: { id: link.topicId, instance: link.origin } };
}

const sameOrigin = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

/** Where to go once signed in to `origin`: an invite or link opened for it, otherwise home. Clears both. */
export function takePendingHref(origin: string): Href {
  const invite = pending;
  const link = pendingTarget;
  pending = null;
  pendingTarget = null;
  if (invite && sameOrigin(invite.origin, origin)) return inviteHref(invite);
  if (link && sameOrigin(link.origin, origin)) return linkHref(link);
  return '/feed';
}
