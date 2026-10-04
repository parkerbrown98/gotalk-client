import { Button, Notice, Stack, Text, TextField } from '@gotalk/ui';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { AuthLayout } from '@/components/auth-layout';
import { FailureNotice } from '@/components/failure-notice';
import { InlineLink } from '@/components/inline-link';
import { PasswordField } from '@/components/password-field';
import { authManager, useAuthTarget, useRevokedNotice, useSession } from '@/lib/auth';
import { useCountdown } from '@/lib/countdown';
import { resetTo } from '@/lib/layout';
import { classifyFailure, type FailureKind } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';

export default function SignIn() {
  const active = useActiveInstance();
  const target = useAuthTarget();
  const session = useSession();
  const revoked = useRevokedNotice(active?.id);

  const [login, setLogin] = useState(revoked?.login ?? '');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<FailureKind | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cooldown = useCountdown(failure?.kind === 'rate_limited' ? failure.retryAfter : null, attempt);

  if (!active || !target) return <Redirect href="/connect" />;
  if (session) return <Redirect href="/home" />;

  const versionBlocked = failure?.kind === 'version';
  const rateLimited = failure?.kind === 'rate_limited' && cooldown > 0;
  const wrongCredentials = failure?.kind === 'rejected' && failure.status === 401;

  async function submit() {
    if (!target || !login.trim() || !password || pending || rateLimited || versionBlocked) return;
    setPending(true);
    setFailure(null);
    try {
      await authManager.signIn(target, { login: login.trim(), password });
      resetTo('/home');
    } catch (e) {
      setFailure(classifyFailure(e));
      setAttempt((n) => n + 1);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout appbarTitle="Sign in" heading={`Sign in to ${active.name}`}>
      <Stack gap="lg">
        {revoked && !failure ? (
          <Notice tone="warning" icon="info" title="You were signed out.">
            Another device ended this session. Sign in again to keep going.
          </Notice>
        ) : null}
        {wrongCredentials ? (
          <Notice tone="danger" title="That username or password is not right.">
            Check both and try again.
          </Notice>
        ) : null}
        <FailureNotice
          failure={failure}
          cooldown={cooldown}
          rateLimitTitle="Too many sign-in attempts."
          host={active.origin.replace(/^https?:\/\//, '')}
          hideRejected={wrongCredentials}
        />

        <Stack gap="md">
          <TextField
            label="Username or email"
            value={login}
            onChangeText={setLogin}
            invalid={wrongCredentials}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            autoFocus={!revoked}
          />
          <PasswordField
            label="Password"
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            invalid={wrongCredentials}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            autoFocus={!!revoked}
          />
        </Stack>

        <Stack gap="md">
          <Button
            title={rateLimited ? `Try again in ${cooldown}s` : 'Sign in'}
            onPress={submit}
            loading={pending}
            disabled={!login.trim() || !password || rateLimited || versionBlocked}
          />
          {versionBlocked ? (
            Platform.OS === 'web' ? (
              <Button title="Reload the app" variant="tertiary" onPress={() => globalThis.location?.reload()} />
            ) : (
              <Button title="Use a different instance" variant="tertiary" onPress={() => router.replace('/connect')} />
            )
          ) : null}
          <Text variant="bodySm" tone="muted" style={{ textAlign: 'center' }}>
            New here? <InlineLink onPress={() => router.push('/register')}>Create an account</InlineLink>
          </Text>
        </Stack>
      </Stack>
    </AuthLayout>
  );
}
