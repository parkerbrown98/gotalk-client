import { instanceCapabilities, instanceDisplayName, isOfficialInstance, OFFICIAL_INSTANCE, serverParam, sortServers, type SavedInstance } from '@gotalk/core';
import { Button, Notice, PillTabs, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { CreateAccountForm, SignInForm } from '@/components/account-forms';
import { InlineLink } from '@/components/inline-link';
import { OfficialFeature, ServerCard, ServerIcon, WelcomeFrame } from '@/components/welcome';
import { useAuth } from '@/lib/auth';
import { openExternal } from '@/lib/desktop';
import { instancesStore, useInstances } from '@/lib/instances';
import { goBack, resetTo, useWide } from '@/lib/layout';
import { inviteHref, pendingInvite } from '@/lib/pending-invite';
import { adoptServer, describeLookupError, lookUpServer, prefetchServer, useServer, welcomeHref, type AccountTab } from '@/lib/welcome';

/**
 * Choosing a server and signing in, on one screen. Without `server` it offers Gotalk Official, the servers
 * saved on this device and an address field; with it, the account step for that server. Nothing is saved to
 * the device until someone signs in, creates an account or chooses to browse.
 */
export default function Welcome() {
  const { server, tab } = useLocalSearchParams<{ server?: string; tab?: string }>();
  if (server) return <AccountStep key={server} param={server} tab={tab === 'create' ? 'create' : 'sign-in'} />;
  return <ChooseServer />;
}

// ---- Step one ----

function AddServerField({ label }: { label: string }) {
  const theme = useTheme();
  const qc = useQueryClient();
  const [address, setAddress] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookUp() {
    if (!address.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      const found = await lookUpServer(qc, address);
      router.push(welcomeHref(found.origin));
    } catch (e) {
      setError(describeLookupError(e, address));
    } finally {
      setPending(false);
    }
  }

  return (
    <Stack gap="xs">
      <Text variant="bodySmStrong" tone="onDark" nativeID="add-server-label">
        {label}
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
        <View style={{ flex: 1 }}>
          <TextField
            accessibilityLabel={label}
            placeholder="forum.example.com"
            value={address}
            onChangeText={(t) => {
              setAddress(t);
              setError(null);
            }}
            invalid={!!error}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="url"
            inputMode="url"
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={lookUp}
          />
        </View>
        <Button title="Look up" variant="tertiary" onPress={lookUp} loading={pending} disabled={!address.trim()} />
      </View>
      {error ? (
        <Text variant="captionMd" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </Stack>
  );
}

function ServerRow({ instance, username, primary }: { instance: SavedInstance; username?: string; primary: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md }}>
      <ServerIcon origin={instance.origin} name={instance.name} iconUrl={instance.iconUrl} size={36} />
      <Stack gap="none" style={{ flex: 1 }}>
        <Text variant="bodySmStrong" tone="onDark" numberOfLines={1}>
          {instanceDisplayName(instance.origin, instance.name)}
        </Text>
        <Text variant="captionMd" tone="muted" numberOfLines={2}>
          {`${instance.origin.replace(/^https?:\/\//, '')}, ${username ? `signed in as ${username}` : 'signed out'}`}
        </Text>
      </Stack>
      {username ? (
        <Button
          title="Open"
          size="sm"
          variant={primary ? 'primary' : 'tertiary'}
          accessibilityLabel={`Open ${instanceDisplayName(instance.origin, instance.name)}`}
          onPress={() => {
            instancesStore.getState().setActive(instance.id);
            resetTo('/home');
          }}
        />
      ) : (
        <Button title="Sign in" size="sm" variant="outline" accessibilityLabel={`Sign in to ${instanceDisplayName(instance.origin, instance.name)}`} onPress={() => router.push(welcomeHref(instance.origin))} />
      )}
    </View>
  );
}

function ChooseServer() {
  const theme = useTheme();
  const qc = useQueryClient();
  const saved = sortServers(useInstances((s) => s.instances));
  const sessions = useAuth((s) => s.sessions);
  const hasOfficial = saved.some((i) => isOfficialInstance(i.origin));
  const firstSignedIn = saved.find((i) => sessions[i.id])?.id;

  // Gotalk Official is the likely next step, so its account step opens without a wait.
  useEffect(() => prefetchServer(qc, OFFICIAL_INSTANCE.host), [qc]);

  const continueOfficial = () => router.push(welcomeHref(OFFICIAL_INSTANCE.origin));

  if (saved.length === 0) {
    return (
      <WelcomeFrame>
        <Stack gap="xl">
          <Stack gap="sm">
            <Text variant="headingXl" accessibilityRole="header">
              Welcome to Gotalk
            </Text>
            <Text variant="bodySm" tone="muted">
              Communities on Gotalk live on independent servers. Start on ours, or enter the address of another one.
            </Text>
          </Stack>
          <OfficialFeature action={<Button title={`Continue with ${OFFICIAL_INSTANCE.name}`} onPress={continueOfficial} />} />
          <AddServerField label="Another server" />
        </Stack>
      </WelcomeFrame>
    );
  }

  return (
    <WelcomeFrame>
      <Stack gap="xl">
        <Stack gap="sm">
          <Text variant="headingXl" accessibilityRole="header">
            Welcome back
          </Text>
          <Text variant="bodySm" tone="muted">
            Pick a server to continue.
          </Text>
        </Stack>
        <View style={{ borderWidth: 1, borderColor: theme.colors.hairline, borderRadius: theme.radii.lg, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
          {saved.map((i, n) => (
            <View key={i.id} style={n > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.hairline } : undefined}>
              <ServerRow instance={i} username={sessions[i.id]?.username} primary={i.id === firstSignedIn} />
            </View>
          ))}
          {hasOfficial ? null : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, borderTopWidth: 1, borderTopColor: theme.colors.hairline }}>
              <ServerIcon origin={OFFICIAL_INSTANCE.origin} name={OFFICIAL_INSTANCE.name} size={36} />
              <Stack gap="none" style={{ flex: 1 }}>
                <Text variant="bodySmStrong" tone="onDark">
                  {OFFICIAL_INSTANCE.name}
                </Text>
                <Text variant="captionMd" tone="muted" numberOfLines={2}>
                  {OFFICIAL_INSTANCE.host}, open to everyone
                </Text>
              </Stack>
              <Button title="Join" size="sm" variant="outline" accessibilityLabel={`Join ${OFFICIAL_INSTANCE.name}`} onPress={continueOfficial} />
            </View>
          )}
        </View>
        <AddServerField label="Add a server" />
      </Stack>
    </WelcomeFrame>
  );
}

