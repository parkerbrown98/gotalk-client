import { checkUpload, planImageUpload, type ResizePlan } from '@gotalk/core';

import type { PickOptions, PickResult } from './image-pick-types';

export type { PickedImage, PickOptions, PickResult } from './image-pick-types';

/** Opens the file chooser. Resolves null when it closes without a file. */
function chooseFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    let settled = false;
    const done = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.9));
}

async function render(file: File, plan: ResizePlan, bitmap: ImageBitmap): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  const c = plan.crop ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  // JPEG has no transparency; a white backdrop beats the black a canvas would otherwise give it.
  if (plan.type === 'image/jpeg' && file.type !== 'image/jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, plan.width, plan.height);
  }
  ctx.drawImage(bitmap, c.x, c.y, c.width, c.height, 0, 0, plan.width, plan.height);
  return toBlob(canvas, plan.type);
}

/** Web and desktop: a file input, then a canvas to crop and shrink the image before it is sent. */
export async function pickImage({ purpose, types, maxSize }: PickOptions): Promise<PickResult> {
  const file = await chooseFile([...types, 'image/*'].join(','));
  if (!file) return { status: 'canceled' };

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Not decodable here; the server decides whether it can use it.
  }
  const plan = planImageUpload(purpose, { width: bitmap?.width ?? 0, height: bitmap?.height ?? 0, type: file.type }, types);
  try {
    if (plan.action === 'reject') return { status: 'invalid', message: plan.message };
    let blob: Blob = file;
    let type = file.type;
    if (plan.action === 'convert' && bitmap) {
      const out = await render(file, plan.plan, bitmap);
      if (out) {
        blob = out;
        type = out.type || plan.plan.type;
      }
    }
    const check = checkUpload({ type, size: blob.size }, { uploadTypes: types, uploadSize: maxSize });
    if (!check.ok) return { status: 'invalid', message: check.message };
    return { status: 'ok', image: { blob, type } };
  } finally {
    bitmap?.close();
  }
}
