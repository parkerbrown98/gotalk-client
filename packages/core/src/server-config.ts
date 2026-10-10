import type { Schemas } from '@gotalk/api-client';

export type InstanceConfig = Schemas['InstanceConfig'];
export type ProviderSettings = Schemas['ProviderSettings'];
export type ConfigCheck = Schemas['SetupCheck'];
export type ConfigSectionName = 'mail' | 'storage' | 'voice' | 'cors';
export type ConfigSection = InstanceConfig[ConfigSectionName];

/** Origins the desktop app sends: `tauri://localhost` on macOS and Linux, `http://tauri.localhost` on Windows. */
export const DESKTOP_ORIGINS: readonly string[] = ['tauri://localhost', 'http://tauri.localhost'];

export type FieldKind = 'text' | 'number' | 'secret' | 'boolean' | 'select' | 'list';

export interface ConfigField {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: readonly { value: string; label: string }[];
}

export interface ConfigDriver {
  value: string;
  label: string;
  fields: readonly ConfigField[];
}

const from: ConfigField = { key: 'from', label: 'Sender', kind: 'text', required: true, placeholder: 'Gotalk <noreply@forum.example.com>', hint: 'The address messages come from. Your provider must allow it.' };
const apiKey: ConfigField = { key: 'api_key', label: 'API key', kind: 'secret', required: true };
const apiUrl: ConfigField = { key: 'api_url', label: 'API URL', kind: 'text', placeholder: 'Leave empty for the default', hint: "Only for a provider's regional endpoint, such as https://api.eu.mailgun.net." };

/** Email providers the server ships with. An empty driver turns email off. */
export const MAIL_DRIVERS: readonly ConfigDriver[] = [
  { value: '', label: 'Off', fields: [] },
  {
    value: 'smtp',
    label: 'SMTP',
    fields: [
      from,
      { key: 'smtp_host', label: 'Host', kind: 'text', required: true, placeholder: 'smtp.example.com' },
      { key: 'smtp_port', label: 'Port', kind: 'number', placeholder: '587', hint: 'Defaults to 587 for STARTTLS, 465 for TLS and 25 for none.' },
      {
        key: 'smtp_tls',
        label: 'Encryption',
        kind: 'select',
        options: [
          { value: 'starttls', label: 'STARTTLS' },
          { value: 'tls', label: 'TLS' },
          { value: 'none', label: 'None' },
        ],
      },
      { key: 'smtp_username', label: 'Username', kind: 'text' },
      { key: 'smtp_password', label: 'Password', kind: 'secret' },
    ],
  },
  { value: 'sendgrid', label: 'SendGrid', fields: [from, apiKey, apiUrl] },
  { value: 'mailgun', label: 'Mailgun', fields: [from, apiKey, { key: 'domain', label: 'Sending domain', kind: 'text', required: true, placeholder: 'mg.example.com' }, apiUrl] },
  { value: 'postmark', label: 'Postmark', fields: [from, { ...apiKey, label: 'Server token' }, apiUrl] },
  { value: 'resend', label: 'Resend', fields: [from, apiKey, apiUrl] },
  {
    value: 'ses',
    label: 'Amazon SES',
    fields: [
      from,
      { key: 'region', label: 'Region', kind: 'text', required: true, placeholder: 'us-east-1' },
      { key: 'access_key_id', label: 'Access key ID', kind: 'text', required: true },
      { key: 'secret_access_key', label: 'Secret access key', kind: 'secret', required: true },
      apiUrl,
    ],
  },
  { value: 'log', label: 'Log only (testing)', fields: [from] },
];

const publicUrl: ConfigField = {
  key: 'public_url',
  label: 'Public URL',
  kind: 'text',
  placeholder: 'Leave empty to serve files through Gotalk',
  hint: 'A CDN or public bucket address to serve files from.',
};

export const STORAGE_DRIVERS: readonly ConfigDriver[] = [
  { value: 'local', label: 'Local directory', fields: [{ key: 'local_path', label: 'Directory', kind: 'text', required: true, placeholder: '/data' }, publicUrl] },
  {
    value: 's3',
    label: 'S3-compatible',
    fields: [
      { key: 's3_endpoint', label: 'Endpoint', kind: 'text', placeholder: 'Leave empty for AWS S3', hint: 'For example https://<account>.r2.cloudflarestorage.com.' },
      { key: 's3_region', label: 'Region', kind: 'text', placeholder: 'us-east-1', hint: 'Use auto for Cloudflare R2.' },
      { key: 's3_bucket', label: 'Bucket', kind: 'text', required: true },
      { key: 's3_prefix', label: 'Prefix', kind: 'text', placeholder: 'Optional folder inside the bucket' },
      { key: 's3_access_key_id', label: 'Access key ID', kind: 'text' },
      { key: 's3_secret_access_key', label: 'Secret access key', kind: 'secret' },
      { key: 's3_force_path_style', label: 'Path-style addressing', kind: 'boolean', hint: 'Needed by MinIO, SeaweedFS and most self-hosted stores.' },
      publicUrl,
    ],
  },
];

