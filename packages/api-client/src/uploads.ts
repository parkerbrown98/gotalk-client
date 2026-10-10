import { ApiError, unwrap } from './errors.ts';
import type { GotalkClient, Schemas } from './index.ts';

/** Where an image goes. Each target answers with the object that now carries the new URL. */
export type UploadTarget =
  | { kind: 'avatar' }
  | { kind: 'placeIcon'; place: string }
  | { kind: 'placeBanner'; place: string }
  | { kind: 'instanceIcon' };

export type UploadResult<T extends UploadTarget> = T extends { kind: 'avatar' }
  ? Schemas['SelfUser']
  : T extends { kind: 'instanceIcon' }
    ? Schemas['Instance']
    : Schemas['Place'];

export type UploadFailureKind = 'too_large' | 'unsupported' | 'unavailable' | 'rate_limited' | 'other';

/** An upload the server refused, sorted into the cases the pickers explain. */
export class UploadError extends Error {
  readonly kind: UploadFailureKind;
  readonly status: number;
  readonly retryAfter: number | undefined;
  readonly cause: ApiError;

  constructor(cause: ApiError) {
    super(cause.message);
    this.name = 'UploadError';
    this.cause = cause;
    this.status = cause.status;
    this.retryAfter = cause.retryAfter;
    this.kind = uploadFailureKind(cause.status, cause.message);
  }
}

export function uploadFailureKind(status: number, message = ''): UploadFailureKind {
  switch (status) {
    case 413:
      return 'too_large';
    case 415:
    case 422:
      // A body under the transport limit but over the configured one comes back as a 422.
      return /larger than/i.test(message) ? 'too_large' : 'unsupported';
    case 503:
      return 'unavailable';
    case 429:
      return 'rate_limited';
    default:
      return 'other';
  }
}

function pathOf(target: UploadTarget): string {
  switch (target.kind) {
    case 'avatar':
      return '/users/@me/avatar';
    case 'instanceIcon':
      return '/instance/icon';
    case 'placeIcon':
      return '/places/{place}/icon';
    case 'placeBanner':
      return '/places/{place}/banner';
  }
}

function paramsOf(target: UploadTarget) {
  return 'place' in target ? { path: { place: target.place } } : undefined;
}

// The upload operations share a shape openapi-fetch cannot express for a union of paths.
type LooseClient = {
  PUT(path: string, init: Record<string, unknown>): Promise<{ data?: unknown; error?: unknown; response: Response }>;
  DELETE(path: string, init: Record<string, unknown>): Promise<{ data?: unknown; error?: unknown; response: Response }>;
};

/**
 * Sends an image as the raw request body. It is a `Blob`, not a stream, so a client built by the auth
 * manager can resend it after refreshing an expired token. Refusals throw {@link UploadError}.
 */
export async function uploadImage<T extends UploadTarget>(client: GotalkClient, target: T, image: Blob, contentType?: string): Promise<UploadResult<T>> {
  const type = contentType || image.type || 'application/octet-stream';
  const result = await (client as unknown as LooseClient).PUT(pathOf(target), {
    params: paramsOf(target),
    body: image,
    bodySerializer: (body: unknown) => body,
    headers: { 'Content-Type': type },
  });
  try {
    return unwrap(result) as UploadResult<T>;
  } catch (e) {
    throw e instanceof ApiError ? new UploadError(e) : e;
  }
}

/** Removes the image, falling back to the initials or no banner. */
export async function removeImage<T extends UploadTarget>(client: GotalkClient, target: T): Promise<UploadResult<T>> {
  return unwrap(await (client as unknown as LooseClient).DELETE(pathOf(target), { params: paramsOf(target) })) as UploadResult<T>;
}

type LoosePost = {
  POST(path: string, init: Record<string, unknown>): Promise<{ data?: unknown; error?: unknown; response: Response }>;
};

/**
 * Uploads a file to attach to a message or post; pass the returned `id` in `attachment_ids` within an
 * hour. Like {@link uploadImage}, the body is a `Blob` so it can be resent after a token refresh.
 * Refusals throw {@link UploadError}.
 */
export async function uploadAttachment(client: GotalkClient, file: Blob, filename: string, contentType?: string, signal?: AbortSignal): Promise<Schemas['Attachment']> {
  const type = contentType || file.type || 'application/octet-stream';
  const result = await (client as unknown as LoosePost).POST('/attachments', {
    params: { query: { filename } },
    body: file,
    bodySerializer: (body: unknown) => body,
    headers: { 'Content-Type': type },
    signal,
  });
  try {
    return unwrap(result) as Schemas['Attachment'];
  } catch (e) {
    throw e instanceof ApiError ? new UploadError(e) : e;
  }
}
