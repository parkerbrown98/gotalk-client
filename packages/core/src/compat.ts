import { API_VERSION, type Instance } from '@gotalk/api-client';

export type Compatibility = { ok: true } | { ok: false; reason: string };

/** Checks whether an instance serves the API version this client was built for. */
export function checkCompatibility(api: Pick<Instance['api'], 'supported_versions' | 'min_version' | 'max_version'>): Compatibility {
  const supported = api.supported_versions ?? [];
  if (supported.includes(API_VERSION)) return { ok: true };
  const range = api.min_version === api.max_version ? api.min_version : `${api.min_version}–${api.max_version}`;
  return {
    ok: false,
    reason: `This instance serves API ${range || 'versions unknown'}, but this app requires ${API_VERSION}.`,
  };
}
