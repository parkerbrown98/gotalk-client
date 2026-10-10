import { ApiError, UploadError } from '@gotalk/api-client';
import { describe, expect, it } from 'vitest';

import { degradedFeatureMessage, formatBytes, instanceCapabilities } from './capabilities.ts';
import { classifyEmailFailure, passwordResetSentCopy, resendSecondsLeft, RESEND_WAIT_SECONDS } from './email.ts';
import {
  buildSectionSettings,
  checkLabel,
  configEnvVar,
  corsCredentialsConflict,
  corsLocksOut,
  fieldsFor,
  formFromSection,
  missingFields,
  offeredDrivers,
  originAllowed,
  parseCheckFailure,
  refusedConnectionHint,
  secretPlaceholder,
  suggestedOrigins,
  type ConfigSection,
} from './server-config.ts';
import { checkUpload, describeImageTypes, describeUploadFailure, planImageUpload, planResize, uploadHint } from './uploads.ts';
import { patchUserDeep } from './users.ts';

const TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MB = 1024 * 1024;

const instance = (overrides: Record<string, unknown> = {}) => ({
  status: 'healthy' as const,
  degraded_features: [] as string[],
  setup_required: false,
  features: { email: true, password_reset: true, email_verification: true, uploads: true },
  limits: { upload_size: 8 * MB, upload_types: TYPES, upload_max_side: 8192 },
  ...overrides,
});

describe('instanceCapabilities', () => {
  it('reads every feature and limit from a current instance', () => {
    expect(instanceCapabilities(instance())).toEqual({
      email: true,
      passwordReset: true,
      emailVerification: true,
      uploads: true,
      uploadSize: 8 * MB,
      uploadTypes: TYPES,
      uploadMaxSide: 8192,
      awaitingSetup: false,
      needsAttention: false,
      degradedFeatures: [],
    });
  });

  it.each(['email', 'password_reset', 'email_verification', 'uploads'] as const)('switches %s off on its own', (flag) => {
    const caps = instanceCapabilities(instance({ features: { ...instance().features, [flag]: false } }));
    const key = { email: 'email', password_reset: 'passwordReset', email_verification: 'emailVerification', uploads: 'uploads' }[flag] as 'email';
    expect(caps[key]).toBe(false);
    const others = (['email', 'passwordReset', 'emailVerification', 'uploads'] as const).filter((k) => k !== key);
    for (const k of others) expect(caps[k]).toBe(true);
  });

  it('treats an older server without the new fields as having none of the features, with default limits', () => {
    const caps = instanceCapabilities({ features: {}, limits: {} });
    expect(caps).toMatchObject({ email: false, passwordReset: false, emailVerification: false, uploads: false, uploadSize: 8 * MB, needsAttention: false, awaitingSetup: false });
    expect(caps.uploadTypes).toEqual(TYPES);
    expect(instanceCapabilities(undefined).uploads).toBe(false);
  });

  it('flags setup and degraded features', () => {
    expect(instanceCapabilities(instance({ status: 'awaiting_setup' })).awaitingSetup).toBe(true);
    expect(instanceCapabilities(instance({ setup_required: true })).awaitingSetup).toBe(true);
    const degraded = instanceCapabilities(instance({ status: 'degraded', degraded_features: ['email', 'storage'] }));
    expect(degraded.needsAttention).toBe(true);
    expect(degraded.degradedFeatures).toEqual(['email', 'storage']);
  });

  it('explains each degraded feature', () => {
    expect(degradedFeatureMessage('email')).toMatch(/password resets/);
    expect(degradedFeatureMessage('storage')).toMatch(/uploaded/);
    expect(degradedFeatureMessage('voice')).toMatch(/voice channels/);
    expect(degradedFeatureMessage('search_index')).toBe("Search index isn't working.");
  });
});

