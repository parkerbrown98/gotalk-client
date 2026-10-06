import { ApiError, unwrap, type Schemas } from '@gotalk/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useApiClient } from './api';
import { instancesStore, useActiveInstance } from './instances';

export type PolicyKind = Schemas['PolicySummary']['kind'];
export type Policy = Schemas['Policy'];
export type PolicySummary = Schemas['PolicySummary'];
export type InstanceUpdate = Schemas['InstanceUpdateRequest'];
export type PublishPolicy = Schemas['PublishPolicyRequest'];

export const POLICY_KINDS: readonly PolicyKind[] = ['terms', 'privacy', 'guidelines'];

// `['policies', inst]` belongs to usePolicies in api.ts, which keeps only the ones needing consent.
export const adminKeys = {
  summaries: (inst: string | undefined) => ['policy-summaries', inst] as const,
  policy: (inst: string | undefined, kind: string | undefined) => ['policy', inst, kind] as const,
  versions: (inst: string | undefined, kind: string | undefined) => ['policy-versions', inst, kind] as const,
  version: (inst: string | undefined, kind: string | undefined, version: number | undefined) => ['policy-version', inst, kind, version] as const,
};

function useContext() {
  const active = useActiveInstance();
  const client = useApiClient();
  return { inst: active?.id, client };
}

const notFoundAs = async <T>(work: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await work();
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return fallback;
    throw e;
  }
};

/** The version of each policy in effect now. */
export function usePolicySummaries() {
  const { inst, client } = useContext();
  return useQuery({
    queryKey: adminKeys.summaries(inst),
    enabled: !!client,
    queryFn: async () => unwrap(await client!.GET('/policies')) ?? [],
  });
}

/** The version of a policy in effect, with its text; null when it was never published. */
export function useCurrentPolicy(kind: PolicyKind | undefined) {
  const { inst, client } = useContext();
  return useQuery({
    queryKey: adminKeys.policy(inst, kind),
    enabled: !!client && !!kind,
    queryFn: () => notFoundAs(async () => unwrap(await client!.GET('/policies/{kind}', { params: { path: { kind: kind! } } })), null),
  });
}

/** Every version of a policy, newest first, including scheduled ones. */
export function usePolicyVersions(kind: PolicyKind | undefined) {
  const { inst, client } = useContext();
  return useQuery({
    queryKey: adminKeys.versions(inst, kind),
    enabled: !!client && !!kind,
    queryFn: () => notFoundAs(async () => unwrap(await client!.GET('/policies/{kind}/versions', { params: { path: { kind: kind! } } })) ?? [], [] as PolicySummary[]),
  });
}

/** One version of a policy with its text. */
export function usePolicyVersion(kind: PolicyKind | undefined, version: number | undefined) {
  const { inst, client } = useContext();
  return useQuery({
    queryKey: adminKeys.version(inst, kind, version),
    enabled: !!client && !!kind && !!version,
    queryFn: async () => unwrap(await client!.GET('/policies/{kind}/versions/{version}', { params: { path: { kind: kind!, version: version! } } })),
  });
}

/** Instance administration: settings and policies. The server checks that the caller is an administrator. */
export function useAdminActions() {
  const { inst, client } = useContext();
  const qc = useQueryClient();
  return useMemo(() => {
    const api = () => {
      if (!client) throw new Error('No active instance');
      return client;
    };
    return {
      async updateInstance(input: InstanceUpdate) {
        const instance = unwrap(await api().PATCH('/instance', { body: input }));
        qc.setQueryData(['instance', inst], instance);
        // The saved list on this device shows the name and icon too.
        instancesStore.setState((s) => ({
          instances: s.instances.map((i) => (i.id === inst ? { ...i, name: instance.name, description: instance.description, iconUrl: instance.icon_url ?? null } : i)),
        }));
        return instance;
      },
      async publishPolicy(kind: PolicyKind, input: PublishPolicy) {
        const policy = unwrap(await api().POST('/policies/{kind}', { params: { path: { kind } }, body: input }));
        await Promise.all(
          [adminKeys.summaries(inst), adminKeys.policy(inst, kind), adminKeys.versions(inst, kind), ['policies', inst], ['consents', inst], ['instance', inst]].map((queryKey) =>
            qc.invalidateQueries({ queryKey }),
          ),
        );
        return policy;
      },
    };
  }, [client, inst, qc]);
}
