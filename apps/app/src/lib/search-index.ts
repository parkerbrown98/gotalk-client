import { unwrap, type Schemas } from '@gotalk/api-client';
import { describeDirectoryAudit, lookUpPlatformInstance, type DirectoryStatus } from '@gotalk/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useApiClient } from './api';
import { useActiveInstance } from './instances';
import { applySelfUpdate } from './uploads';

/**
 * Search engines and the public Gotalk directory: the instance's listing (administrators), a place's and a
 * board's opt-in, and each person's choice to keep their posts out.
 */

export const directoryKeys = {
  status: (inst: string | undefined) => ['instance-directory', inst] as const,
  audit: (inst: string | undefined) => ['instance-directory-audit', inst] as const,
};

/** Listing, published keys, the notice and suggested policy text. Instance administrators only. */
export function useDirectoryStatus(enabled = true) {
  const inst = useActiveInstance()?.id;
  const client = useApiClient();
  return useQuery({
    queryKey: directoryKeys.status(inst),
    enabled: !!client && enabled,
    queryFn: async () => unwrap(await client!.GET('/instance/directory')),
  });
}

/** Recent directory changes from the instance audit log, newest first. */
export function useDirectoryAudit(enabled = true) {
  const inst = useActiveInstance()?.id;
  const client = useApiClient();
  return useQuery({
    queryKey: directoryKeys.audit(inst),
    enabled: !!client && enabled,
    queryFn: async () =>
      (unwrap(await client!.GET('/instance/audit-log', { params: { query: { limit: 50 } } })) ?? [])
        .map((e) => ({ entry: e, text: describeDirectoryAudit(e) }))
        .filter((e): e is { entry: Schemas['InstanceAuditEntry']; text: string } => e.text !== null)
        .slice(0, 5),
  });
}

/**
 * How the index sees this instance, from `platform_status_url`. The index is a separate service that may be
 * unreachable (or refuse this page), so failures come back as a result rather than an error.
 */
export function usePlatformView(statusUrl: string | undefined) {
  return useQuery({
    queryKey: ['platform-view', statusUrl],
    enabled: !!statusUrl,
    retry: false,
    staleTime: 60_000,
    queryFn: () => lookUpPlatformInstance(statusUrl!),
  });
}

export function useDirectoryActions() {
  const inst = useActiveInstance()?.id;
  const client = useApiClient();
  const qc = useQueryClient();
  return useMemo(() => {
    const api = () => {
      if (!client) throw new Error('No active instance');
      return client;
    };
    const keep = (status: DirectoryStatus) => {
      qc.setQueryData(directoryKeys.status(inst), status);
      void qc.invalidateQueries({ queryKey: directoryKeys.audit(inst) });
      return status;
    };
    return {
      /** A new signing key; the old public key stays published so recent pings still verify. */
      async rotateKey() {
        return keep(unwrap(await api().POST('/instance/directory/keys/rotate')));
      },
      /** Stops publishing the key retired by the last rotation. */
      async revokePreviousKey() {
        return keep(unwrap(await api().DELETE('/instance/directory/keys/previous')));
      },
    };
  }, [client, inst, qc]);
}

/** Opting a place or board in or out, and keeping your own posts out. Saved right away. */
export function useIndexActions() {
  const inst = useActiveInstance()?.id;
  const client = useApiClient();
  const qc = useQueryClient();
  return useMemo(() => {
    const api = () => {
      if (!client || !inst) throw new Error('No active instance');
      return client;
    };
    return {
      async setPlaceIndexable(slug: string, indexable: boolean) {
        const place = unwrap(await api().PATCH('/places/{place}', { params: { path: { place: slug } }, body: { indexable } }));
        qc.setQueryData(['place', inst, slug], place);
        void qc.invalidateQueries({ queryKey: ['boards', inst, slug] });
        void qc.invalidateQueries({ queryKey: ['instance', inst] });
        return place;
      },
      async updateBoard(slug: string, boardId: string, body: Schemas['UpdateBoardRequest']) {
        const board = unwrap(await api().PATCH('/boards/{boardID}', { params: { path: { boardID: boardId } }, body }));
        qc.setQueryData<Schemas['Board'][]>(['boards', inst, slug], (list) => list?.map((b) => (b.id === board.id ? { ...b, ...board } : b)));
        void qc.invalidateQueries({ queryKey: ['boards', inst, slug] });
        return board;
      },
      async setExcludeFromIndex(exclude: boolean) {
        const user = unwrap(await api().PATCH('/users/@me', { body: { exclude_from_index: exclude } }));
        await applySelfUpdate(qc, inst!, user);
        return user;
      },
    };
  }, [client, inst, qc]);
}
