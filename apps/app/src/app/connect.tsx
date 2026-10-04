import { DiscoveryError, discoverInstance, type DiscoveredInstance } from '@gotalk/core';
import { Button, Card, Notice, Screen, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeroStripes } from '@/components/hero-stripes';
import { InstanceIcon, InstanceSummary } from '@/components/instance-summary';
import { instancesStore, useInstances } from '@/lib/instances';

function describeError(e: unknown): string {
  if (e instanceof DiscoveryError) return e.message;
  return 'Something went wrong while connecting. Check the address and try again.';
}

export default function Connect() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= theme.breakpoints.tablet;

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
      setError(describeError(e));
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

  const blocked = found && (!found.compatibility.ok || found.instance.setup_required);
  // The stripe band appears once per page: only on the first-run screen, before anything is found.
  const firstRun = !found && saved.length === 0;
  const gap = wide ? 'xl' : 'lg';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.canvas, paddingTop: insets.top }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {firstRun ? <HeroStripes compact={!wide} /> : null}
      {Platform.OS !== 'web' ? (
        <View
          style={{
            height: 48,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: theme.space.lg,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.hairline,
          }}
        >
          <View style={{ width: 56 }}>
            {router.canGoBack() ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} onPress={() => router.back()}>
                <Text variant="bodySm" tone="onDark">
                  Back
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text variant="bodySmStrong" tone="onDark" accessibilityRole="header" style={{ flex: 1, textAlign: 'center' }}>
            Connect to an instance
          </Text>
          <View style={{ width: 56 }} />
        </View>
      ) : null}
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Screen
          maxWidth={wide ? 528 : 640}
          style={wide ? { paddingVertical: 48, paddingHorizontal: theme.space.xl } : { padding: theme.space.lg }}
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
                ) : found.instance.setup_required ? (
                  <Notice tone="warning" title="Setup isn't finished.">
                    This instance hasn't finished first-run setup yet. Its administrator needs to complete setup before
                    anyone can join.
                  </Notice>
                ) : null}
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
        </Screen>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
