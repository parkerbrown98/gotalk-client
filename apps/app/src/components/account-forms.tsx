import type { DiscoveredInstance } from '@gotalk/core';
import { instanceCapabilities, instanceDisplayName } from '@gotalk/core';
import { Button, Card, Checkbox, Notice, Stack, Text, TextField } from '@gotalk/ui';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { FailureNotice } from '@/components/failure-notice';
import { InlineLink } from '@/components/inline-link';
import { PasswordField } from '@/components/password-field';
import { authManager, useRevokedNotice } from '@/lib/auth';
import { useCountdown } from '@/lib/countdown';
import { isDesktop } from '@/lib/desktop';
import { classifyFailure, fieldFor, type FailureKind } from '@/lib/failure';
import { resetTo } from '@/lib/layout';
import { inviteHref, pendingInvite } from '@/lib/pending-invite';
import { adoptServer, useSignUpPolicies } from '@/lib/welcome';

const USERNAME = /^[A-Za-z0-9_.-]{3,32}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 10;

const hostOf = (origin: string) => origin.replace(/^https?:\/\//, '');

/** Where to go once signed in: an invite opened for this server, otherwise home. */
function nextAfterAuth(server: DiscoveredInstance): Href {
  const invite = pendingInvite.get();
  pendingInvite.clear();
  return invite && invite.origin.replace(/\/+$/, '') === server.origin ? inviteHref(invite) : '/home';
}

export interface AccountFormProps {
  server: DiscoveredInstance;
  /** Called as soon as an account is signed in, before navigating, so the screen doesn't flash its signed-in state. */
  onAuthenticated: () => void;
}

/** Sign in to the chosen server. The server is saved to this device only once that succeeds. */
export function SignInForm({ server, onAuthenticated, onForgot }: AccountFormProps & { onForgot: () => void }) {
  const target = { id: server.id, apiBaseUrl: server.apiBaseUrl };
  const revoked = useRevokedNotice(server.id);
  const caps = instanceCapabilities(server.instance);
  const name = instanceDisplayName(server.origin, server.instance.name);

  const [login, setLogin] = useState(revoked?.login ?? '');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<FailureKind | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cooldown = useCountdown(failure?.kind === 'rate_limited' ? failure.retryAfter : null, attempt);

  const versionBlocked = failure?.kind === 'version';
  const rateLimited = failure?.kind === 'rate_limited' && cooldown > 0;
  const wrongCredentials = failure?.kind === 'rejected' && failure.status === 401;

  async function submit() {
    if (!login.trim() || !password || pending || rateLimited || versionBlocked) return;
    setPending(true);
    setFailure(null);
    try {
      await authManager.signIn(target, { login: login.trim(), password });
      onAuthenticated();
      adoptServer(server);
      resetTo(nextAfterAuth(server));
    } catch (e) {
      setFailure(classifyFailure(e));
      setAttempt((n) => n + 1);
      setPending(false);
    }
  }

  return (
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
        host={hostOf(server.origin)}
        origin={server.origin}
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
          autoFocus={!revoked && Platform.OS === 'web'}
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
            <InlineLink onPress={onForgot}>Forgot your password?</InlineLink>
          </Text>
        ) : (
          <Text variant="captionMd" tone="muted">
            {`Forgot your password? ${name} can't send email, so ask its administrator to reset it.`}
          </Text>
        )}
      </Stack>
      <Button
        title={rateLimited ? `Try again in ${cooldown}s` : 'Sign in'}
        onPress={submit}
        loading={pending}
        disabled={!login.trim() || !password || rateLimited || versionBlocked}
      />
      {versionBlocked && Platform.OS === 'web' && !isDesktop ? (
        // Only a hosted web build picks up a newer client by reloading; the desktop app ships its own.
        <Button title="Reload the app" variant="tertiary" onPress={() => globalThis.location?.reload()} />
      ) : null}
    </Stack>
  );
}

type Field = 'invite_code' | 'username' | 'email' | 'password';

