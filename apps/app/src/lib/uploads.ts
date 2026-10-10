import { removeImage, unwrap, uploadImage, type Schemas, type UploadTarget } from '@gotalk/api-client';
import { instanceCapabilities, patchUserDeep, type UserPatch } from '@gotalk/core';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useApiClient, useInstanceInfo } from './api';
import { authManager } from './auth';
import { instancesStore, useActiveInstance } from './instances';

type SelfUser = Schemas['SelfUser'];
type Place = Schemas['Place'];
type Instance = Schemas['Instance'];

/** What the instance allows to be uploaded, from `GET /instance`. */
export function useInstanceCapabilities() {
  return instanceCapabilities(useInstanceInfo().data);
}

/**
 * The signed-in user changed their avatar or name: every cached copy of them (message authors, member
 * lists, topic authors, notifications), the profile and the stored session pick it up at once.
 */
export async function applySelfUpdate(qc: QueryClient, inst: string, user: SelfUser): Promise<void> {
  const patch: UserPatch = { avatar_url: user.avatar_url, display_name: user.display_name };
  for (const query of qc.getQueryCache().findAll()) {
    if (query.queryKey[1] !== inst || query.state.data === undefined) continue;
    const next = patchUserDeep(query.state.data, user.id, patch);
    if (next !== query.state.data) qc.setQueryData(query.queryKey, next);
  }
  qc.setQueryData(['me', inst], user);
  await authManager.setUser(inst, user);
}

function applyPlace(qc: QueryClient, inst: string, slug: string, place: Place) {
  qc.setQueryData(['place', inst, slug], place);
  if (place.slug !== slug) qc.setQueryData(['place', inst, place.slug], place);
  void qc.invalidateQueries({ queryKey: ['places', inst] });
  void qc.invalidateQueries({ queryKey: ['discover', inst] });
}

function applyInstance(qc: QueryClient, inst: string, instance: Instance) {
  qc.setQueryData(['instance', inst], instance);
  instancesStore.getState().refresh(inst, instance);
}

/** Uploading and removing the avatar, place icons and banners, and the instance icon. */
export function useImageActions() {
  const inst = useActiveInstance()?.id;
  const client = useApiClient();
  const qc = useQueryClient();
  return useMemo(() => {
    const ready = () => {
      if (!client || !inst) throw new Error('No active instance');
      return { client, inst };
    };
    const place = (slug: string, kind: 'icon' | 'banner'): UploadTarget => (kind === 'icon' ? { kind: 'placeIcon', place: slug } : { kind: 'placeBanner', place: slug });
    return {
      async setAvatar(image: Blob, type: string) {
        const { client, inst } = ready();
        await applySelfUpdate(qc, inst, await uploadImage(client, { kind: 'avatar' }, image, type));
      },
      async removeAvatar() {
        const { client, inst } = ready();
        await applySelfUpdate(qc, inst, await removeImage(client, { kind: 'avatar' }));
      },
      async setPlaceImage(slug: string, kind: 'icon' | 'banner', image: Blob, type: string) {
        const { client, inst } = ready();
        applyPlace(qc, inst, slug, (await uploadImage(client, place(slug, kind), image, type)) as Place);
      },
      async removePlaceImage(slug: string, kind: 'icon' | 'banner') {
        const { client, inst } = ready();
        applyPlace(qc, inst, slug, (await removeImage(client, place(slug, kind))) as Place);
      },
      async setInstanceIcon(image: Blob, type: string) {
        const { client, inst } = ready();
        applyInstance(qc, inst, await uploadImage(client, { kind: 'instanceIcon' }, image, type));
      },
      async removeInstanceIcon() {
        const { client, inst } = ready();
        applyInstance(qc, inst, await removeImage(client, { kind: 'instanceIcon' }));
      },
      /** Profile and place forms without uploads still take an image URL. */
      async setAvatarUrl(url: string) {
        const { client, inst } = ready();
        await applySelfUpdate(qc, inst, unwrap(await client.PATCH('/users/@me', { body: { avatar_url: url } })));
      },
    };
  }, [client, inst, qc]);
}
