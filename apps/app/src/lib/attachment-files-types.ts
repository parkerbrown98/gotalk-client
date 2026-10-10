/** A file chosen, pasted or dropped, ready to upload as an attachment. */
export interface LocalFile {
  blob: Blob;
  name: string;
  /** The content type to upload as. */
  type: string;
  /** Images only: something an `<Image>` can show before the upload finishes. */
  previewUri?: string;
  width?: number;
  height?: number;
}

/** Where the attach button takes files from. Phones offer the photo library and the file browser. */
export type AttachSource = 'photos' | 'files';