/** Create an account on the chosen server: open, invite-only (with a code) or closed (a way out instead of a form). */
export function CreateAccountForm({ server, onAuthenticated, onSignIn, policyHref }: AccountFormProps & { onSignIn: () => void; policyHref: (kind: string) => Href }) {
  const target = { id: server.id, apiBaseUrl: server.apiBaseUrl };
  const policies = useSignUpPolicies(server);
  const name = instanceDisplayName(server.origin, server.instance.name);
  const mode = server.instance.registration_mode;
  const inviteOnly = mode === 'invite_only';
  const needsConsent = (policies.data?.length ?? 0) > 0;

  const [inviteCode, setInviteCode] = useState(() => {
    const invite = pendingInvite.get();
    return invite && invite.origin.replace(/\/+$/, '') === server.origin ? invite.code : '';
  });
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<FailureKind | null>(null);
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});
  const [attempt, setAttempt] = useState(0);
  const cooldown = useCountdown(failure?.kind === 'rate_limited' ? failure.retryAfter : null, attempt);
  const [created, setCreated] = useState<{ email: string; next: Href } | null>(null);

  if (created) {
    return (
      <Stack gap="lg">
        <Notice tone="success" icon="mail" title="Your account is ready.">
          We sent a link to {created.email} to confirm the address. Open it whenever you like; nothing here waits for it.
        </Notice>
        <Button title="Continue" onPress={() => resetTo(created.next)} />
      </Stack>
    );
  }

  if (mode === 'closed') {
    return (
      <Stack gap="lg">
        <Card compact>
          <Text variant="bodySm" tone="muted">
            {`Only people who already have an account can use ${name}. Accounts are created by an administrator; if you belong here, ask them to add you.`}
          </Text>
        </Card>
        <Button title="Sign in instead" onPress={onSignIn} />
      </Stack>
    );
  }

  const errors: Partial<Record<Field, string>> = {
    ...(inviteOnly && touched.invite_code && !inviteCode.trim() ? { invite_code: 'Enter the invite code you were sent.' } : {}),
    ...(touched.username && !USERNAME.test(username) ? { username: 'Use 3 to 32 letters, numbers, dots, dashes or underscores.' } : {}),
    ...(touched.email && !EMAIL.test(email.trim()) ? { email: 'Enter a valid email address.' } : {}),
    ...(touched.password && password.length < MIN_PASSWORD ? { password: `Use at least ${MIN_PASSWORD} characters.` } : {}),
    ...serverErrors,
  };
  const rateLimited = failure?.kind === 'rate_limited' && cooldown > 0;
  const valid =
    USERNAME.test(username) && EMAIL.test(email.trim()) && password.length >= MIN_PASSWORD && (!inviteOnly || !!inviteCode.trim()) && (!needsConsent || accepted);

  const touch = (f: Field) => setTouched((t) => ({ ...t, [f]: true }));
  const edit = (f: Field, set: (v: string) => void) => (v: string) => {
    set(v);
    setServerErrors((e) => (e[f] ? { ...e, [f]: undefined } : e));
  };

  async function submit() {
    if (!valid || pending || rateLimited || failure?.kind === 'version') return;
    setPending(true);
    setFailure(null);
    setServerErrors({});
    try {
      await authManager.register(target, {
        username,
        email: email.trim(),
        password,
        ...(inviteOnly ? { invite_code: inviteCode.trim() } : {}),
        accept_policies: needsConsent && accepted,
      });
      onAuthenticated();
      adoptServer(server);
      // An invite-only sign-up already joined the place with its code; otherwise carry on to the invite.
      let next: Href;
      if (inviteOnly) {
        pendingInvite.clear();
        next = '/home';
      } else {
        next = nextAfterAuth(server);
      }
      // Where the confirmation link went, before moving on; nothing waits for it.
      if (instanceCapabilities(server.instance).emailVerification) setCreated({ email: email.trim(), next });
      else resetTo(next);
    } catch (e) {
      const f = classifyFailure(e);
      setFailure(f);
      setAttempt((n) => n + 1);
      if (f.kind === 'rejected') {
        const mapped: Partial<Record<Field, string>> = {};
        for (const [field, message] of Object.entries(f.fields)) {
          if (field === 'invite_code' || field === 'username' || field === 'email' || field === 'password') mapped[field] = message;
        }
        const guessed = fieldFor(f.message);
        if (Object.keys(mapped).length === 0 && guessed) mapped[guessed] = f.message;
        setServerErrors(mapped);
      }
    } finally {
      setPending(false);
    }
  }

  const unmapped = failure?.kind === 'rejected' && Object.keys(serverErrors).length === 0;

  return (
    <Stack gap="lg">
      {inviteOnly ? (
        <Text variant="bodySm" tone="muted">
          {`${name} is invite only. Enter the code a member sent you, then pick a username and password.`}
        </Text>
      ) : null}
      <FailureNotice failure={failure} cooldown={cooldown} host={hostOf(server.origin)} origin={server.origin} hideRejected={!unmapped} />
      <Stack gap="md">
        {inviteOnly ? (
          <TextField
            label="Invite code"
            placeholder="Invite code"
            value={inviteCode}
            onChangeText={edit('invite_code', setInviteCode)}
            onBlur={() => touch('invite_code')}
            error={errors.invite_code}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        ) : null}
        <TextField
          label="Username"
          placeholder="Choose a username"
          value={username}
          onChangeText={edit('username', setUsername)}
          onBlur={() => touch('username')}
          error={errors.username}
          hint="Letters, numbers, dots and dashes. Others see this on your posts."
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          textContentType="username"
        />
        <TextField
          label="Email"
          placeholder="you@example.org"
          value={email}
          onChangeText={edit('email', setEmail)}
          onBlur={() => touch('email')}
          error={errors.email}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          inputMode="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <PasswordField
          label="Password"
          placeholder={`At least ${MIN_PASSWORD} characters`}
          value={password}
          onChangeText={edit('password', setPassword)}
          onBlur={() => touch('password')}
          error={errors.password}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </Stack>
      {needsConsent ? (
        <Checkbox checked={accepted} onChange={setAccepted}>
          I accept the{' '}
          {policies.data!.map((p, i) => (
            <Text key={p.kind}>
              {i > 0 ? (i === policies.data!.length - 1 ? ' and the ' : ', the ') : ''}
              <InlineLink style={{ textDecorationLine: 'underline' }} onPress={() => router.push(policyHref(p.kind))}>
                {p.title}
              </InlineLink>
            </Text>
          ))}{' '}
          of {name}.
        </Checkbox>
      ) : null}
      <Button title={rateLimited ? `Try again in ${cooldown}s` : 'Create account'} onPress={submit} loading={pending} disabled={!valid || rateLimited || failure?.kind === 'version'} />
      <Text variant="captionMd" tone="muted">
        {`Your account works on ${name} only; other servers need their own.`}
        {instanceCapabilities(server.instance).emailVerification ? " We'll send a link to confirm your email." : ''}
      </Text>
    </Stack>
  );
}
