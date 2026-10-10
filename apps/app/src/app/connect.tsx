import { DiscoveryError, discoverInstance, instanceCapabilities, normalizeInstanceInput, type DiscoveredInstance } from '@gotalk/core';
import { Button, Card, Notice, Stack, Text, TextField } from '@gotalk/ui';
import { router } from 'expo-router';
import { useState } from 'react';

import { ScreenFrame } from '@/components/screen-frame';
import { HeroStripes } from '@/components/hero-stripes';
import { InstanceIcon, InstanceSummary } from '@/components/instance-summary';
import { refusedHint } from '@/lib/connectivity';
import { openExternal } from '@/lib/desktop';
import { instancesStore, useInstances } from '@/lib/instances';
import { useWide } from '@/lib/layout';

function describeError(e: unknown, address: string): string {
  if (e instanceof DiscoveryError) {
    if (e.code !== 'unreachable' && e.code !== 'timeout') return e.message;
    let origin: string | undefined;
    try {
      origin = normalizeInstanceInput(address).at(-1);
    } catch {
      origin = undefined;
    }
    const hint = refusedHint(origin);
    return hint ? `${e.message} ${hint}` : e.message;
  }
  return 'Something went wrong while connecting. Check the address and try again.';
}

export default function Connect() {
  const wide = useWide();

  const [address, setAddress] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<DiscoveredInstance | null>(null);
  const saved = useInstances((s) => s.instances);

  async function lookUp() {
    setPending(true);
    setError(null);
    setFound(null);
    try {
      setFound(await discoverInstance(address));
    } catch (e) {
      setError(describeError(e, address));
    } finally {
      setPending(false);
    }
  }

  function continueToInstance() {
    if (!found) return;
    instancesStore.getState().addInstance(found);
    router.replace('/home');
  }

  function openSaved(id: string) {
    instancesStore.getState().setActive(id);
    router.replace('/home');
  }

  const awaitingSetup = !!found && instanceCapabilities(found.instance).awaitingSetup;
  const blocked = found && (!found.compatibility.ok || awaitingSetup);
  // The stripe band appears once per page: only on the first-run screen, before anything is found.
  const firstRun = !found && saved.length === 0;
  const gap = wide ? 'xl' : 'lg';

  return (
    <ScreenFrame
      title="Connect to an instance"
      onBack={router.canGoBack() ? () => router.back() : undefined}
      banner={firstRun ? <HeroStripes compact={!wide} /> : undefined}
      maxWidth={wide ? 528 : 640}
    >
          <Stack gap={gap}>
            <Stack gap="sm">
              <Text variant="headingXl" accessibilityRole="header">
                Pick your server
              </Text>
              <Text variant={wide ? 'bodyMd' : 'bodySm'} tone="muted">
                Gotalk runs on independent instances. Enter the address of the one you want to join, like
                forum.example.com.
              </Text>
            </Stack>

            <Stack gap="md">
              <TextField
                label="Instance address"
                placeholder="forum.example.com"
                value={address}
                onChangeText={(t) => {
                  setAddress(t);
                  setError(null);
                }}
                autoFocus={firstRun}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="url"
                inputMode="url"
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={() => address.trim() && !pending && lookUp()}
                error={error}
              />
              <Button
                title="Look up"
                variant={found ? 'tertiary' : 'primary'}
                onPress={lookUp}
                loading={pending}
                disabled={!address.trim()}
              />
            </Stack>

            {found ? (
              <Card compact={!wide}>
                <InstanceSummary
                  instance={found.instance}
                  origin={found.origin}
                  secure={found.secure}
                  iconSize={wide ? 48 : 36}
                />
                {!found.secure ? (
                  <Notice tone="warning">
                    Traffic to this instance can be read on the network. Only continue if it is your own server.
                  </Notice>
                ) : null}
                {!found.compatibility.ok ? (
                  <Notice tone="danger" title="This instance isn't compatible with this app.">
                    {found.compatibility.reason} Ask the administrator to update, or use a different instance.
                  </Notice>
                ) : awaitingSetup ? (
                  <Notice tone="warning" title="Setup isn't finished.">
                    {"This instance hasn't finished first-run setup yet. If it's yours, open the setup page and use the setup token from the server's log. Everyone else can join once setup is done."}
                  </Notice>
                ) : null}
                {awaitingSetup ? <Button title="Open setup page" variant="tertiary" onPress={() => openExternal(`${found.origin}/setup`)} /> : null}
                <Button title={`Continue to ${found.instance.name}`} onPress={continueToInstance} disabled={!!blocked} />
              </Card>
            ) : null}

            {saved.length > 0 ? (
              <Stack gap="md">
                <Text variant="bodySmStrong" tone="muted">
                  Saved instances
                </Text>
                {saved.map((i) => (
                  <Card compact key={i.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <InstanceIcon name={i.name} iconUrl={i.iconUrl} origin={i.origin} size={36} />
                    <Stack gap="none" style={{ flex: 1 }}>
                      <Text variant="bodySmStrong" tone="onDark">
                        {i.name}
                      </Text>
                      <Text variant="captionMd" tone="muted">
                        {i.origin.replace(/^https?:\/\//, '')}
                      </Text>
                    </Stack>
                    <Button title="Open" variant="tertiary" onPress={() => openSaved(i.id)} />
                  </Card>
                ))}
              </Stack>
            ) : null}
          </Stack>
    </ScreenFrame>
  );
}
