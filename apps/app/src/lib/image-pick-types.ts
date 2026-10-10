import type { ImagePurpose } from '@gotalk/core';

export interface PickedImage {
  blob: Blob;
  /** The content type to upload as. */
  type: string;
}

export type PickResult = { status: 'canceled' } | { status: 'invalid'; message: string } | { status: 'ok'; image: PickedImage };

export interface PickOptions {
  purpose: ImagePurpose;
  /** Content types the instance accepts. */
  types: readonly string[];
  /** Largest upload in bytes. */
  maxSize: number;
}