export const VOICE_FIELDS: readonly ConfigField[] = [
  { key: 'livekit_url', label: 'LiveKit URL', kind: 'text', placeholder: 'wss://voice.example.com', hint: 'Where apps connect. Leave empty to turn voice off.' },
  { key: 'livekit_api_url', label: 'API URL', kind: 'text', placeholder: 'Leave empty to use the LiveKit URL', hint: 'How this server reaches LiveKit, if different (for example http://livekit:7880).' },
  { key: 'livekit_api_key', label: 'API key', kind: 'text' },
  { key: 'livekit_api_secret', label: 'API secret', kind: 'secret', hint: 'At least 32 characters.' },
];

export const CORS_FIELDS: readonly ConfigField[] = [
  { key: 'allowed_origins', label: 'Allowed origins', kind: 'list', required: true, hint: 'One per line: https://app.example.com, https://*.example.com, or * for any site.' },
  { key: 'allow_credentials', label: 'Allow credentials', kind: 'boolean', hint: "Lets browsers send cookies. Gotalk's apps don't need it, and it can't be combined with *." },
];

export const CONFIG_SECTIONS: readonly { name: ConfigSectionName; label: string }[] = [
  { name: 'mail', label: 'Email' },
  { name: 'storage', label: 'Storage' },
  { name: 'voice', label: 'Voice' },
  { name: 'cors', label: 'CORS' },
];

/** The driver list for a section with drivers, or null for voice and CORS. */
export function driversFor(section: ConfigSectionName): readonly ConfigDriver[] | null {
  return section === 'mail' ? MAIL_DRIVERS : section === 'storage' ? STORAGE_DRIVERS : null;
}

/** The fields to show for a section and driver; null when the client doesn't know the driver (a plugin). */
export function fieldsFor(section: ConfigSectionName, driver: string): readonly ConfigField[] | null {
  if (section === 'voice') return VOICE_FIELDS;
  if (section === 'cors') return CORS_FIELDS;
  return driversFor(section)!.find((d) => d.value === driver)?.fields ?? null;
}

export function driverLabel(section: ConfigSectionName, driver: string): string {
  return driversFor(section)?.find((d) => d.value === driver)?.label ?? driver;
}

/** Drivers to offer: the server's list, in the client's order, plus any the client doesn't know. */
export function offeredDrivers(section: 'mail' | 'storage', serverDrivers: readonly string[] | null | undefined): { value: string; label: string; known: boolean }[] {
  const known = driversFor(section)!;
  const available = new Set(serverDrivers ?? known.map((d) => d.value));
  if (section === 'mail') available.add('');
  const out = known.filter((d) => available.has(d.value)).map((d) => ({ value: d.value, label: d.label, known: true }));
  for (const d of serverDrivers ?? []) if (!known.some((k) => k.value === d)) out.push({ value: d, label: d, known: false });
  return out;
}

export type FormValues = Record<string, string | boolean>;

/**
 * Form state from a section the server returned. Secrets come back empty; `secrets_set` says which
 * hold a value, and the form shows that instead of the value.
 */
export function formFromSection(section: ConfigSectionName, view: ConfigSection): FormValues {
  const settings = (view.settings ?? {}) as Record<string, unknown>;
  const out: FormValues = {};
  for (const [key, value] of Object.entries(settings)) {
    if (key === 'options') continue;
    if (Array.isArray(value)) out[key] = value.join('\n');
    else if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number') out[key] = value ? String(value) : '';
    else if (typeof value === 'string') out[key] = value;
  }
  if (section === 'cors' && out.allowed_origins === undefined) out.allowed_origins = '';
  return out;
}

/** Splits a list field into its entries: one per line or comma, blanks dropped. */
export function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Builds the `PATCH /instance/config` body for one section. Only the chosen driver's fields are sent;
 * an empty secret is left out, so the server keeps the value it has.
 */
export function buildSectionSettings(section: ConfigSectionName, values: FormValues): ProviderSettings {
  const driver = typeof values.driver === 'string' ? values.driver : '';
  const fields = fieldsFor(section, driver) ?? [];
  const body: Record<string, unknown> = {};
  if (section === 'mail' || section === 'storage') body.driver = driver;
  for (const f of fields) {
    const raw = values[f.key];
    switch (f.kind) {
      case 'boolean':
        body[f.key] = raw === true;
        break;
      case 'list':
        body[f.key] = parseList(typeof raw === 'string' ? raw : '');
        break;
      case 'number': {
        const n = typeof raw === 'string' && raw.trim() ? Number(raw.trim()) : 0;
        if (Number.isFinite(n) && n > 0) body[f.key] = Math.round(n);
        break;
      }
      case 'secret':
        if (typeof raw === 'string' && raw !== '') body[f.key] = raw;
        break;
      default:
        if (typeof raw === 'string' && raw.trim() !== '') body[f.key] = raw.trim();
    }
  }
  if (section === 'voice' && body.livekit_url === undefined) body.livekit_url = '';
  return { [section]: body } as ProviderSettings;
}