describe('upload checks', () => {
  const caps = { uploadTypes: TYPES, uploadSize: 8 * MB };

  it('describes the limits', () => {
    expect(formatBytes(8 * MB)).toBe('8 MB');
    expect(formatBytes(1.5 * MB)).toBe('1.5 MB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(describeImageTypes(TYPES)).toBe('PNG, JPEG, GIF or WebP');
    expect(uploadHint(caps)).toBe('PNG, JPEG, GIF or WebP, up to 8 MB.');
  });

  it('accepts allowed types within the size limit', () => {
    expect(checkUpload({ type: 'image/png', size: 8 * MB }, caps)).toEqual({ ok: true });
    expect(checkUpload({ type: 'IMAGE/JPEG', size: 10 }, caps)).toEqual({ ok: true });
  });

  it('refuses other types and oversized files with the limit in the message', () => {
    expect(checkUpload({ type: 'image/heic', size: 10 }, caps)).toMatchObject({ ok: false, reason: 'type' });
    expect(checkUpload({ type: '', size: 10 }, caps)).toMatchObject({ ok: false, reason: 'type' });
    const big = checkUpload({ type: 'image/gif', size: 9 * MB }, caps);
    expect(big).toMatchObject({ ok: false, reason: 'size' });
    expect(big.ok ? '' : big.message).toBe('That image is 9 MB. The limit is 8 MB.');
  });
});

describe('downscaling', () => {
  it('center-crops avatars and icons to a square of at most 512 px', () => {
    expect(planResize('avatar', { width: 4032, height: 3024, type: 'image/jpeg' })).toEqual({
      crop: { x: 504, y: 0, width: 3024, height: 3024 },
      width: 512,
      height: 512,
      type: 'image/jpeg',
    });
    expect(planResize('placeIcon', { width: 300, height: 600, type: 'image/png' })).toEqual({ crop: { x: 0, y: 150, width: 300, height: 300 }, width: 300, height: 300, type: 'image/png' });
    expect(planResize('instanceIcon', { width: 1024, height: 1024, type: 'image/webp' })).toEqual({ crop: null, width: 512, height: 512, type: 'image/webp' });
  });

  it('leaves small square images, narrow banners and GIFs alone', () => {
    expect(planResize('avatar', { width: 256, height: 256, type: 'image/png' })).toBeNull();
    expect(planResize('placeBanner', { width: 1500, height: 500, type: 'image/jpeg' })).toBeNull();
    expect(planResize('avatar', { width: 2000, height: 1000, type: 'image/gif' })).toBeNull();
  });

  it('fits banners to 1920 px wide, keeping their proportions', () => {
    expect(planResize('placeBanner', { width: 4000, height: 1000, type: 'image/png' })).toEqual({ crop: null, width: 1920, height: 480, type: 'image/png' });
  });

  it('re-encodes formats the instance does not take, and refuses what cannot be converted', () => {
    expect(planImageUpload('avatar', { width: 256, height: 256, type: 'image/png' }, TYPES)).toEqual({ action: 'send' });
    expect(planImageUpload('avatar', { width: 4000, height: 3000, type: 'image/heic' }, TYPES)).toMatchObject({ action: 'convert', plan: { width: 512, type: 'image/jpeg' } });
    expect(planImageUpload('avatar', { width: 200, height: 200, type: 'image/heic' }, TYPES)).toEqual({ action: 'convert', plan: { crop: null, width: 200, height: 200, type: 'image/jpeg' } });
    expect(planImageUpload('avatar', { width: 200, height: 200, type: 'image/gif' }, ['image/png'])).toMatchObject({ action: 'reject' });
    expect(planImageUpload('avatar', { width: 0, height: 0, type: 'application/pdf' }, TYPES)).toMatchObject({ action: 'reject' });
  });
});

describe('upload failures', () => {
  const caps = { uploadTypes: TYPES, uploadSize: 8 * MB };
  const upload = (status: number, detail = '', retryAfter?: number) => new UploadError(new ApiError(status, { detail }, retryAfter));

  it('maps 413, 422, 503 and 429 to their own copy', () => {
    expect(describeUploadFailure(upload(413), caps)).toEqual({ kind: 'too_large', message: 'That image is too large. The limit is 8 MB.' });
    expect(describeUploadFailure(upload(422, 'the file is larger than the 8388608 byte limit'), caps).kind).toBe('too_large');
    expect(describeUploadFailure(upload(422, 'image: unknown format'), caps)).toEqual({ kind: 'unsupported', message: 'image: unknown format' });
    expect(describeUploadFailure(upload(503, 'file uploads are unavailable'), caps).kind).toBe('unavailable');
    expect(describeUploadFailure(upload(429, 'slow down', 12), caps)).toMatchObject({ kind: 'rate_limited', retryAfter: 12 });
  });

  it('accepts a plain ApiError and network failures', () => {
    expect(describeUploadFailure(new ApiError(413), caps).kind).toBe('too_large');
    expect(describeUploadFailure(new TypeError('Failed to fetch')).message).toMatch(/Could not reach/);
  });
});

describe('email flows', () => {
  it('waits a minute before Resend', () => {
    const sent = 1_000_000;
    expect(resendSecondsLeft(null, sent)).toBe(0);
    expect(resendSecondsLeft(sent, sent)).toBe(RESEND_WAIT_SECONDS);
    expect(resendSecondsLeft(sent, sent + 59_001)).toBe(1);
    expect(resendSecondsLeft(sent, sent + 60_000)).toBe(0);
  });

  it('tells already-confirmed and too-soon apart, and recognises email being down', () => {
    expect(classifyEmailFailure(new ApiError(409, { detail: 'your email address is already verified' }))).toEqual({ kind: 'already_verified' });
    expect(classifyEmailFailure(new ApiError(409, { detail: 'a verification email was sent less than a minute ago' }))).toEqual({ kind: 'cooldown', retryAfter: 60 });
    expect(classifyEmailFailure(new ApiError(503, { detail: 'email is not configured' }))).toMatchObject({ kind: 'email_unavailable' });
    expect(classifyEmailFailure(new ApiError(429, {}, 20))).toEqual({ kind: 'rate_limited', retryAfter: 20 });
    expect(classifyEmailFailure(new ApiError(422, { detail: 'email address is invalid' }))).toEqual({ kind: 'invalid', message: 'email address is invalid' });
    expect(classifyEmailFailure(new TypeError('Failed to fetch'))).toEqual({ kind: 'network' });
  });

  it('never says whether an account uses the address', () => {
    const copy = passwordResetSentCopy(' sam@example.com ');
    expect(copy).toMatch(/^If an account uses sam@example\.com, we've sent it a link/);
    expect(copy).not.toMatch(/no account|not found/i);
  });
});

const section = (settings: Record<string, unknown>, extra: Partial<ConfigSection> = {}) =>
  ({ source: 'settings', editable: true, config_key: 'mail.driver', secrets_set: [], settings, ...extra }) as unknown as ConfigSection;

describe('server settings forms', () => {
  it('knows the fields for each provider, and not for plugins', () => {
    expect(fieldsFor('mail', 'smtp')?.map((f) => f.key)).toEqual(['from', 'smtp_host', 'smtp_port', 'smtp_tls', 'smtp_username', 'smtp_password']);
    expect(fieldsFor('mail', 'mailgun')?.map((f) => f.key)).toContain('domain');
    expect(fieldsFor('mail', 'ses')?.find((f) => f.key === 'secret_access_key')?.kind).toBe('secret');
    expect(fieldsFor('storage', 's3')?.map((f) => f.key)).toContain('s3_force_path_style');
    expect(fieldsFor('mail', '')).toEqual([]);
    expect(fieldsFor('mail', 'carrier-pigeon')).toBeNull();
    expect(fieldsFor('cors', '')?.map((f) => f.key)).toEqual(['allowed_origins', 'allow_credentials']);
  });

  it('offers the server drivers in a stable order, plugins last, and Off for email', () => {
    expect(offeredDrivers('mail', ['smtp', 'log', 'resend', 'carrier-pigeon']).map((d) => d.value)).toEqual(['', 'smtp', 'resend', 'log', 'carrier-pigeon']);
    expect(offeredDrivers('storage', ['s3', 'local']).map((d) => d.label)).toEqual(['Local directory', 'S3-compatible']);
  });

  it('loads a section into form values, joining lists and leaving secrets empty', () => {
    expect(formFromSection('mail', section({ driver: 'smtp', smtp_host: 'mail', smtp_port: 1025, smtp_password: '' }, { secrets_set: ['smtp_password'] }))).toEqual({
      driver: 'smtp',
      smtp_host: 'mail',
      smtp_port: '1025',
      smtp_password: '',
    });
    expect(formFromSection('cors', section({ allowed_origins: ['https://a.example', 'tauri://localhost'], allow_credentials: false }))).toEqual({
      allowed_origins: 'https://a.example\ntauri://localhost',
      allow_credentials: false,
    });
  });

  it('keeps a secret left empty, sends a new one, and drops other drivers fields', () => {
    const values = { driver: 'smtp', from: ' Gotalk <a@b> ', smtp_host: 'mail', smtp_port: '1025', smtp_password: '', api_key: 'leftover' };
    expect(buildSectionSettings('mail', values)).toEqual({ mail: { driver: 'smtp', from: 'Gotalk <a@b>', smtp_host: 'mail', smtp_port: 1025 } });
    expect(buildSectionSettings('mail', { ...values, smtp_password: 'hunter2' }).mail).toMatchObject({ smtp_password: 'hunter2' });
    expect(buildSectionSettings('mail', { driver: '' })).toEqual({ mail: { driver: '' } });
    expect(buildSectionSettings('storage', { driver: 's3', s3_bucket: 'media', s3_force_path_style: true })).toEqual({ storage: { driver: 's3', s3_bucket: 'media', s3_force_path_style: true } });
    expect(buildSectionSettings('voice', {})).toEqual({ voice: { livekit_url: '' } });
    expect(buildSectionSettings('cors', { allowed_origins: 'https://a.example, https://b.example\n\n', allow_credentials: false })).toEqual({
      cors: { allowed_origins: ['https://a.example', 'https://b.example'], allow_credentials: false },
    });
  });

  it('counts a secret the server holds as filled, and shows that it is set', () => {
    expect(missingFields('mail', { driver: 'resend', from: 'a@b', api_key: '' }, [])).toEqual(['api_key']);
    expect(missingFields('mail', { driver: 'resend', from: 'a@b', api_key: '' }, ['api_key'])).toEqual([]);
    expect(missingFields('cors', { allowed_origins: ' \n ' }, [])).toEqual(['allowed_origins']);
    expect(secretPlaceholder(true)).toMatch(/^Set/);
    expect(secretPlaceholder(false)).toBe('Not set');
  });

  it('names the variable behind a read-only section and parses a failed check', () => {
    expect(configEnvVar('mail.driver')).toBe('GOTALK_MAIL_DRIVER');
    expect(configEnvVar('server.cors_allowed_origins')).toBe('GOTALK_SERVER_CORS_ALLOWED_ORIGINS');
    expect(parseCheckFailure('email check failed: smtp: dial tcp: connection refused')).toEqual({ name: 'email', detail: 'smtp: dial tcp: connection refused' });
    expect(parseCheckFailure('no settings to save')).toBeNull();
    expect(checkLabel('public_url')).toBe('Public URL');
    expect(checkLabel('search_index')).toBe('Search index');
  });
});

describe('CORS', () => {
  it('matches origins the way the server does', () => {
    expect(originAllowed(['*'], 'https://anything.example')).toBe(true);
    expect(originAllowed(['https://*.example.com'], 'https://app.example.com')).toBe(true);
    expect(originAllowed(['https://*.example.com'], 'https://example.org')).toBe(false);
    expect(originAllowed(['https://App.Example.com/'], 'https://app.example.com')).toBe(true);
  });

  it('warns when the list would lock out the page in use', () => {
    expect(corsLocksOut(['https://other.example'], 'https://app.gotalk.io')).toBe(true);
    expect(corsLocksOut(['https://app.gotalk.io', 'tauri://localhost'], 'https://app.gotalk.io')).toBe(false);
    expect(corsLocksOut(['*'], 'https://app.gotalk.io')).toBe(false);
    expect(corsLocksOut(['https://other.example'], null)).toBe(false);
  });

  it('refuses * with credentials before sending', () => {
    expect(corsCredentialsConflict(['*'], true)).toBe(true);
    expect(corsCredentialsConflict(['*'], false)).toBe(false);
    expect(corsCredentialsConflict(['https://a.example'], true)).toBe(false);
  });

  it('suggests the page and the desktop origins that are missing', () => {
    expect(suggestedOrigins(['https://app.gotalk.io'], 'https://app.gotalk.io')).toEqual(['tauri://localhost', 'http://tauri.localhost']);
    expect(suggestedOrigins(['*'], 'https://app.gotalk.io')).toEqual([]);
    expect(suggestedOrigins([], 'tauri://localhost')).toEqual(['tauri://localhost', 'http://tauri.localhost']);
  });
});

describe('refused connections', () => {
  const hint = (pageOrigin: string | null, instanceOrigin: string, web = true) => refusedConnectionHint({ pageOrigin, instanceOrigin, web });

  it('adds the hint on the web when another site cannot be reached', () => {
    expect(hint('https://app.gotalk.io', 'https://forum.example')).toBe(
      'This instance may not allow connections from https://app.gotalk.io. Its administrator can allow it in the server settings.',
    );
    expect(hint('tauri://localhost', 'https://forum.example')).toMatch(/tauri:\/\/localhost/);
  });

  it('stays quiet on phones, on the same origin and for an instance on this machine', () => {
    expect(hint(null, 'https://forum.example', false)).toBeNull();
    expect(hint('https://forum.example', 'https://forum.example')).toBeNull();
    expect(hint('http://localhost:8081', 'http://localhost:18080')).toBeNull();
    expect(hint('http://localhost:8081', 'http://127.0.0.1:18080')).toBeNull();
  });
});

describe('patchUserDeep', () => {
  it('changes every embedded copy of the user and keeps the rest untouched', () => {
    const other = { id: 'u2', display_name: 'Ana', avatar_url: 'a.png' };
    const data = {
      pages: [{ items: [{ id: 'm1', author: { id: 'u1', display_name: 'Marta', avatar_url: 'old.png' } }, { id: 'm2', author: other }] }],
      pageParams: [null],
    };
    const next = patchUserDeep(data, 'u1', { avatar_url: 'new.png', display_name: 'Marta K' });
    expect(next.pages[0]!.items[0]!.author).toEqual({ id: 'u1', display_name: 'Marta K', avatar_url: 'new.png' });
    expect(next.pages[0]!.items[1]).toBe(data.pages[0]!.items[1]);
    expect(next.pageParams).toBe(data.pageParams);
    expect(data.pages[0]!.items[0]!.author.avatar_url).toBe('old.png');
  });

  it('returns the same data when nothing changes, and adds no fields', () => {
    const data = [{ id: 'u1', username: 'marta' }, { id: 'u1', avatar_url: 'same.png' }];
    expect(patchUserDeep(data, 'u1', { avatar_url: 'same.png' })).toBe(data);
    expect(patchUserDeep(data, 'u1', { avatar_url: 'x.png' })[0]).toBe(data[0]);
  });
});
