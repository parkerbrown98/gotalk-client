import { describeLastTokenUse, describeTokenExpiry, TOKEN_EXPIRY_CHOICES, TOKEN_SCOPES, tokenScopeDescription, type TokenScope } from '@gotalk/core';
import { Badge, Button, Checkbox, Dialog, ListCard, Notice, PillTabs, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { SecretReveal } from '@/components/secret-reveal';
import { SettingsPage } from '@/components/settings-page';
import { useInstanceInfo, useMe } from '@/lib/api';
import { useTokens, useTokenActions, type APIToken } from '@/lib/developer';
import { failureMessage } from '@/lib/failure';

export default function Tokens() {
  const theme = useTheme();
  const tokens = useTokens();
  const info = useInstanceInfo().data;
  const me = useMe().data;
  const actions = useTokenActions();
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const limit = info?.limits.personal_tokens ?? 25;
  const list = tokens.data ?? [];
  const atLimit = list.length >= limit;

  return (
    <SettingsPage title="Access tokens" subtitle="Tokens let scripts use the API as you. Treat them like passwords.">
      <Stack gap="lg">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.space.md, alignItems: 'center' }}>
          <Text variant="captionMd" tone="muted" style={{ flex: 1 }}>
            Up to {limit} tokens. Administrators may include the admin scope.
          </Text>
          <Button title="Create token" onPress={() => setCreating(true)} disabled={atLimit} />
        </View>
        {atLimit ? <Notice tone="warning">You have reached the token limit. Revoke one before creating another.</Notice> : null}
        {tokens.isPending ? <ActivityIndicator /> : null}
        {tokens.isError ? (
          <Stack gap="sm">
            <Notice tone="danger" title="Tokens could not be loaded.">
              Check your connection and try again.
            </Notice>
            <Button title="Try again" variant="tertiary" onPress={() => void tokens.refetch()} style={{ alignSelf: 'flex-start' }} />
          </Stack>
        ) : null}
        {tokens.data && tokens.data.length === 0 ? (
          <Text variant="bodySm" tone="muted">
            No personal access tokens yet.
          </Text>
        ) : null}
        {tokens.data && tokens.data.length > 0 ? (
          <ListCard>
            {tokens.data.map((token) => (
              <TokenRow key={token.id} token={token} onRevoke={(id) => actions.revoke(id)} />
            ))}
          </ListCard>
        ) : null}
      </Stack>
      <CreateTokenDialog
        visible={creating}
        isAdmin={!!me?.is_instance_admin}
        onClose={() => setCreating(false)}
        onCreate={async (input) => {
          const created = await actions.create(input);
          setSecret(created.token);
          setCreating(false);
        }}
      />
      <SecretReveal visible={!!secret} title="Copy your token now" secret={secret} onClose={() => setSecret(null)} />
    </SettingsPage>
  );
}

function TokenRow({ token, onRevoke }: { token: APIToken; onRevoke: (id: string) => Promise<void> }) {
  const theme = useTheme();
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scopes = token.scopes ?? [];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, padding: theme.space.lg }}>
      <Stack gap="xs" style={{ flex: 1 }}>
        <Stack direction="row" gap="sm" align="center" wrap>
          <Text variant="bodySmStrong" tone="onDark">
            {token.name}
          </Text>
          {token.hint ? (
            <Text variant="captionMd" tone="muted" style={{ fontFamily: Platform.OS === 'web' ? theme.fontFamilies.mono : 'monospace' }}>
              {token.hint}…
            </Text>
          ) : null}
          {token.expired ? <Badge label="Expired" tone="warning" /> : null}
        </Stack>
        <Stack direction="row" gap="xs" wrap>
          {scopes.map((scope) => (
            <Badge key={scope} label={tokenScopeDescription(scope)} />
          ))}
        </Stack>
        <Text variant="captionMd" tone="muted">
          {describeLastTokenUse(token.last_used_at)} · {describeTokenExpiry(token.expires_at, token.expired)}
        </Text>
      </Stack>
      <Button title="Revoke" variant="danger" size="sm" onPress={() => setConfirm(true)} />
      <Dialog visible={confirm} onClose={() => setConfirm(false)}>
        <Text variant="headingMd" accessibilityRole="header">
          Revoke {token.name}?
        </Text>
        <Text variant="bodySm" tone="muted">
          Scripts using this token will stop working immediately and gateway connections using it will close.
        </Text>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Stack direction="row" justify="flex-end">
          <Button title="Cancel" variant="tertiary" onPress={() => setConfirm(false)} />
          <Button
            title="Revoke token"
            variant="danger"
            loading={pending}
            onPress={async () => {
              setPending(true);
              setError(null);
              try {
                await onRevoke(token.id);
                setConfirm(false);
              } catch (e) {
                setError(failureMessage(e, 'The token could not be revoked.'));
              } finally {
                setPending(false);
              }
            }}
          />
        </Stack>
      </Dialog>
    </View>
  );
}

function CreateTokenDialog({
  visible,
  isAdmin,
  onClose,
  onCreate,
}: {
  visible: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; scopes: string[]; expires_in_days?: number }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<TokenScope[]>(['read']);
  const [days, setDays] = useState(30);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = TOKEN_SCOPES.filter((s) => isAdmin || s.value !== 'admin');
  const valid = name.trim() && scopes.length > 0;
  return (
    <Dialog visible={visible} onClose={onClose}>
      <Text variant="headingMd" accessibilityRole="header">
        Create token
      </Text>
      <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="sentences" maxLength={100} placeholder="What uses it, e.g. Backup script" autoFocus />
      <Stack gap="sm">
        <Text variant="bodySmStrong" tone="onDark">
          Access
        </Text>
        {options.map((scope) => (
          <Checkbox
            key={scope.value}
            checked={scopes.includes(scope.value)}
            onChange={(checked) => setScopes((current) => (checked ? [...current, scope.value] : current.filter((s) => s !== scope.value)))}
            description={scope.description}
          >
            {scope.label}
          </Checkbox>
        ))}
      </Stack>
      <Stack gap="sm">
        <Text variant="bodySmStrong" tone="onDark">
          Expires
        </Text>
        <PillTabs options={TOKEN_EXPIRY_CHOICES.map((c) => ({ value: String(c.days), label: c.label }))} value={String(days)} onChange={(v) => setDays(Number(v))} />
      </Stack>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Stack direction="row" justify="flex-end">
        <Button title="Cancel" variant="tertiary" onPress={onClose} />
        <Button
          title="Create token"
          loading={pending}
          disabled={!valid}
          onPress={async () => {
            setPending(true);
            setError(null);
            try {
              await onCreate({ name: name.trim(), scopes, expires_in_days: days || undefined });
              setName('');
              setScopes(['read']);
              setDays(30);
            } catch (e) {
              setError(failureMessage(e, 'The token could not be created.'));
            } finally {
              setPending(false);
            }
          }}
        />
      </Stack>
    </Dialog>
  );
}