/** Required fields left empty, by key. A secret the server already holds counts as filled. */
export function missingFields(section: ConfigSectionName, values: FormValues, secretsSet: readonly string[] | null | undefined): string[] {
  const driver = typeof values.driver === 'string' ? values.driver : '';
  const fields = fieldsFor(section, driver) ?? [];
  return fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = values[f.key];
      if (f.kind === 'secret' && secretsSet?.includes(f.key)) return false;
      if (f.kind === 'list') return parseList(typeof v === 'string' ? v : '').length === 0;
      return typeof v !== 'string' || v.trim() === '';
    })
    .map((f) => f.key);
}

/** The placeholder for a secret: it shows that a value is set without showing the value. */
export function secretPlaceholder(isSet: boolean): string {
  return isSet ? 'Set · leave empty to keep it' : 'Not set';
}

/** `mail.driver` → `GOTALK_MAIL_DRIVER`, the variable that makes a section read-only. */
export function configEnvVar(configKey: string): string {
  return 'GOTALK_' + configKey.toUpperCase().replace(/\./g, '_');
}

// ---- CORS ----

function originMatches(pattern: string, origin: string): boolean {
  const p = pattern.trim().toLowerCase().replace(/\/+$/, '');
  const o = origin.trim().toLowerCase().replace(/\/+$/, '');
  if (p === '*') return true;
  const star = p.indexOf('*');
  if (star < 0) return p === o;
  const prefix = p.slice(0, star);
  const suffix = p.slice(star + 1);
  return o.length >= prefix.length + suffix.length && o.startsWith(prefix) && o.endsWith(suffix);
}

/** Whether an origin may connect under an allow-list, matching the server's `*` wildcards. */
export function originAllowed(origins: readonly string[], origin: string): boolean {
  return origins.some((p) => originMatches(p, origin));
}

/**
 * Saving this list from the page at `pageOrigin` would stop the page itself from reaching the API:
 * a lock-out from the web client the administrator is using.
 */
export function corsLocksOut(origins: readonly string[], pageOrigin: string | null | undefined): boolean {
  if (!pageOrigin || pageOrigin === 'null') return false;
  return !originAllowed(origins, pageOrigin);
}

/** `*` with credentials is refused by the server; the form explains it before sending. */
export function corsCredentialsConflict(origins: readonly string[], allowCredentials: boolean): boolean {
  return allowCredentials && origins.some((o) => o.trim() === '*');
}

/** Origins worth one tap: the desktop app's, and the page in use, when the list leaves them out. */
export function suggestedOrigins(origins: readonly string[], pageOrigin: string | null | undefined): string[] {
  const out: string[] = [];
  if (pageOrigin && pageOrigin !== 'null' && !DESKTOP_ORIGINS.includes(pageOrigin)) out.push(pageOrigin);
  out.push(...DESKTOP_ORIGINS);
  return out.filter((o) => !originAllowed(origins, o));
}

// ---- Refused connections ----

const LOCAL = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)$/i;

function hostOf(origin: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/(\[[^\]]+\]|[^/:?#]+)/i.exec(origin);
  return m ? m[1]!.toLowerCase() : '';
}

/**
 * A browser reports a CORS refusal the same way as an unreachable host, and the gateway answers 403
 * to an origin it doesn't allow. So on the web, a failure reaching another site's instance may be the
 * instance refusing this page. Returns the hint to add, or null when it can't be that: native apps send
 * no origin, the page and instance share an origin, or the instance is on this machine.
 */
export function refusedConnectionHint(options: { pageOrigin: string | null | undefined; instanceOrigin: string; web: boolean }): string | null {
  const { pageOrigin, instanceOrigin, web } = options;
  if (!web || !pageOrigin || pageOrigin === 'null') return null;
  if (pageOrigin.toLowerCase() === instanceOrigin.toLowerCase()) return null;
  if (LOCAL.test(hostOf(instanceOrigin))) return null;
  return `This instance may not allow connections from ${pageOrigin}. Its administrator can allow it in the server settings.`;
}

// ---- Health checks ----

const CHECK_LABELS: Record<string, string> = {
  database: 'Database',
  redis: 'Redis',
  public_url: 'Public URL',
  storage: 'Storage',
  email: 'Email',
  voice: 'Voice',
  cors: 'CORS',
};

export function checkLabel(name: string): string {
  return CHECK_LABELS[name] ?? name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');
}

/** The first check that failed outright, which blocks saving unless forced. */
export function failingCheck(checks: readonly ConfigCheck[] | null | undefined): ConfigCheck | undefined {
  return checks?.find((c) => c.status === 'error');
}

/** "email check failed: dial tcp …" → the check name and detail, from a 422 when saving. */
export function parseCheckFailure(message: string): { name: string; detail: string } | null {
  const m = /^(\w+) check failed: (.*)$/s.exec(message.trim());
  return m ? { name: m[1]!, detail: m[2]! } : null;
}
