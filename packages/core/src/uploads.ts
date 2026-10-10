import { ApiError, UploadError, type UploadFailureKind } from '@gotalk/api-client';

import { formatBytes, type InstanceCapabilities } from './capabilities.ts';

/** What an image is for; decides its shape and size before upload. */
export type ImagePurpose = 'avatar' | 'placeIcon' | 'placeBanner' | 'instanceIcon';

/** Avatars and icons are center-cropped to a square of at most this many pixels. */
export const SQUARE_IMAGE_SIZE = 512;
/** Banners are fitted to at most this width, keeping their proportions. */
export const BANNER_MAX_WIDTH = 1920;

const TYPE_NAMES: Record<string, string> = { 'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/gif': 'GIF', 'image/webp': 'WebP' };

/** "PNG, JPEG, GIF or WebP". */
export function describeImageTypes(types: readonly string[]): string {
  const names = types.map((t) => TYPE_NAMES[t] ?? t.replace(/^image\//, '').toUpperCase());
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/** The hint under a picker: "PNG, JPEG, GIF or WebP, up to 8 MB." */
export function uploadHint(caps: Pick<InstanceCapabilities, 'uploadTypes' | 'uploadSize'>): string {
  return `${describeImageTypes(caps.uploadTypes)}, up to ${formatBytes(caps.uploadSize)}.`;
}

export type UploadCheck = { ok: true } | { ok: false; reason: 'type' | 'size'; message: string };

/** Checks a picked file against the instance's limits before anything is sent. */
export function checkUpload(file: { type?: string | null; size?: number | null }, caps: Pick<InstanceCapabilities, 'uploadTypes' | 'uploadSize'>): UploadCheck {
  const type = (file.type ?? '').toLowerCase();
  if (!type || !caps.uploadTypes.includes(type)) {
    return { ok: false, reason: 'type', message: `That file type isn't supported. Use ${describeImageTypes(caps.uploadTypes)}.` };
  }
  if (file.size != null && file.size > caps.uploadSize) {
    return { ok: false, reason: 'size', message: `That image is ${formatBytes(file.size)}. The limit is ${formatBytes(caps.uploadSize)}.` };
  }
  return { ok: true };
}

export interface ResizePlan {
  /** Region of the source to keep, in source pixels. */
  crop: { x: number; y: number; width: number; height: number } | null;
  /** Output size in pixels. */
  width: number;
  height: number;
  /** Re-encode as this type. */
  type: 'image/png' | 'image/jpeg' | 'image/webp';
}

/**
 * How to shrink an image before upload, or null to send it as it is. The server strips metadata but
 * does not resize, so a phone photo would otherwise be served at full size to everyone who sees it.
 * GIFs go as they are (re-encoding would drop the animation), subject to the size limit.
 */
export function planResize(purpose: ImagePurpose, source: { width: number; height: number; type: string }): ResizePlan | null {
  const { width: w, height: h } = source;
  const type = source.type.toLowerCase();
  if (type === 'image/gif' || !(w > 0) || !(h > 0)) return null;
  // PNG and WebP may be transparent; everything else becomes JPEG.
  const out: ResizePlan['type'] = type === 'image/png' ? 'image/png' : type === 'image/webp' ? 'image/webp' : 'image/jpeg';

  if (purpose === 'placeBanner') {
    if (w <= BANNER_MAX_WIDTH) return null;
    return { crop: null, width: BANNER_MAX_WIDTH, height: Math.max(1, Math.round((h * BANNER_MAX_WIDTH) / w)), type: out };
  }

  const side = Math.min(w, h);
  const size = Math.min(side, SQUARE_IMAGE_SIZE);
  if (w === h && side <= SQUARE_IMAGE_SIZE) return null;
  const crop = w === h ? null : { x: Math.floor((w - side) / 2), y: Math.floor((h - side) / 2), width: side, height: side };
  return { crop, width: size, height: size, type: out };
}

export type ImageUploadPlan = { action: 'send' } | { action: 'convert'; plan: ResizePlan } | { action: 'reject'; message: string };

/**
 * What to do with a picked image before uploading it: send it as it is, shrink or re-encode it, or
 * refuse it. Formats the instance doesn't accept but a device can decode (HEIC from an iPhone, AVIF,
 * BMP) are re-encoded as JPEG; GIFs can't be converted without losing their animation.
 */
export function planImageUpload(purpose: ImagePurpose, source: { width: number; height: number; type: string }, types: readonly string[]): ImageUploadPlan {
  const type = source.type.toLowerCase();
  const accepted = types.includes(type);
  if (!accepted && (type === 'image/gif' || (type !== '' && !type.startsWith('image/')))) {
    return { action: 'reject', message: `That file type isn't supported. Use ${describeImageTypes(types)}.` };
  }
  if (accepted) {
    const plan = planResize(purpose, { ...source, type });
    return plan ? { action: 'convert', plan } : { action: 'send' };
  }
  const plan = planResize(purpose, { ...source, type: 'image/jpeg' }) ?? { crop: null, width: source.width, height: source.height, type: 'image/jpeg' as const };
  return { action: 'convert', plan };
}

export type UploadFailure =
  | { kind: Exclude<UploadFailureKind, 'rate_limited'>; message: string }
  | { kind: 'rate_limited'; retryAfter: number; message: string };

/** One sentence for a failed upload. 413, 422 and 503 have their own copy; the server's message explains a corrupt file. */
export function describeUploadFailure(e: unknown, caps?: Pick<InstanceCapabilities, 'uploadSize' | 'uploadTypes'>): UploadFailure {
  const err = e instanceof UploadError ? e : e instanceof ApiError ? new UploadError(e) : null;
  if (!err) {
    if (e instanceof TypeError || (e instanceof Error && /network request failed/i.test(e.message))) {
      return { kind: 'other', message: 'Could not reach the instance. Check your connection and try again.' };
    }
    return { kind: 'other', message: 'The image could not be uploaded. Try again.' };
  }
  switch (err.kind) {
    case 'too_large':
      return { kind: 'too_large', message: caps ? `That image is too large. The limit is ${formatBytes(caps.uploadSize)}.` : 'That image is too large.' };
    case 'unsupported':
      return { kind: 'unsupported', message: err.message || `That image can't be used. Try ${caps ? describeImageTypes(caps.uploadTypes) : 'another file'}.` };
    case 'unavailable':
      return { kind: 'unavailable', message: "Uploads aren't working on this instance right now. Its storage is unavailable; try again later." };
    case 'rate_limited': {
      const retryAfter = err.retryAfter ?? 30;
      return { kind: 'rate_limited', retryAfter, message: `Too many uploads. Try again in ${retryAfter} seconds.` };
    }
    default:
      return { kind: 'other', message: err.message || 'The image could not be uploaded. Try again.' };
  }
}
