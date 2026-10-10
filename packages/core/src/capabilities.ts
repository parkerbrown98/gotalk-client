import type { Instance } from '@gotalk/api-client';

/** Upload limits used when an instance predates them (the server's defaults). */
export const DEFAULT_UPLOAD_SIZE = 8 * 1024 * 1024;
export const DEFAULT_UPLOAD_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const DEFAULT_UPLOAD_MAX_SIDE = 8192;

export type DegradedFeature = 'email' | 'storage' | 'voice' | (string & {});

/** What screens may offer on an instance. Older servers that omit a flag get the feature switched off. */
export interface InstanceCapabilities {
  email: boolean;
  passwordReset: boolean;
  emailVerification: boolean;
  uploads: boolean;
  /** Largest upload in bytes. */
  uploadSize: number;
  uploadTypes: readonly string[];
  /** Longest side the server accepts, in pixels. */
  uploadMaxSide: number;
  /** Most files a message or post can carry; 0 when the instance has no attachments. */
  maxAttachments: number;
  /** The server fetches previews for links in messages and posts. */
  linkPreviews: boolean;
  awaitingSetup: boolean;
  /** Something an administrator should fix: see `degradedFeatures`. */
  needsAttention: boolean;
  degradedFeatures: readonly DegradedFeature[];
}

type PartialInstance = {
  status?: Instance['status'];
  degraded_features?: string[] | null;
  setup_required?: boolean;
  features?: Partial<Instance['features']>;
  limits?: Partial<Instance['limits']>;
};

export function instanceCapabilities(instance: PartialInstance | null | undefined): InstanceCapabilities {
  const f = instance?.features ?? {};
  const l = instance?.limits ?? {};
  const degraded = instance?.degraded_features ?? [];
  const types = l.upload_types?.length ? l.upload_types : DEFAULT_UPLOAD_TYPES;
  return {
    email: f.email === true,
    passwordReset: f.password_reset === true,
    emailVerification: f.email_verification === true,
    uploads: f.uploads === true,
    uploadSize: l.upload_size && l.upload_size > 0 ? l.upload_size : DEFAULT_UPLOAD_SIZE,
    uploadTypes: types,
    uploadMaxSide: l.upload_max_side && l.upload_max_side > 0 ? l.upload_max_side : DEFAULT_UPLOAD_MAX_SIDE,
    // Instances from before attachments omit the limit, and do not accept attachment_ids.
    maxAttachments: f.uploads === true && l.attachments && l.attachments > 0 ? l.attachments : 0,
    linkPreviews: f.link_previews === true,
    awaitingSetup: instance?.status === 'awaiting_setup' || instance?.setup_required === true,
    needsAttention: instance?.status === 'degraded' || degraded.length > 0,
    degradedFeatures: degraded,
  };
}

/** One sentence per feature that is down, for the administrator's notice. */
export function degradedFeatureMessage(feature: DegradedFeature): string {
  switch (feature) {
    case 'email':
      return "Email isn't working, so password resets and email confirmation are unavailable.";
    case 'storage':
      return "Storage isn't working, so avatars, icons, banners and attachments can't be uploaded.";
    case 'voice':
      return "Voice is misconfigured, so voice channels can't connect.";
    default:
      return `${feature.charAt(0).toUpperCase()}${feature.slice(1).replace(/_/g, ' ')} isn't working.`;
  }
}

/** "8 MB", "512 KB": sizes as people read them (binary units, as the server counts). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}