// ---- Step two ----

function AccountStep({ param, tab }: { param: string; tab: AccountTab }) {
  const wide = useWide();
  const query = useServer(param);
  const server = query.data;
  const saved = useInstances((s) => s.instances.find((i) => serverParam(i.origin) === param.toLowerCase()));
  const session = useAuth((s) => (server ? s.sessions[server.id] : undefined));
  // Set once an account signs in here, so the screen doesn't flash "already signed in" before it navigates.
  const [finishing, setFinishing] = useState(false);

  const official = isOfficialInstance(server?.origin ?? `https://${param}`) || param.toLowerCase() === OFFICIAL_INSTANCE.host;
  const origin = server?.origin ?? saved?.origin ?? (official ? OFFICIAL_INSTANCE.origin : param.includes('://') ? param : `https://${param}`);
  const name = instanceDisplayName(origin, server?.instance.name ?? saved?.name ?? param);
  const change = () => goBack('/welcome');

  const card = (
    <ServerCard
      origin={origin}
      name={server?.instance.name ?? saved?.name ?? param}
      iconUrl={server?.instance.icon_url ?? saved?.iconUrl}
      instance={server?.instance}
      secure={server ? server.secure : true}
      onChange={wide ? change : undefined}
    />
  );

  let body;
  if (query.isPending) {
    body = <ActivityIndicator style={{ alignSelf: 'flex-start' }} />;
  } else if (query.isError || !server) {
    body = (
      <Stack gap="md">
        <Notice tone="danger" title={`Could not reach ${origin.replace(/^https?:\/\//, '')}.`}>
          {describeLookupError(query.error, param)}
        </Notice>
        <Button title="Try again" variant="tertiary" onPress={() => void query.refetch()} />
        <Button title="Choose another server" variant="secondary" onPress={() => resetTo('/welcome')} />
      </Stack>
    );
  } else if (!server.compatibility.ok) {
    body = (
      <Stack gap="md">
        <Notice tone="danger" title="This server isn't compatible with this app.">
          {server.compatibility.reason} Ask its administrator to update, or choose another server.
        </Notice>
        <Button title="Choose another server" variant="tertiary" onPress={() => resetTo('/welcome')} />
      </Stack>
    );
  } else if (instanceCapabilities(server.instance).awaitingSetup) {
    body = (
      <Stack gap="md">
        <Notice tone="warning" title="Setup isn't finished.">
          If this server is yours, open the setup page and use the setup token from its log. Everyone else can join once setup is done.
        </Notice>
        <Button title="Open setup page" variant="tertiary" onPress={() => openExternal(`${server.origin}/setup`)} />
        <Button title="Choose another server" variant="secondary" onPress={() => resetTo('/welcome')} />
      </Stack>
    );
  } else if (session && !finishing) {
    const invite = pendingInvite.get();
    body = (
      <Stack gap="md">
        <Text variant="bodySm" tone="muted">{`You're signed in to ${name} as ${session.username}.`}</Text>
        <Button
          title={`Open ${name}`}
          onPress={() => {
            adoptServer(server);
            pendingInvite.clear();
            resetTo(invite && invite.origin.replace(/\/+$/, '') === server.origin ? inviteHref(invite) : '/home');
          }}
        />
      </Stack>
    );
  } else {
    const setTab = (next: AccountTab) => router.setParams({ tab: next === 'create' ? 'create' : undefined });
    body = (
      <Stack gap="lg">
        {!server.secure ? (
          <Notice tone="warning">Traffic to this server can be read on the network. Only continue if it is your own.</Notice>
        ) : null}
        <PillTabs
          options={[
            { value: 'sign-in', label: 'Sign in' },
            { value: 'create', label: 'Create account' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'create' ? (
          <CreateAccountForm
            server={server}
            onAuthenticated={() => setFinishing(true)}
            onSignIn={() => setTab('sign-in')}
            policyHref={(kind) => ({ pathname: '/policy/[kind]', params: { kind, server: param } })}
          />
        ) : (
          <SignInForm
            server={server}
            onAuthenticated={() => setFinishing(true)}
            onForgot={() => router.push({ pathname: '/forgot-password', params: { server: param } })}
          />
        )}
        <Text variant="captionMd" tone="muted">
          Just looking?{' '}
          <InlineLink
            variant="captionMd"
            onPress={() => {
              adoptServer(server);
              router.push('/explore');
            }}
          >
            Browse public topics
          </InlineLink>
        </Text>
      </Stack>
    );
  }

  return (
    <WelcomeFrame title={name} onBack={change}>
      <Stack gap="lg">
        {wide || !official ? card : null}
        {body}
      </Stack>
    </WelcomeFrame>
  );
}
