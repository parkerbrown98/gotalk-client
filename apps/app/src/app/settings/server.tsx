import { ApiError } from '@gotalk/api-client';
import {
  CONFIG_SECTIONS,
  checkLabel,
  configEnvVar,
  corsCredentialsConflict,
  corsLocksOut,
  driverLabel,
  fieldsFor,
  formFromSection,
  missingFields,
  offeredDrivers,
  parseCheckFailure,
  parseList,
  secretPlaceholder,
  suggestedOrigins,
  type ConfigCheck,
  type ConfigField,
  type ConfigSection,
  type ConfigSectionName,
  type FormValues,
  type InstanceConfig,
} from '@gotalk/core';
import { Badge, Button, Card, Checkbox, Dialog, Notice, PillTabs, Stack, Text, TextField, useTheme, type BadgeTone } from '@gotalk/ui';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { InlineLink } from '@/components/inline-link';
import { SettingsPage } from '@/components/settings-page';
import { useMe } from '@/lib/api';
import { pageOrigin } from '@/lib/connectivity';
import { openExternal } from '@/lib/desktop';
import { failureMessage } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';
import { CONFIG_PROPAGATION_SECONDS, useConfigActions, useInstanceChecks, useInstanceConfig } from '@/lib/server-config';

const STATUS: Record<ConfigCheck['status'], { label: string; tone: BadgeTone }> = {
  ok: { label: 'OK', tone: 'success' },
  warning: { label: 'Warning', tone: 'warning' },
  error: { label: 'Failing', tone: 'danger' },
  skipped: { label: 'Off', tone: 'neutral' },
};

