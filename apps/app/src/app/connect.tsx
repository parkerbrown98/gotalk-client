import { DiscoveryError, discoverInstance, type DiscoveredInstance } from '@gotalk/core';
import { Button, Card, Screen, Stack, Text, TextField } from '@gotalk/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { InstanceIcon, InstanceSummary } from '@/components/instance-summary';
import { instancesStore, useInstances } from '@/lib/instances';

function describeError(e: unknown): string {
  if (e instanceof DiscoveryError) return e.message;
  return 'Something went wrong while connecting. Check the address and try again.';
}

export default function Connect() {
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Screen>
          <Stack gap={5}>
            <Stack gap={2}>
              <Text variant="title">Pick your server</Text>
              <Text tone="muted">
                Gotalk runs on independent instances. Enter the address of the one you want to join, like
                forum.example.com.
              </Text>
            </Stack>

            <Stack gap={3}>
              <TextField
                label="Instance address"
                placeholder="forum.example.com"
                value={address}
                onChangeText={(t) => {
                  setAddress(t);
                  setError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="url"
                inputMode="url"
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={() => address.trim() && !pending && lookUp()}
                error={error}
              />
              <Button title="Look up" onPress={lookUp} loading={pending} disabled={!address.trim()} />
            </Stack>

            {found ? (
              <Card>
                <InstanceSummary instance={found.instance} origin={found.origin} secure={found.secure} />
                {!found.compatibility.ok ? (
                  <Text tone="danger">{found.compatibility.reason}</Text>
                ) : found.instance.setup_required ? (
                  <Text tone="warning">
                    This instance hasn't finished first-run setup yet. Its administrator needs to complete setup before
                    anyone can join.
                  </Text>
                ) : null}
                <Button title={`Continue to ${found.instance.name}`} onPress={continueToInstance} disabled={!!blocked} />
              </Card>
            ) : null}

            {saved.length > 0 ? (
              <Stack gap={3}>
                <Text variant="label" tone="muted">
                  Saved instances
                </Text>
                {saved.map((i) => (
                  <Card key={i.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <InstanceIcon name={i.name} iconUrl={i.iconUrl} origin={i.origin} size={36} />
                    <Stack gap={0} style={{ flex: 1 }}>
                      <Text variant="label">{i.name}</Text>
                      <Text variant="caption" tone="muted">
                        {i.origin.replace(/^https?:\/\//, '')}
                      </Text>
                    </Stack>
                    <Button title="Open" variant="secondary" onPress={() => openSaved(i.id)} />
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
