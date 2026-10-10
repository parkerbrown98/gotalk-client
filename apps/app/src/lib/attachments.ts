import { uploadAttachment, type GotalkClient } from '@gotalk/api-client';
import { checkAttachment, describeUploadFailure, type Attachment, type InstanceCapabilities } from '@gotalk/core';
import { useMemo } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { useApiClient } from './api';
import { releasePreview, type LocalFile } from './attachment-files';
import { useInstanceCapabilities } from './uploads';

export type { Attachment };

/** A file on its way to becoming an attachment: uploading, uploaded, or refused. */
export interface PendingAttachment {
  key: string;
  file: LocalFile;
  state: 'uploading' | 'ready' | 'failed';
  error?: string;
  attachment?: Attachment;
}

interface Draft {
  items: PendingAttachment[];
  /** Why the last files offered were not added, e.g. too many or too large. */
  notice: string | null;
}

const EMPTY: Draft = { items: [], notice: null };

/**
 * Files waiting to be sent, per composer (a channel, or a topic being replied to). Uploads start as soon
 * as files are added and live outside any screen, so switching channels mid-upload loses nothing.
 */
const drafts = createStore<Record<string, Draft>>(() => ({}));
const uploads = new Map<string, AbortController>();
let counter = 0;

function patch(key: string, change: (d: Draft) => Draft) {
  drafts.setState((s) => ({ ...s, [key]: change(s[key] ?? EMPTY) }));
}

function patchItem(key: string, itemKey: string, change: Partial<PendingAttachment>) {
  patch(key, (d) => ({ ...d, items: d.items.map((i) => (i.key === itemKey ? { ...i, ...change } : i)) }));
}

async function upload(client: GotalkClient, caps: InstanceCapabilities, key: string, item: PendingAttachment) {
  const ctl = new AbortController();
  uploads.set(item.key, ctl);
  patchItem(key, item.key, { state: 'uploading', error: undefined });
  try {
    const attachment = await uploadAttachment(client, item.file.blob, item.file.name, item.file.type, ctl.signal);
    if (!ctl.signal.aborted) patchItem(key, item.key, { state: 'ready', attachment });
  } catch (e) {
    if (!ctl.signal.aborted) patchItem(key, item.key, { state: 'failed', error: describeUploadFailure(e, caps, 'file').message });
  } finally {
    if (uploads.get(item.key) === ctl) uploads.delete(item.key);
  }
}

function drop(items: readonly PendingAttachment[]) {
  for (const i of items) {
    uploads.get(i.key)?.abort();
    uploads.delete(i.key);
    releasePreview(i.file.previewUri);
  }
}

export interface AttachmentDraft {
  /** The instance takes attachments and the composer may add them. */
  enabled: boolean;
  max: number;
  items: PendingAttachment[];
  notice: string | null;
  uploading: boolean;
  /** Every file uploaded: what goes with the message. */
  ready: Attachment[];
  add(files: readonly LocalFile[]): void;
  remove(itemKey: string): void;
  retry(itemKey: string): void;
  dismissNotice(): void;
  /** Forgets the files once they are sent (or discarded). Uploads nobody sends are deleted by the server. */
  clear(): void;
}

/** Files attached to the composer identified by `draftKey` (null disables attaching). */
export function useAttachmentDraft(draftKey: string | null): AttachmentDraft {
  const client = useApiClient();
  const caps = useInstanceCapabilities();
  const draft = useStore(drafts, (s) => (draftKey ? s[draftKey] : undefined) ?? EMPTY);
  return useMemo(() => {
    const enabled = !!client && !!draftKey && caps.maxAttachments > 0;
    const ready = draft.items.flatMap((i) => (i.state === 'ready' && i.attachment ? [i.attachment] : []));
    return {
      enabled,
      max: caps.maxAttachments,
      items: draft.items,
      notice: draft.notice,
      uploading: draft.items.some((i) => i.state === 'uploading'),
      ready,
      add(files) {
        if (!enabled || !client || !draftKey || files.length === 0) return;
        const current = drafts.getState()[draftKey] ?? EMPTY;
        const room = caps.maxAttachments - current.items.length;
        const problems: string[] = [];
        const accepted: PendingAttachment[] = [];
        for (const file of files) {
          const check = checkAttachment({ name: file.name, size: file.blob.size }, caps);
          if (!check.ok) problems.push(check.message);
          else if (accepted.length >= room) problems.push(`You can attach up to ${caps.maxAttachments} files.`);
          else accepted.push({ key: `att-${++counter}`, file, state: 'uploading' });
        }
        drop(files.filter((f) => !accepted.some((a) => a.file === f)).map((file) => ({ key: '', file, state: 'failed' as const })));
        patch(draftKey, (d) => ({ items: [...d.items, ...accepted], notice: problems.length ? [...new Set(problems)].join(' ') : null }));
        for (const item of accepted) void upload(client, caps, draftKey, item);
      },
      remove(itemKey) {
        if (!draftKey) return;
        const gone = draft.items.filter((i) => i.key === itemKey);
        drop(gone);
        patch(draftKey, (d) => ({ ...d, items: d.items.filter((i) => i.key !== itemKey) }));
      },
      retry(itemKey) {
        const item = draft.items.find((i) => i.key === itemKey);
        if (item && client && draftKey) void upload(client, caps, draftKey, item);
      },
      dismissNotice() {
        if (draftKey) patch(draftKey, (d) => ({ ...d, notice: null }));
      },
      clear() {
        if (!draftKey) return;
        drop(drafts.getState()[draftKey]?.items ?? []);
        patch(draftKey, () => EMPTY);
      },
    };
  }, [client, caps, draftKey, draft]);
}
