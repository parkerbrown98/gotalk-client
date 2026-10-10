import { describe, expect, it } from 'vitest';

import { attachmentSummary, checkAttachment, embedSite, fileLabel, fitSize, isImageAttachment, messagePreview, planAttachmentImage } from './attachments.ts';
import { instanceCapabilities } from './capabilities.ts';
import { validateMessage } from './chat.ts';
import { validatePost, validateTopic } from './composer.ts';

const img = (filename = 'a.png') => ({ filename, width: 10, height: 10 });
const file = (filename = 'plans.pdf') => ({ filename, width: null, height: null });
const caps = { uploadSize: 8 * 1024 * 1024, uploadTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] };

describe('attachments', () => {
  it('tells images from files', () => {
    expect(isImageAttachment(img())).toBe(true);
    expect(isImageAttachment(file())).toBe(false);
    expect(isImageAttachment({ width: 0, height: 5 })).toBe(false);
  });

  it('fits images without enlarging them', () => {
    expect(fitSize(4000, 2000, 400, 300)).toEqual({ width: 400, height: 200 });
    expect(fitSize(1000, 3000, 400, 300)).toEqual({ width: 100, height: 300 });
    expect(fitSize(50, 40, 400, 300)).toEqual({ width: 50, height: 40 });
    expect(fitSize(0, 0, 400, 300)).toEqual({ width: 400, height: 300 });
  });

  it('summarizes what a message carries', () => {
    expect(attachmentSummary([])).toBe('');
    expect(attachmentSummary([img()])).toBe('Image');
    expect(attachmentSummary([img(), img()])).toBe('2 images');
    expect(attachmentSummary([file()])).toBe('plans.pdf');
    expect(attachmentSummary([file(), file('b.zip')])).toBe('2 files');
    expect(attachmentSummary([img(), file()])).toBe('2 attachments');
    expect(messagePreview({ content: '**hi** there', attachments: [img()] })).toBe('hi there');
    expect(messagePreview({ content: '', attachments: [img()] })).toBe('Image');
    expect(messagePreview({ content: '' })).toBe('');
  });

  it('labels files', () => {
    expect(fileLabel('plans.v2.pdf')).toBe('PDF');
    expect(fileLabel('README', 'text/markdown')).toBe('MARKDOWN');
    expect(fileLabel('blob', 'application/octet-stream')).toBe('FILE');
    expect(fileLabel('noext')).toBe('FILE');
  });

  it('checks size before uploading', () => {
    expect(checkAttachment({ name: 'a.txt', size: 10 }, caps)).toEqual({ ok: true });
    expect(checkAttachment({ name: 'a.txt', size: 0 }, caps)).toEqual({ ok: false, message: 'a.txt is empty.' });
    expect(checkAttachment({ name: 'big.mov', size: 9 * 1024 * 1024 }, caps)).toEqual({ ok: false, message: 'big.mov is 9 MB. The limit is 8 MB.' });
  });

  it('shrinks large or unsupported photos only', () => {
    expect(planAttachmentImage({ width: 1200, height: 800, type: 'image/jpeg', size: 300_000 }, caps)).toBeNull();
    expect(planAttachmentImage({ width: 6000, height: 4000, type: 'image/gif', size: 300_000 }, caps)).toBeNull();
    expect(planAttachmentImage({ width: 6000, height: 4000, type: 'image/jpeg', size: 300_000 }, caps)).toEqual({ crop: null, width: 2560, height: 1707, type: 'image/jpeg' });
    expect(planAttachmentImage({ width: 3000, height: 1000, type: 'image/png', size: 300_000 }, caps)?.type).toBe('image/png');
    expect(planAttachmentImage({ width: 1000, height: 1000, type: 'image/png', size: 20_000_000 }, caps)).toEqual({ crop: null, width: 1000, height: 1000, type: 'image/jpeg' });
    expect(planAttachmentImage({ width: 1000, height: 1000, type: 'image/heic', size: 1000 }, caps)?.type).toBe('image/jpeg');
    expect(planAttachmentImage({ width: 0, height: 0, type: 'application/pdf', size: 1000 }, caps)).toBeNull();
  });

  it('names the site an embed links to', () => {
    expect(embedSite({ site_name: 'Joinery Weekly', url: 'https://x.io', resolved_url: '' })).toBe('Joinery Weekly');
    expect(embedSite({ site_name: '', url: 'https://www.example.com/a', resolved_url: '' })).toBe('example.com');
    expect(embedSite({ site_name: '', url: 'nonsense', resolved_url: '' })).toBe('');
  });

  it('lets files stand in for text', () => {
    expect(validateMessage('', 1)).toBeNull();
    expect(validateMessage('  ')).toBe('Write something first.');
    expect(validatePost('', 2)).toBeNull();
    expect(validatePost('')?.field).toBe('content');
    expect(validateTopic({ title: 'Bench', content: '', tags: [], attachments: 1 })).toBeNull();
  });

  it('reads attachment support from the instance', () => {
    expect(instanceCapabilities({ features: { uploads: true, link_previews: true }, limits: { attachments: 10 } })).toMatchObject({ maxAttachments: 10, linkPreviews: true });
    expect(instanceCapabilities({ features: { uploads: true }, limits: {} })).toMatchObject({ maxAttachments: 0, linkPreviews: false });
    expect(instanceCapabilities({ features: { uploads: false }, limits: { attachments: 10 } }).maxAttachments).toBe(0);
  });
});
