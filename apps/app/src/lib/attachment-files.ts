import { planAttachmentImage, type InstanceCapabilities } from '@gotalk/core';

import type { AttachSource, LocalFile } from './attachment-files-types';

export type { AttachSource, LocalFile } from './attachment-files-types';

/** The browser and the desktop shell have one file chooser for everything. */
export const ATTACH_SOURCES: readonly AttachSource[] = ['files'];

type Caps = Pick<InstanceCapabilities, 'uploadTypes' | 'uploadSize'>;

/** Opens the file chooser for any number of files. Resolves empty when it closes without any. */
function chooseFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.style.display = 'none';
    let settled = false;
    const done = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done([...(input.files ?? [])]));
    input.addEventListener('cancel', () => done([]));
    document.body.appendChild(input);
    input.click();
  });
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function renamed(name: string, type: string): string {
  const ext = EXT[type];
  if (!ext) return name;
  const base = name.replace(/\.[^./\\]+$/, '') || 'image';
  return `${base}.${ext}`;
}

/** Shrinks large photos and converts formats the instance does not take; everything else goes as it is. */
async function prepare(file: File, caps: Caps): Promise<LocalFile> {
  const name = file.name || (file.type.startsWith('image/') ? `image.${EXT[file.type] ?? 'png'}` : 'file');
  const out: LocalFile = { blob: file, name, type: file.type || 'application/octet-stream' };
  if (!file.type.startsWith('image/')) return out;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Not an image this browser can decode (SVG, HEIC on most browsers): send the file as it is.
    return out;
  }
  try {
    out.width = bitmap.width;
    out.height = bitmap.height;
    const plan = planAttachmentImage({ width: bitmap.width, height: bitmap.height, type: file.type, size: file.size }, caps);
    if (plan) {
      const canvas = document.createElement('canvas');
      canvas.width = plan.width;
      canvas.height = plan.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingQuality = 'high';
        if (plan.type === 'image/jpeg') {
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, plan.width, plan.height);
        }
        ctx.drawImage(bitmap, 0, 0, plan.width, plan.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, plan.type, 0.88));
        if (blob) {
          out.blob = blob;
          out.type = blob.type || plan.type;
          out.name = renamed(name, out.type);
          out.width = plan.width;
          out.height = plan.height;
        }
      }
    }
    out.previewUri = URL.createObjectURL(out.blob);
    return out;
  } finally {
    bitmap.close();
  }
}

/** Readies pasted, dropped or chosen files for upload. */
export function prepareFiles(files: readonly File[], caps: Caps): Promise<LocalFile[]> {
  return Promise.all(files.map((f) => prepare(f, caps)));
}

/** Opens the file chooser and readies what was picked. */
export async function chooseAttachments(_source: AttachSource, caps: Caps): Promise<LocalFile[]> {
  return prepareFiles(await chooseFiles(), caps);
}

/** Frees the memory behind a preview made by {@link prepareFiles}. */
export function releasePreview(uri: string | undefined): void {
  if (uri?.startsWith('blob:')) URL.revokeObjectURL(uri);
}

/** The files in a paste or drop, if it carries any. */
export function filesIn(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  const fromItems = [...(data.items ?? [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter((f): f is File => !!f);
  return fromItems.length > 0 ? fromItems : [...(data.files ?? [])];
}

/** Whether a drag carries files (their contents are only readable on drop). */
export function dragHasFiles(data: DataTransfer | null | undefined): boolean {
  return !!data && [...(data.types ?? [])].includes('Files');
}

if (typeof window !== 'undefined') {
  // A file dropped anywhere outside a drop zone would otherwise make the page navigate to it.
  const block = (e: DragEvent) => {
    if (dragHasFiles(e.dataTransfer) && !e.defaultPrevented) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    }
  };
  window.addEventListener('dragover', block);
  window.addEventListener('drop', block);
}
