import { checkUpload, planImageUpload } from '@gotalk/core';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { PickOptions, PickResult } from './image-pick-types';

export type { PickedImage, PickOptions, PickResult } from './image-pick-types';

const formats = { 'image/png': SaveFormat.PNG, 'image/webp': SaveFormat.WEBP, 'image/jpeg': SaveFormat.JPEG } as const;

/** Phones: the system photo picker, then the image manipulator to crop and shrink before sending. */
export async function pickImage({ purpose, types, maxSize }: PickOptions): Promise<PickResult> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false });
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (!asset) return { status: 'canceled' };

  const sourceType = (asset.mimeType ?? 'image/jpeg').toLowerCase();
  const plan = planImageUpload(purpose, { width: asset.width, height: asset.height, type: sourceType }, types);
  if (plan.action === 'reject') return { status: 'invalid', message: plan.message };

  let uri = asset.uri;
  let type = sourceType;
  if (plan.action === 'convert') {
    const p = plan.plan;
    const context = ImageManipulator.manipulate(asset.uri);
    if (p.crop) context.crop({ originX: p.crop.x, originY: p.crop.y, width: p.crop.width, height: p.crop.height });
    if (p.width !== (p.crop?.width ?? asset.width) || p.height !== (p.crop?.height ?? asset.height)) context.resize({ width: p.width, height: p.height });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ format: formats[p.type], compress: 0.9 });
    uri = saved.uri;
    type = p.type;
  }

  const blob = await (await fetch(uri)).blob();
  const check = checkUpload({ type, size: blob.size }, { uploadTypes: types, uploadSize: maxSize });
  if (!check.ok) return { status: 'invalid', message: check.message };
  return { status: 'ok', image: { blob, type } };
}
