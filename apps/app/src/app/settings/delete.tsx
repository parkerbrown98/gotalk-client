import { unwrap } from '@gotalk/api-client';
import { Button, Dialog, Notice, Text, useTheme } from '@gotalk/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FailureNotice } from '@/components/failure-notice';
import { PasswordField } from '@/components/password-field';
import { SettingsPage } from '@/components/settings-page';
import { useApiClient } from '@/lib/api';
import { authManager } from '@/lib/auth';
import { classifyFailure, type FailureKind } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';
import { goBack, resetTo, useWide } from '@/lib/layout';

/** The page behind the dialog stays visible but dim, as in the mockup. */
export default function DeleteAccount() {
  const theme = useTheme();
  const wide = useWide();
  const active = useActiveInstance();
  const client = useApiClient();
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [failure, setFailure] = useState<FailureKind | null>(null);

  if (!active) return null;
  const close = () => (wide ? router.replace('/settings/profile') : goBack('/settings'));

  async function submit() {
    if (!client || !password || pending) return;
    setPending(true);
    setPasswordError(null);
    setFailure(null);
    try {
      unwrap(await client.DELETE('/users/@me', { body: { password } }));
      // Leave first: clearing the session would otherwise bounce this screen to sign-in.
      resetTo('/connect');
      await authManager.endSession(active!.id);
    } catch (e) {
      const f = classifyFailure(e);
      if (f.kind === 'rejected' && f.status === 403) setPasswordError('That password is not right.');
      else setFailure(f);
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={{ flex: 1, opacity: wide ? 0.4 : 1 }}>
      <SettingsPage title="Delete account">
        <Text variant="bodySm" tone="muted">
          Permanently delete your account on {active.name}.
        </Text>
      </SettingsPage>
      <Dialog visible onClose={close}>
        <Text variant="headingMd" accessibilityRole="header">
          {wide ? `Delete your account on ${active.name}?` : 'Delete your account?'}
        </Text>
        <Text variant="bodySm" tone="muted">
          {wide
            ? 'This removes your profile and signs out every device. It cannot be undone. Your account on other instances is not affected.'
            : `This removes your profile on ${active.name} and signs out every device. It cannot be undone.`}
        </Text>
        {failure?.kind === 'rejected' ? <Notice tone="danger">{failure.message}</Notice> : <FailureNotice failure={failure} host={active.origin} />}
        <PasswordField
          label="Password"
          placeholder="Your password"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setPasswordError(null);
          }}
          error={passwordError}
          hint="Enter your password to confirm."
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          autoFocus
        />
        <View style={{ flexDirection: wide ? 'row' : 'column', justifyContent: 'flex-end', gap: theme.space.sm }}>
          {wide ? <Button title="Keep my account" variant="tertiary" onPress={close} /> : null}
          <Button title="Delete account" variant="danger" onPress={submit} loading={pending} disabled={!password} />
          {wide ? null : <Button title="Keep my account" variant="tertiary" onPress={close} />}
        </View>
      </Dialog>
    </View>
  );
}
