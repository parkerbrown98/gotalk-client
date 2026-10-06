import { webhookEventInfo } from '@gotalk/core';
import { Button, Checkbox, Dialog, Notice, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';

import { failureMessage } from '@/lib/failure';

export interface WebhookInput {
  name: string;
  url: string;
  events: string[];
  active?: boolean;
}

/** One checkbox per event the instance offers. Events that need a permission the user lacks are disabled. */
export function EventsPicker({ events, selected, onChange, can }: { events: string[]; selected: string[]; onChange: (events: string[]) => void; can: (permission: 'VIEW_AUDIT_LOG' | 'MANAGE_REPORTS') => boolean }) {
  return (
    <Stack gap="sm">
      <Text variant="bodySmStrong" tone="onDark">
        Events
      </Text>
      {events.map((event) => {
        const info = webhookEventInfo(event);
        const locked = !!info.requires && !can(info.requires);
        return (
          <Checkbox
            key={event}
            checked={selected.includes(event)}
            disabled={locked && !selected.includes(event)}
            description={locked ? `${info.description}. Needs ${info.requires === 'MANAGE_REPORTS' ? 'Manage reports' : 'View audit log'}.` : info.description || undefined}
            onChange={(checked) => onChange(checked ? [...selected, event] : selected.filter((e) => e !== event))}
          >
            {event}
          </Checkbox>
        );
      })}
    </Stack>
  );
}

/** Counts openings, so the form starts fresh each time yet keeps its content while fading out. */
function useOpenings(visible: boolean): number {
  const [opened, setOpened] = useState({ visible, count: visible ? 1 : 0 });
  if (visible !== opened.visible) setOpened({ visible, count: opened.count + (visible ? 1 : 0) });
  return opened.count;
}

export function WebhookDialog(props: {
  visible: boolean;
  title: string;
  events: string[];
  initial?: WebhookInput;
  can: (permission: 'VIEW_AUDIT_LOG' | 'MANAGE_REPORTS') => boolean;
  onClose: () => void;
  onSubmit: (input: WebhookInput) => Promise<void>;
}) {
  const openings = useOpenings(props.visible);
  const { height } = useWindowDimensions();
  return (
    <Dialog visible={props.visible} onClose={props.onClose}>
      <ScrollView style={{ maxHeight: height * 0.8 }} contentContainerStyle={{ gap: 16 }} keyboardShouldPersistTaps="handled">
        {openings > 0 ? <WebhookForm key={openings} {...props} /> : null}
      </ScrollView>
    </Dialog>
  );
}

function WebhookForm({ title, events, initial, can, onClose, onSubmit }: { title: string; events: string[]; initial?: WebhookInput; can: (permission: 'VIEW_AUDIT_LOG' | 'MANAGE_REPORTS') => boolean; onClose: () => void; onSubmit: (input: WebhookInput) => Promise<void> }) {
  const theme = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [selected, setSelected] = useState<string[]>(initial?.events ?? []);
  const [active, setActive] = useState(initial?.active ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = !name.trim() ? 'Give the webhook a name.' : !/^https?:\/\/\S+$/i.test(url.trim()) ? 'Enter an http or https URL.' : selected.length === 0 ? 'Pick at least one event.' : null;
  return (
    <>
      <Text variant="headingMd" accessibilityRole="header">
        {title}
      </Text>
      <TextField label="Name" value={name} onChangeText={setName} maxLength={100} autoFocus={!initial} />
      <TextField
        label="URL"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        maxLength={2048}
        placeholder="https://example.com/hooks/gotalk"
        hint="Events are POSTed here. It must be reachable from the internet, not a private or local address."
      />
      <EventsPicker events={events} selected={selected} onChange={setSelected} can={can} />
      {initial ? (
        <Checkbox checked={active} onChange={setActive} description="Turning it back on resets its failure count.">
          Active
        </Checkbox>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
        <Button title="Cancel" variant="tertiary" onPress={onClose} />
        <Button
          title={initial ? 'Save' : 'Create webhook'}
          loading={pending}
          onPress={async () => {
            if (problem) return setError(problem);
            setPending(true);
            setError(null);
            try {
              await onSubmit({ name: name.trim(), url: url.trim(), events: selected, active });
              onClose();
            } catch (e) {
              setError(failureMessage(e, initial ? 'The webhook could not be saved. Try again.' : 'The webhook could not be created. Try again.'));
            } finally {
              setPending(false);
            }
          }}
        />
      </View>
    </>
  );
}
