/** The invite someone opened before they had an account on its instance, so sign-in can carry on to it. */
export interface PendingInvite {
  code: string;
  /** Origin of the instance the invite belongs to. */
  origin: string;
}

let pending: PendingInvite | null = null;

export const pendingInvite = {
  get: () => pending,
  set: (invite: PendingInvite) => {
    pending = invite;
  },
  clear: () => {
    pending = null;
  },
};

export function inviteHref(invite: PendingInvite) {
  return { pathname: '/invite/[code]', params: { code: invite.code, instance: invite.origin } } as const;
}
