import { unwrap } from '@gotalk/api-client';
import { buildSectionSettings, type ConfigCheck, type ConfigSectionName, type FormValues, type InstanceConfig } from '@gotalk/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useApiClient } from './api';
import { useActiveInstance } from './instances';

/** Settings saved on one server reach every replica within this long. */
export const CONFIG_PROPAGATION_SECONDS = 15;

export const configKeys = {
  config: (inst: string | undefined) => ['instance-config', inst] as const,
  checks: (inst: string | undefined) => ['instance-checks', inst] as const,
};

/** Storage, email, voice and CORS settings with where each comes from. Instance administrators only. */
export function useInstanceConfig(enabled = true) {
  const inst = useActiveInstance()?.id;
  const client = useApiClient();
  return useQuery({
    queryKey: configKeys.config(inst),
    enabled: !!client && enabled,
    queryFn: async () => unwrap(await client!.GET('/instance/config')),
  });
}

/** The live pre-flight checks: database, Redis, public URL, storage, email and voice. */
export function useInstanceChecks(enabled = true) {
  const inst = useActiveInstance()?.id;
  const client = useApiClient();
  return useQuery({
    queryKey: configKeys.checks(inst),
    enabled: !!client && enabled,
    queryFn: async () => unwrap(await client!.GET('/instance/checks')).checks ?? [],
    staleTime: 30_000,
  });
}

export function useConfigActions() {
  const inst = useActiveInstance()?.id;
  const client = useApiClient();
  const qc = useQueryClient();
  return useMemo(() => {
    const api = () => {
      if (!client) throw new Error('No active instance');
      return client;
    };
    // The instance's features and health follow the new settings; other replicas catch up shortly after.
    const settle = () => {
      void qc.invalidateQueries({ queryKey: ['instance', inst] });
      void qc.invalidateQueries({ queryKey: configKeys.checks(inst) });
      setTimeout(() => void qc.invalidateQueries({ queryKey: ['instance', inst] }), CONFIG_PROPAGATION_SECONDS * 1000);
    };
    return {
      /** Checks and saves a section. A failing check answers 422 unless `force` is set. */
      async save(section: ConfigSectionName, values: FormValues, force = false): Promise<ConfigCheck[]> {
        const res = unwrap(await api().PATCH('/instance/config', { params: { query: { force } }, body: buildSectionSettings(section, values) }));
        qc.setQueryData<InstanceConfig>(configKeys.config(inst), res.config);
        settle();
        return res.checks ?? [];
      },
      /** Checks a section without saving it; for email, optionally sends a test message. */
      async test(section: ConfigSectionName, values: FormValues, testEmailTo?: string): Promise<ConfigCheck[]> {
        const res = unwrap(await api().POST('/instance/config/test', { body: { settings: buildSectionSettings(section, values), ...(testEmailTo ? { test_email_to: testEmailTo } : {}) } }));
        return res.checks ?? [];
      },
      /** Forgets the saved settings, so the config file, environment and defaults apply again. */
      async reset(section: ConfigSectionName) {
        const config = unwrap(await api().DELETE('/instance/config/{section}', { params: { path: { section } } }));
        qc.setQueryData<InstanceConfig>(configKeys.config(inst), config);
        settle();
      },
    };
  }, [client, inst, qc]);
}
