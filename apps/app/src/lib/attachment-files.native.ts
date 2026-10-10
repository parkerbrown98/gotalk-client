import { planAttachmentImage, type InstanceCapabilities } from '@gotalk/core';
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { AttachSource, LocalFile } from './attachment-files-types';

export type { AttachSource, LocalFile } from './attachment-files-types';

/** Phones offer the photo library and the system file browser. */
export const ATTACH_SOURCES: readonly AttachSource[] = ['photos', 'files'];

type Caps = Pick<InstanceCapabilities, 'uploadTypes' | 'uploadSize'>;

const formats = { 'image/png': SaveFormat.PNG, 'image/webp': SaveFormat.WEBP, 'image/jpeg': SaveFormat.JPEG } as const;
const EXT = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' } as const;

async function photo(asset: ImagePicker.ImagePickerAsset, caps: Caps): Promise<LocalFile> {
  const type = (asset.mimeType ?? 'image/jpeg').toLowerCase();
  let uri = asset.uri;
  let outType = type;
  let { width, height } = asset;
  let name = asset.fileName ?? `photo.${type.split('/')[1] ?? 'jpg'}`;
  const plan = planAttachmentImage({ width, height, type, size: asset.fileSize ?? 0 }, caps);
  if (plan) {
    const image = await ImageManipulator.manipulate(asset.uri).resize({ width: plan.width, height: plan.height }).renderAsync();
    const saved = await image.saveAsync({ format: formats[plan.type], compress: 0.88 });
    uri = saved.uri;
    outType = plan.type;
    width = saved.width;
    height = saved.height;
    name = `${name.replace(/\.[^.]+$/, '') || 'photo'}.${EXT[plan.type]}`;
  }
  const blob = await (await fetch(uri)).blob();
  return { blob, name, type: outType, previewUri: uri, width, height };
}

async function fromDocument(asset: DocumentPicker.DocumentPickerAsset): Promise<LocalFile> {
  const blob = await (await fetch(asset.uri)).blob();
  const type = asset.mimeType ?? blob.type ?? 'application/octet-stream';
  return { blob, name: asset.name, type, previewUri: type.startsWith('image/') ? asset.uri : undefined };
}

/** Opens the photo library or the file browser and readies what was picked. */
export async function chooseAttachments(source: AttachSource, caps: Caps): Promise<LocalFile[]> {
  if (source === 'photos') {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10, quality: 1, exif: false });
    if (picked.canceled) return [];
    return Promise.all(picked.assets.map((a) => photo(a, caps)));
  }
  const picked = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (picked.canceled) return [];
  return Promise.all(picked.assets.map(fromDocument));
}

/** Phones paste and drop through the system, not through these. */
export function prepareFiles(_files: readonly File[], _caps: Caps): Promise<LocalFile[]> {
  return Promise.resolve([]);
}

export function releasePreview(_uri: string | undefined): void {}

export function filesIn(_data: DataTransfer | null | undefined): File[] {
  return [];
}

export function dragHasFiles(_data: DataTransfer | null | undefined): boolean {
  return false;
}
