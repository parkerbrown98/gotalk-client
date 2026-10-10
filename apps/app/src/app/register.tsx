import { instanceCapabilities } from '@gotalk/core';
import { Badge, Button, Card, Checkbox, Notice, Stack, Text, TextField } from '@gotalk/ui';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { AuthLayout } from '@/components/auth-layout';
import { FailureNotice } from '@/components/failure-notice';
import { InlineLink } from '@/components/inline-link';
import { PasswordField } from '@/components/password-field';
import { useInstanceInfo, usePolicies } from '@/lib/api';
import { authManager, useAuthTarget, useSession } from '@/lib/auth';
import { useCountdown } from '@/lib/countdown';
import { classifyFailure, fieldFor, type FailureKind } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';
import { resetTo, useWide } from '@/lib/layout';
import { inviteHref, pendingInvite } from '@/lib/pending-invite';

const USERNAME = /^[A-Za-z0-9_.-]{3,32}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 10;

type Field = 'invite_code' | 'username' | 'email' | 'password';

export default function Register() {
  const active = useActiveInstance();
  const target = useAuthTarget();
  const session = useSession();
  const wide = useWide();
  const info = useInstanceInfo();
  const policies = usePolicies();

  const [inviteCode, setInviteCode] = useState(() => pendingInvite.get()?.code ?? '');
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
  const [created, setCreated] = useState<{ email: string; next: Parameters<typeof resetTo>[0] } | null>(null);

  if (!active || !target) return <Redirect href="/connect" />;
  if (created) {
    return (
      <AuthLayout appbarTitle="Check your email" heading="Check your email" minimalAbout>
        <Stack gap="lg">
          <Notice tone="success" icon="mail" title="Your account is ready.">
            We sent a link to {created.email} to confirm the address. Open it whenever you like; nothing here waits for it.
          </Notice>
          <Button title="Continue" onPress={() => resetTo(created.next)} />
        </Stack>
      </AuthLayout>
    );
  }
  // With an invite waiting, submitting carries on to it instead of home.
  if (session && !pendingInvite.get()) return <Redirect href="/home" />;

  const host = active.origin.replace(/^https?:\/\//, '');
  const mode = info.data?.registration_mode;
  const needsConsent = (policies.data?.length ?? 0) > 0;

  if (!mode) {
    return (
      <AuthLayout appbarTitle="Create account" heading="Create your account">
        {info.isError ? <Notice tone="danger" title={`Could not reach ${host}.`}>Check your connection and try again.</Notice> : <ActivityIndicator />}
      </AuthLayout>
    );
  }

  if (mode === 'closed') {
    return (
      <AuthLayout appbarTitle="Create account" heading="Registration is closed" note="Accounts here are created by an administrator." minimalAbout phoneBadge={<Badge label="Closed" tone="danger" />}>
        <Stack gap="lg">
          <Card compact={!wide} elevated={false}>
            {wide ? null : <Text variant="headingSm">Registration is closed</Text>}
            <Text variant="bodySm" tone="muted">
              Only people who already have an account can use {active.name}. Accounts are created by an administrator.
            </Text>
            <Text variant="bodySm" tone="muted">
              If you belong here, ask your administrator to add you, then sign in.
            </Text>
          </Card>
          <Button title="Sign in instead" onPress={() => router.replace('/sign-in')} />
          <Button title="Use a different instance" variant="tertiary" onPress={() => router.replace('/connect')} />
        </Stack>
      </AuthLayout>
    );
  }

  const inviteOnly = mode === 'invite_only';
  const errors: Partial<Record<Field, string>> = {
    ...(inviteOnly && touched.invite_code && !inviteCode.trim() ? { invite_code: 'Enter the invite code you were sent.' } : {}),
    ...(touched.username && !USERNAME.test(username) ? { username: 'Use 3 to 32 letters, numbers, dots, dashes or underscores.' } : {}),
    ...(touched.email && !EMAIL.test(email.trim()) ? { email: 'Enter a valid email address.' } : {}),
    ...(touched.password && password.length < MIN_PASSWORD ? { password: `Use at least ${MIN_PASSWORD} characters.` } : {}),
    ...serverErrors,
  };
  const rateLimited = failure?.kind === 'rate_limited' && cooldown > 0;
  const valid =
    USERNAME.test(username) &&
    EMAIL.test(email.trim()) &&
    password.length >= MIN_PASSWORD &&
    (!inviteOnly || !!inviteCode.trim()) &&
    (!needsConsent || accepted);

  const touch = (f: Field) => setTouched((t) => ({ ...t, [f]: true }));
  const edit = (f: Field, set: (v: string) => void) => (v: string) => {
    set(v);
    setServerErrors((e) => (e[f] ? { ...e, [f]: undefined } : e));
  };

  async function submit() {
    if (!target || !valid || pending || rateLimited || failure?.kind === 'version') return;
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
      // An invite-only sign-up already joined the place with its code; otherwise carry on to the invite.
      const invite = pendingInvite.get();
      pendingInvite.clear();
      const next = invite && !inviteOnly ? inviteHref(invite) : '/home';
      // Where the confirmation link went, before moving on; nothing waits for it.
      if (instanceCapabilities(info.data).emailVerification) setCreated({ email: email.trim(), next });
      else resetTo(next);
    } catch (e) {
      const f = classifyFailure(e);
      setFailure(f);
      setAttempt((n) => n + 1);
      if (f.kind === 'rejected') {
        const mapped: Partial<Record<Field, string>> = {};
        for (const [name, message] of Object.entries(f.fields)) {
          if (name === 'invite_code' || name === 'username' || name === 'email' || name === 'password') mapped[name] = message;
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
    <AuthLayout
      appbarTitle="Create account"
      heading="Create your account"
      note={inviteOnly ? 'This instance is invite only. You need a code from a member to join.' : 'Anyone can join. Your account only works on this instance; other instances need their own.'}
      minimalAbout
      phoneBadge={inviteOnly ? <Badge label="Invite only" tone="warning" /> : undefined}
    >
      <Stack gap="lg">
        {inviteOnly && !wide ? (
          <Text variant="bodySm" tone="muted">
            This instance is invite only. Enter the code a member sent you, then pick a username and password.
          </Text>
        ) : null}
        <FailureNotice failure={failure} cooldown={cooldown} host={host} hideRejected={!unmapped} />

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
              autoFocus
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
            autoFocus={!inviteOnly}
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
            hint={errors.password ? undefined : `At least ${MIN_PASSWORD} characters.`}
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
                <InlineLink style={{ textDecorationLine: 'underline' }} onPress={() => router.push({ pathname: '/policy/[kind]', params: { kind: p.kind } })}>
                  {p.title}
                </InlineLink>
              </Text>
            ))}{' '}
            of {active.name}.
          </Checkbox>
        ) : null}

        <Stack gap="md">
          <Button
            title={rateLimited ? `Try again in ${cooldown}s` : 'Create account'}
            onPress={submit}
            loading={pending}
            disabled={!valid || rateLimited || failure?.kind === 'version'}
          />
          <Text variant="bodySm" tone="muted" style={{ textAlign: 'center' }}>
            Already have an account? <InlineLink onPress={() => router.replace('/sign-in')}>Sign in</InlineLink>
          </Text>
        </Stack>
      </Stack>
    </AuthLayout>
  );
}