/** Storage, email, voice and CORS for instance administrators, with the live health checks above them. */
export default function ServerSettings() {
  const me = useMe();
  const admin = me.data?.is_instance_admin ?? false;
  const host = useActiveInstance()?.origin.replace(/^https?:\/\//, '') ?? 'this instance';
  const config = useInstanceConfig(admin);
  const [section, setSection] = useState<ConfigSectionName>('mail');
  // Kept here so a result survives the form reloading with the saved settings.
  const [outcomes, setOutcomes] = useState<Partial<Record<ConfigSectionName, Outcome | null>>>({});

  if (me.data && !admin) return <Redirect href="/settings" />;
  const data = config.data;
  const view = data?.[section];

  return (
    <SettingsPage title="Server" subtitle={`Health, storage, email, voice and CORS for ${host}. Only instance administrators see this page.`} width={640}>
      {admin ? <Health /> : <ActivityIndicator />}
      {config.isError ? <Notice tone="danger">{failureMessage(config.error, 'The server settings could not be loaded. Try again in a moment.')}</Notice> : null}
      {config.isPending && admin ? <ActivityIndicator /> : null}
      {data && view ? (
        <Stack gap="lg">
          <PillTabs options={CONFIG_SECTIONS.map((s) => ({ value: s.name, label: s.label }))} value={section} onChange={setSection} />
          <SectionForm
            key={`${section}|${view.source}|${view.updated_at ?? ''}`}
            section={section}
            view={view}
            drivers={data.drivers}
            email={me.data?.email ?? ''}
            outcome={outcomes[section] ?? null}
            setOutcome={(o) => setOutcomes((s) => ({ ...s, [section]: o }))}
          />
        </Stack>
      ) : null}
    </SettingsPage>
  );
}

function CheckRow({ check }: { check: ConfigCheck }) {
  const theme = useTheme();
  const s = STATUS[check.status] ?? STATUS.skipped;
  return (
    <View style={{ gap: theme.space.xxs, paddingVertical: theme.space.sm, borderTopWidth: 1, borderTopColor: theme.colors.hairline }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
        <Text variant="bodySmStrong" tone="onDark" style={{ flex: 1 }}>
          {checkLabel(check.name)}
        </Text>
        <Badge label={s.label} tone={s.tone} />
      </View>
      <Text variant="captionMd" tone="muted">
        {check.detail}
      </Text>
      {check.hint && (check.status === 'warning' || check.status === 'error') ? (
        <Text variant="captionMd" tone="default">
          {check.hint}
        </Text>
      ) : null}
    </View>
  );
}

function Health() {
  const checks = useInstanceChecks();
  return (
    <Card compact>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Stack gap="none" style={{ flex: 1 }}>
          <Text variant="headingSm">Health</Text>
          <Text variant="captionMd" tone="muted">
            Live checks against the running server.
          </Text>
        </Stack>
        <Button title="Re-run" variant="tertiary" size="sm" loading={checks.isFetching} onPress={() => void checks.refetch()} />
      </View>
      {checks.isPending ? <ActivityIndicator /> : null}
      {checks.isError ? <Notice tone="danger">{failureMessage(checks.error, 'The checks could not run. Try again.')}</Notice> : null}
      <View>
        {(checks.data ?? []).map((c) => (
          <CheckRow key={c.name} check={c} />
        ))}
      </View>
    </Card>
  );
}

function FieldInput({ field, value, isSet, editable, onChange }: { field: ConfigField; value: string | boolean | undefined; isSet: boolean; editable: boolean; onChange: (v: string | boolean) => void }) {
  const theme = useTheme();
  const text = typeof value === 'string' ? value : '';
  switch (field.kind) {
    case 'boolean':
      return (
        <Checkbox checked={value === true} onChange={onChange} disabled={!editable} description={field.hint}>
          {field.label}
        </Checkbox>
      );
    case 'select':
      return (
        <Stack gap="xs">
          <Text variant="bodySmStrong" tone="onDark">
            {field.label}
          </Text>
          {editable ? (
            <PillTabs options={field.options ?? []} value={text || field.options?.[0]?.value || ''} onChange={onChange} />
          ) : (
            <Text variant="bodySm">{field.options?.find((o) => o.value === text)?.label ?? (text || field.options?.[0]?.label)}</Text>
          )}
        </Stack>
      );
    case 'secret':
      return (
        <TextField
          label={field.label}
          value={text}
          onChangeText={onChange}
          editable={editable}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          placeholder={secretPlaceholder(isSet)}
          hint={field.hint ?? (isSet ? 'A value is set. It is never shown; type a new one to replace it.' : undefined)}
          style={editable ? undefined : { color: theme.colors.mute }}
        />
      );
    default:
      return (
        <TextField
          label={field.label}
          value={text}
          onChangeText={onChange}
          editable={editable}
          placeholder={field.placeholder}
          hint={field.hint}
          multiline={field.kind === 'list'}
          keyboardType={field.kind === 'number' ? 'number-pad' : 'default'}
          autoCapitalize="none"
          autoCorrect={false}
          style={editable ? undefined : { color: theme.colors.mute }}
        />
      );
  }
}

type Outcome = { kind: 'saved'; checks: ConfigCheck[] } | { kind: 'tested'; checks: ConfigCheck[] } | { kind: 'failed'; name: string; detail: string } | { kind: 'error'; message: string } | { kind: 'reset' };
type Confirm = 'lockout' | 'storage' | 'reset' | null;

function SectionForm({
  section,
  view,
  drivers,
  email,
  outcome,
  setOutcome,
}: {
  section: ConfigSectionName;
  view: ConfigSection;
  drivers: InstanceConfig['drivers'];
  email: string;
  outcome: Outcome | null;
  setOutcome: (outcome: Outcome | null) => void;
}) {
  const theme = useTheme();
  const origin = useActiveInstance()?.origin ?? '';
  const actions = useConfigActions();
  const initial = formFromSection(section, view);
  const [values, setValues] = useState<FormValues>(initial);
  const [busy, setBusy] = useState<'save' | 'force' | 'test' | 'reset' | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const editable = view.editable && view.source !== 'config';
  const secrets = view.secrets_set ?? [];
  const driver = typeof values.driver === 'string' ? values.driver : '';
  const fields = fieldsFor(section, driver);
  const offered = section === 'mail' || section === 'storage' ? offeredDrivers(section, section === 'mail' ? drivers.mail : drivers.storage) : null;
  const missing = missingFields(section, values, secrets);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const set = (key: string) => (v: string | boolean) => {
    setValues((s) => ({ ...s, [key]: v }));
    if (outcome) setOutcome(null);
  };

  const origins = section === 'cors' ? parseList(typeof values.allowed_origins === 'string' ? values.allowed_origins : '') : [];
  const credentialsConflict = section === 'cors' && corsCredentialsConflict(origins, values.allow_credentials === true);
  const lockout = section === 'cors' && corsLocksOut(origins, pageOrigin());
  const suggestions = section === 'cors' && editable ? suggestedOrigins(origins, pageOrigin()) : [];
  const storageMoved = section === 'storage' && (driver !== initial.driver || values.local_path !== initial.local_path || values.s3_bucket !== initial.s3_bucket || values.s3_endpoint !== initial.s3_endpoint || values.s3_prefix !== initial.s3_prefix);

  async function run(kind: 'save' | 'force' | 'test') {
    setBusy(kind);
    setOutcome(null);
    try {
      if (kind === 'test') {
        const testTo = section === 'mail' && driver ? email : undefined;
        setOutcome({ kind: 'tested', checks: await actions.test(section, values, testTo) });
      } else {
        setOutcome({ kind: 'saved', checks: await actions.save(section, values, kind === 'force') });
      }
    } catch (e) {
      const failed = e instanceof ApiError && e.status === 422 ? parseCheckFailure(e.message) : null;
      setOutcome(failed && kind === 'save' ? { kind: 'failed', ...failed } : { kind: 'error', message: failureMessage(e, 'The settings could not be saved. Try again.') });
    } finally {
      setBusy(null);
    }
  }

  function save() {
    if (lockout) return setConfirm('lockout');
    if (storageMoved) return setConfirm('storage');
    void run('save');
  }

  async function reset() {
    setConfirm(null);
    setBusy('reset');
    try {
      await actions.reset(section);
      setOutcome({ kind: 'reset' });
    } catch (e) {
      setOutcome({ kind: 'error', message: failureMessage(e, 'The settings could not be reset. Try again.') });
    } finally {
      setBusy(null);
    }
  }

  const sectionLabel = CONFIG_SECTIONS.find((s) => s.name === section)?.label ?? section;
  const updated = view.updated_at ? new Date(view.updated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <Stack gap="lg">
      {view.source === 'config' ? (
        <Notice tone="info" icon="lock" title="Managed by the server's configuration.">
          {configEnvVar(view.config_key)} is set, so {sectionLabel.toLowerCase()} is read-only here. Change it in the config file or environment and restart the server.
        </Notice>
      ) : (
        <Text variant="captionMd" tone="muted">
          {view.source === 'settings' ? `Saved here${updated ? ` on ${updated}` : ''}. ` : 'Using the built-in defaults. '}
          Saving takes effect on every server within {CONFIG_PROPAGATION_SECONDS} seconds.
        </Text>
      )}
      {view.error ? (
        <Notice tone="danger" title="These settings don't work right now.">
          {view.error}
        </Notice>
      ) : null}

      {offered ? (
        <Stack gap="xs">
          <Text variant="bodySmStrong" tone="onDark">
            {section === 'mail' ? 'Provider' : 'Where files are kept'}
          </Text>
          {editable ? (
            <PillTabs options={offered} value={driver} onChange={set('driver')} />
          ) : (
            <Text variant="bodySm">{driverLabel(section, driver) || 'Off'}</Text>
          )}
        </Stack>
      ) : null}

      {fields === null ? (
        <Notice tone="info" title="Configure this on the server's settings page.">
          {`This app doesn't know the ${driver} driver's settings. `}
          <InlineLink onPress={() => openExternal(`${origin}/setup`)}>Open the settings page</InlineLink>
        </Notice>
      ) : (
        <Stack gap="lg">
          {section === 'mail' && driver === '' ? (
            <Text variant="bodySm" tone="muted">
              {"Without email, people can't reset a forgotten password or confirm their address."}
            </Text>
          ) : null}
          {fields.map((f) => (
            <FieldInput key={f.key} field={f} value={values[f.key]} isSet={secrets.includes(f.key)} editable={editable} onChange={set(f.key)} />
          ))}
        </Stack>
      )}

      {suggestions.length > 0 ? (
        <Stack gap="xs">
          <Text variant="captionMd" tone="muted">
            Add with one tap. The desktop app connects from tauri://localhost (macOS, Linux) or http://tauri.localhost (Windows).
          </Text>
          <Stack direction="row" gap="xs" wrap>
            {suggestions.map((o) => (
              <Button key={o} title={`+ ${o}`} variant="outline" size="sm" onPress={() => set('allowed_origins')([...origins, o].join('\n'))} />
            ))}
          </Stack>
        </Stack>
      ) : null}
      {credentialsConflict ? (
        <Notice tone="danger" title="* can't be combined with credentials.">
          Browsers refuse it. List the sites that need credentials, or turn credentials off.
        </Notice>
      ) : null}
      {lockout && editable ? (
        <Notice tone="warning" title={`This list leaves out ${pageOrigin()}.`}>
          {"That's the site you're using. After saving, this page can no longer reach the instance."}
        </Notice>
      ) : null}

      {outcome?.kind === 'failed' ? (
        <Notice tone="danger" title={`The ${checkLabel(outcome.name).toLowerCase()} check failed.`}>
          {outcome.detail} Nothing was saved. Fix the settings, or save them anyway if you know the check is wrong.
        </Notice>
      ) : null}
      {outcome?.kind === 'error' ? <Notice tone="danger">{outcome.message}</Notice> : null}
      {outcome?.kind === 'reset' ? (
        <Notice tone="success" title="Reset.">
          The config file, environment and defaults apply again on every server within {CONFIG_PROPAGATION_SECONDS} seconds.
        </Notice>
      ) : null}
      {outcome?.kind === 'saved' || outcome?.kind === 'tested' ? (
        <Card compact>
          <Text variant="bodySmStrong" tone="onDark">
            {outcome.kind === 'saved' ? `Saved. Every server picks this up within ${CONFIG_PROPAGATION_SECONDS} seconds.` : 'Test results. Nothing was saved.'}
          </Text>
          <View>
            {outcome.checks.map((c, i) => (
              <CheckRow key={`${c.name}-${i}`} check={c} />
            ))}
          </View>
        </Card>
      ) : null}

      {editable ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
          {outcome?.kind === 'failed' ? (
            <Button title="Save anyway" variant="danger" loading={busy === 'force'} disabled={!!busy} onPress={() => void run('force')} />
          ) : (
            <Button title="Save" loading={busy === 'save'} disabled={!!busy || !dirty || missing.length > 0 || credentialsConflict || fields === null} onPress={save} />
          )}
          <Button
            title={section === 'mail' && driver ? 'Send test email' : 'Test'}
            variant="tertiary"
            loading={busy === 'test'}
            disabled={!!busy || missing.length > 0 || credentialsConflict || fields === null || (section === 'mail' && !driver)}
            onPress={() => void run('test')}
          />
          {dirty ? (
            <Button
              title="Discard"
              variant="secondary"
              disabled={!!busy}
              onPress={() => {
                setValues(initial);
                setOutcome(null);
              }}
            />
          ) : null}
          {view.source === 'settings' ? <Button title="Reset to defaults" variant="secondary" loading={busy === 'reset'} disabled={!!busy} onPress={() => setConfirm('reset')} /> : null}
        </View>
      ) : null}
      {section === 'mail' && driver && editable ? (
        <Text variant="captionMd" tone="muted">
          The test email goes to {email || 'your address'}.
        </Text>
      ) : null}
      {missing.length > 0 && editable ? (
        <Text variant="captionMd" tone="muted">
          Fill in {missing.map((k) => fields?.find((f) => f.key === k)?.label ?? k).join(', ')} to save.
        </Text>
      ) : null}

      <Dialog visible={confirm !== null} onClose={() => setConfirm(null)}>
        {confirm === 'lockout' ? (
          <>
            <Text variant="headingMd" accessibilityRole="header">
              Lock this page out?
            </Text>
            <Text variant="bodySm" tone="muted">
              {`${pageOrigin()} isn't in the list. Once the change applies, this page can't reach the instance. You'd need another allowed site, the desktop or phone app, or the server's configuration to undo it.`}
            </Text>
          </>
        ) : confirm === 'storage' ? (
          <>
            <Text variant="headingMd" accessibilityRole="header">
              Change where files are kept?
            </Text>
            <Text variant="bodySm" tone="muted">
              Existing avatars, icons and banners are not moved. They stop loading until you copy them over; moving between backends is done with gotalk backup and gotalk restore.
            </Text>
          </>
        ) : (
          <>
            <Text variant="headingMd" accessibilityRole="header">
              Reset {sectionLabel.toLowerCase()} to defaults?
            </Text>
            <Text variant="bodySm" tone="muted">
              The settings saved here are forgotten, and the config file, environment or built-in defaults apply again.
            </Text>
          </>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
          <Button title="Cancel" variant="tertiary" onPress={() => setConfirm(null)} />
          {confirm === 'reset' ? (
            <Button title="Reset" variant="danger" onPress={() => void reset()} />
          ) : (
            <Button
              title="Save"
              variant={confirm === 'lockout' ? 'danger' : 'primary'}
              onPress={() => {
                setConfirm(null);
                void run('save');
              }}
            />
          )}
        </View>
      </Dialog>
    </Stack>
  );
}
