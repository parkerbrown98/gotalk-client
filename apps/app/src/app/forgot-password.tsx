import { unwrap } from '@gotalk/api-client';
import { classifyEmailFailure, instanceCapabilities, instanceDisplayName, passwordResetSentCopy, RESEND_WAIT_SECONDS, serverParam } from '@gotalk/core';
import { Button, Notice, Stack, Text, TextField } from '@gotalk/ui';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';

import { ServerCard, WelcomeFrame } from '@/components/welcome';
import { useCountdown } from '@/lib/countdown';
import { useActiveInstance } from '@/lib/instances';
import { goBack, useWide } from '@/lib/layout';
import { publicClient, useServer, welcomeHref } from '@/lib/welcome';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Requests a reset link for the server chosen on the welcome screen (`?server=`), or the active one. The
 * server answers the same whether or not an account uses the address, so the screen never says "no account
 * found". The link opens the server's own page, not the app.
 */
export default function ForgotPassword() {
  const wide = useWide();
  const { server: serverArg } = useLocalSearchParams<{ server?: string }>();
  const active = useActiveInstance();
  const param = serverArg ?? (active ? serverParam(active.origin) : undefined);
  const query = useServer(param);
  const server = query.data;
  const caps = instanceCapabilities(server?.instance);

  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<{ title?: string; text: string } | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [wait, setWait] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cooldown = useCountdown(wait, attempt);

  if (!param) return <Redirect href="/welcome" />;

  const name = server ? instanceDisplayName(server.origin, server.instance.name) : param;
  const valid = EMAIL.test(email.trim());
  const back = () => goBack(server ? welcomeHref(server.origin) : '/welcome');

  async function send() {
    if (!server || !valid || pending || cooldown > 0) return;
    setPending(true);
    setError(null);
    setFieldError(null);
    try {
      unwrap(await publicClient(server).POST('/auth/password-reset', { body: { email: email.trim() } }));
      setSentTo(email.trim());
      setWait(RESEND_WAIT_SECONDS);
      setAttempt((n) => n + 1);
    } catch (e) {
      const f = classifyEmailFailure(e);
      switch (f.kind) {
        case 'rate_limited':
          setWait(f.retryAfter);
          setAttempt((n) => n + 1);
          setError({ title: 'Too many requests.', text: `You can try again in ${f.retryAfter} seconds.` });
          break;
        case 'email_unavailable':
          setError({ title: "This server can't send email right now.", text: `Ask the administrator of ${name} to reset your password, or try again later.` });
          break;
        case 'invalid':
          setFieldError(f.message);
          break;
        case 'network':
          setError({ title: `Could not reach ${server.origin.replace(/^https?:\/\//, '')}.`, text: 'Check your connection and try again.' });
          break;
        default:
          setError({ text: f.kind === 'other' ? f.message : 'Something went wrong. Try again.' });
      }
    } finally {
      setPending(false);
    }
  }

  const frame = (heading: string, children: ReactNode) => (
    <WelcomeFrame title="Reset password" onBack={back}>
      <Stack gap="lg">
        {server ? <ServerCard origin={server.origin} name={server.instance.name} iconUrl={server.instance.icon_url} /> : null}
        {wide ? (
          <Text variant="headingXl" accessibilityRole="header">
            {heading}
          </Text>
        ) : null}
        {children}
      </Stack>
    </WelcomeFrame>
  );

  if (query.isPending) return frame('Reset your password', <ActivityIndicator style={{ alignSelf: 'flex-start' }} />);

  if (!server) {
    return frame(
      'Reset your password',
      <Stack gap="lg">
        <Notice tone="danger" title={`Could not reach ${param}.`}>
          Check your connection and try again.
        </Notice>
        <Button title="Back to sign in" onPress={back} />
      </Stack>,
    );
  }

  if (!caps.passwordReset) {
    return frame(
      'Reset your password',
      <Stack gap="lg">
        <Notice tone="info" icon="mail" title="This server can't send email.">
          Ask the administrator of {name} to reset your password.
        </Notice>
        <Button title="Back to sign in" onPress={back} />
      </Stack>,
    );
  }

  return frame(
    sentTo ? 'Check your email' : 'Reset your password',
    <Stack gap="lg">
        {sentTo ? (
          <Notice tone="success" icon="mail" title="Link sent.">
            {passwordResetSentCopy(sentTo)}
          </Notice>
        ) : (
          <Text variant="bodySm" tone="muted">
            {`Enter the email address of your account on ${name}. We'll send a link to choose a new password.`}
          </Text>
        )}
        {error ? (
          <Notice tone="danger" title={error.title}>
            {error.text}
          </Notice>
        ) : null}
        {sentTo ? null : (
          <TextField
            label="Email"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setFieldError(null);
            }}
            onBlur={() => setTouched(true)}
            error={fieldError ?? (touched && email.trim() && !valid ? 'Enter a valid email address.' : null)}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            inputMode="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={send}
            autoFocus
          />
        )}
        <Stack gap="md">
          {sentTo ? (
            <>
              <Button title={cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend link'} variant="tertiary" onPress={send} loading={pending} disabled={cooldown > 0} />
              <Button title="Back to sign in" onPress={back} />
              <Text variant="captionMd" tone="muted" style={{ textAlign: 'center' }}>
                Resetting signs you out on every device. Nothing arrived? Check your spam folder, or{' '}
                <Text variant="captionMd" tone="onDark" accessibilityRole="link" onPress={() => setSentTo(null)}>
                  use a different address
                </Text>
                .
              </Text>
            </>
          ) : (
            <>
              <Button title={cooldown > 0 ? `Try again in ${cooldown}s` : 'Send reset link'} onPress={send} loading={pending} disabled={!valid || cooldown > 0} />
              <Button title="Back to sign in" variant="tertiary" onPress={back} />
            </>
          )}
        </Stack>
    </Stack>,
  );
}
