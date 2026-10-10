import { Button, Notice, Stack, Text, TextField } from '@gotalk/ui';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { AuthLayout } from '@/components/auth-layout';
import { FailureNotice } from '@/components/failure-notice';
import { InlineLink } from '@/components/inline-link';
import { PasswordField } from '@/components/password-field';
import { useInstanceInfo } from '@/lib/api';
import { authManager, useAuthTarget, useRevokedNotice, useSession } from '@/lib/auth';
import { useCountdown } from '@/lib/countdown';
import { isDesktop } from '@/lib/desktop';
import { resetTo } from '@/lib/layout';
import { inviteHref, pendingInvite } from '@/lib/pending-invite';
import { classifyFailure, type FailureKind } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';
import { useInstanceCapabilities } from '@/lib/uploads';

export default function SignIn() {
  const active = useActiveInstance();
  const target = useAuthTarget();
  const session = useSession();
  const revoked = useRevokedNotice(active?.id);
  const info = useInstanceInfo();
  const caps = useInstanceCapabilities();

  const [login, setLogin] = useState(revoked?.login ?? '');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<FailureKind | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cooldown = useCountdown(failure?.kind === 'rate_limited' ? failure.retryAfter : null, attempt);

  if (!active || !target) return <Redirect href="/connect" />;
  // With an invite waiting, submitting carries on to it instead of home.
  if (session && !pendingInvite.get()) return <Redirect href="/home" />;

  const versionBlocked = failure?.kind === 'version';
  const rateLimited = failure?.kind === 'rate_limited' && cooldown > 0;
  const wrongCredentials = failure?.kind === 'rejected' && failure.status === 401;

  async function submit() {
    if (!target || !login.trim() || !password || pending || rateLimited || versionBlocked) return;
    setPending(true);
    setFailure(null);
    try {
      await authManager.signIn(target, { login: login.trim(), password });
      const invite = pendingInvite.get();
      pendingInvite.clear();
      resetTo(invite ? inviteHref(invite) : '/home');
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
            This session was ended, from another device or by a password reset. Sign in again to keep going.
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
          {caps.passwordReset ? (
            <Text variant="bodySm" style={{ alignSelf: 'flex-end' }}>
              <InlineLink onPress={() => router.push('/forgot-password')}>Forgot your password?</InlineLink>
            </Text>
          ) : info.data ? (
            <Text variant="captionMd" tone="muted">
              {`Forgot your password? ${active.name} can't send email, so ask its administrator to reset it.`}
            </Text>
          ) : null}
        </Stack>

        <Stack gap="md">
          <Button
            title={rateLimited ? `Try again in ${cooldown}s` : 'Sign in'}
            onPress={submit}
            loading={pending}
            disabled={!login.trim() || !password || rateLimited || versionBlocked}
          />
          {versionBlocked ? (
            // Only a hosted web build picks up a newer client by reloading; the desktop app ships its own.
            Platform.OS === 'web' && !isDesktop ? (
              <Button title="Reload the app" variant="tertiary" onPress={() => globalThis.location?.reload()} />
            ) : (
              <Button title="Use a different instance" variant="tertiary" onPress={() => router.replace('/connect')} />
            )
          ) : null}
          <Text variant="bodySm" tone="muted" style={{ textAlign: 'center' }}>
            New here? <InlineLink onPress={() => router.push('/register')}>Create an account</InlineLink>
          </Text>
          <Text variant="bodySm" tone="muted" style={{ textAlign: 'center' }}>
            Just looking? <InlineLink onPress={() => router.push('/explore')}>Browse public topics</InlineLink>
          </Text>
        </Stack>
      </Stack>
    </AuthLayout>
  );
}
