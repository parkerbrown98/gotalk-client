import type { Schemas } from '@gotalk/api-client';

import { formatBytes, type InstanceCapabilities } from './capabilities.ts';
import { previewText } from './chat.ts';
import type { ResizePlan } from './uploads.ts';

export type Attachment = Schemas['Attachment'];
export type Embed = Schemas['Embed'];

/** Longest side, in pixels, of a photo attached to a message or post after shrinking. */
export const ATTACHMENT_MAX_SIDE = 2560;

/** Images have dimensions and are shown inline; anything else is a file to download. */
export function isImageAttachment(a: Pick<Attachment, 'width' | 'height'>): boolean {
  return (a.width ?? 0) > 0 && (a.height ?? 0) > 0;
}

/** Scales a box down (never up) to fit within the bounds, keeping its proportions. */
export function fitSize(width: number, height: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: maxWidth, height: maxHeight };
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** "Image", "3 images", "plans.pdf", "2 files", "4 attachments". */
export function attachmentSummary(attachments: readonly Pick<Attachment, 'width' | 'height' | 'filename'>[]): string {
  const n = attachments.length;
  if (n === 0) return '';
  const images = attachments.filter(isImageAttachment).length;
  if (images === n) return n === 1 ? 'Image' : `${n} images`;
  if (images === 0) return n === 1 ? attachments[0]!.filename || 'File' : `${n} files`;
  return `${n} attachments`;
}

/** One-line preview of a message or post: its text, or what it carries when it is only files. */
export function messagePreview(m: { content: string; attachments?: readonly Pick<Attachment, 'width' | 'height' | 'filename'>[] | null }, max = 120): string {
  return previewText(m.content, max) || attachmentSummary(m.attachments ?? []);
}

/** "PDF", "ZIP": the label on a file card. */
export function fileLabel(filename: string, contentType = ''): string {
  const ext = /\.([a-z0-9]{1,8})$/i.exec(filename)?.[1];
  if (ext) return ext.toUpperCase();
  const sub = contentType.split('/')[1]?.split(/[+;.-]/)[0];
  return sub && sub !== 'octet' ? sub.toUpperCase().slice(0, 8) : 'FILE';
}

export type AttachmentCheck = { ok: true } | { ok: false; message: string };

/** Checks a file before it is uploaded as an attachment. */
export function checkAttachment(file: { name: string; size: number }, caps: Pick<InstanceCapabilities, 'uploadSize'>): AttachmentCheck {
  if (file.size === 0) return { ok: false, message: `${file.name || 'That file'} is empty.` };
  if (file.size > caps.uploadSize) {
    return { ok: false, message: `${file.name || 'That file'} is ${formatBytes(file.size)}. The limit is ${formatBytes(caps.uploadSize)}.` };
  }
  return { ok: true };
}

/**
 * How to shrink a photo before attaching it, or null to send it as it is. Large photos are scaled to
 * {@link ATTACHMENT_MAX_SIDE} so everyone who sees them is not served the full camera original, and
 * formats the instance does not accept but the device can decode (HEIC, AVIF, BMP) become JPEG. GIFs
 * keep their animation and go as they are.
 */
export function planAttachmentImage(source: { width: number; height: number; type: string; size: number }, caps: Pick<InstanceCapabilities, 'uploadTypes' | 'uploadSize'>): ResizePlan | null {
  const type = source.type.toLowerCase();
  const { width: w, height: h } = source;
  if (type === 'image/gif' || !type.startsWith('image/') || !(w > 0) || !(h > 0)) return null;
  const accepted = caps.uploadTypes.includes(type);
  const tooBig = Math.max(w, h) > ATTACHMENT_MAX_SIDE;
  const tooHeavy = source.size > caps.uploadSize;
  if (accepted && !tooBig && !tooHeavy) return null;
  const size = fitSize(w, h, ATTACHMENT_MAX_SIDE, ATTACHMENT_MAX_SIDE);
  // PNG and WebP keep their transparency unless the file would still be too heavy.
  const out: ResizePlan['type'] = type === 'image/webp' && accepted ? 'image/webp' : type === 'image/png' && accepted && !tooHeavy ? 'image/png' : 'image/jpeg';
  return { crop: null, width: size.width, height: size.height, type: out };
}

/** The address an embed's link goes to, shown when a page has no site name. */
export function embedSite(embed: Pick<Embed, 'site_name' | 'url' | 'resolved_url'>): string {
  if (embed.site_name) return embed.site_name;
  try {
    return new URL(embed.resolved_url || embed.url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
