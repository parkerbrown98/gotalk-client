import { unwrap } from '@gotalk/api-client';
import { Button, Notice, Stack } from '@gotalk/ui';
import { useState } from 'react';

import { FailureNotice } from '@/components/failure-notice';
import { PasswordField } from '@/components/password-field';
import { SettingsPage } from '@/components/settings-page';
import { useApiClient } from '@/lib/api';
import { useCountdown } from '@/lib/countdown';
import { classifyFailure, type FailureKind } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';
import { useWide } from '@/lib/layout';

const MIN_PASSWORD = 10;

export default function Password() {
  const wide = useWide();
  const active = useActiveInstance();
  const client = useApiClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState({ next: false, confirm: false });
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<FailureKind | null>(null);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [nextError, setNextError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const cooldown = useCountdown(failure?.kind === 'rate_limited' ? failure.retryAfter : null, attempt);

  if (!active) return null;

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== next;
  const valid = !!current && next.length >= MIN_PASSWORD && confirm === next;
  const rateLimited = failure?.kind === 'rate_limited' && cooldown > 0;

  async function submit() {
    if (!client || !valid || pending || rateLimited) return;
    setPending(true);
    setFailure(null);
    setCurrentError(null);
    setNextError(null);
    setChanged(false);
    try {
      unwrap(await client.POST('/users/@me/password', { body: { current_password: current, new_password: next } }));
      setCurrent('');
      setNext('');
      setConfirm('');
      setTouched({ next: false, confirm: false });
      setChanged(true);
    } catch (e) {
      const f = classifyFailure(e);
      setAttempt((n) => n + 1);
      if (f.kind === 'rejected' && f.status === 403) setCurrentError('That is not your current password.');
      else if (f.kind === 'rejected' && f.status < 500) setNextError(f.message);
      else setFailure(f);
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingsPage
      title="Password"
      subtitle="Changing it signs out your other devices and revokes your personal access tokens. This device stays signed in."
      width={wide ? 420 : 640}
    >
      {changed ? (
        <Notice tone="success" title="Password changed.">
          Your other devices were signed out.
        </Notice>
      ) : null}
      <FailureNotice failure={failure} cooldown={cooldown} host={active.origin} />

      <Stack gap="md">
        <PasswordField
          label="Current password"
          placeholder="Current password"
          value={current}
          onChangeText={(v) => {
            setCurrent(v);
            setCurrentError(null);
          }}
          error={currentError}
          autoComplete="current-password"
          textContentType="password"
        />
        <PasswordField
          label="New password"
          placeholder={`At least ${MIN_PASSWORD} characters`}
          value={next}
          onChangeText={(v) => {
            setNext(v);
            setNextError(null);
          }}
          onBlur={() => setTouched((t) => ({ ...t, next: true }))}
          error={nextError ?? (touched.next && tooShort ? `Use at least ${MIN_PASSWORD} characters.` : null)}
          hint={`At least ${MIN_PASSWORD} characters.`}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <PasswordField
          label="Confirm new password"
          placeholder="Repeat the new password"
          value={confirm}
          onChangeText={setConfirm}
          onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
          error={touched.confirm && mismatch ? 'The passwords do not match.' : null}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </Stack>

      <Stack direction="row" gap="sm">
        <Button
          title={rateLimited ? `Try again in ${cooldown}s` : 'Change password'}
          onPress={submit}
          loading={pending}
          disabled={!valid || rateLimited}
          style={wide ? undefined : { flex: 1 }}
        />
        {wide ? (
          <Button
            title="Discard"
            variant="tertiary"
            disabled={pending || (!current && !next && !confirm)}
            onPress={() => {
              setCurrent('');
              setNext('');
              setConfirm('');
              setCurrentError(null);
              setNextError(null);
              setFailure(null);
            }}
          />
        ) : null}
      </Stack>
    </SettingsPage>
  );
}
