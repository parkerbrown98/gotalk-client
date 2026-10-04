import { isValidSlug, slugify, visibilityOptions, type PlaceVisibility } from '@gotalk/core';
import { Button, Notice, RadioOptions, Stack, Text, TextField } from '@gotalk/ui';
import { useState } from 'react';

import { FailureNotice } from '@/components/failure-notice';
import { classifyFailure, type FailureKind } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';
import type { PlaceInput } from '@/lib/places';

export interface PlaceFormProps {
  /** Fills the address from the name until the person edits it themselves. */
  autoSlug?: boolean;
  initial?: Partial<PlaceInput>;
  submitLabel: string;
  secondaryLabel: string;
  slugHint: string;
  onSubmit: (values: PlaceInput) => Promise<void>;
  onSecondary: () => void;
}

type Field = 'name' | 'slug' | 'description';

/** Which field a server message is about. */
function fieldOf(message: string): Field | undefined {
  if (/slug|address/i.test(message)) return 'slug';
  if (/name/i.test(message)) return 'name';
  return undefined;
}

/** Name, address, description and who can join: shared by creating a place and its settings. */
export function PlaceForm({ autoSlug, initial, submitLabel, secondaryLabel, slugHint, onSubmit, onSecondary }: PlaceFormProps) {
  const active = useActiveInstance();
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(!autoSlug);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [visibility, setVisibility] = useState<PlaceVisibility>(initial?.visibility ?? 'public');
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<FailureKind | null>(null);
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});

  const dirty =
    name.trim() !== (initial?.name ?? '') ||
    slug !== (initial?.slug ?? '') ||
    description !== (initial?.description ?? '') ||
    visibility !== (initial?.visibility ?? 'public');
  const errors: Partial<Record<Field, string>> = {
    ...(touched.name && !name.trim() ? { name: 'Give the place a name.' } : {}),
    ...(touched.slug && !isValidSlug(slug) ? { slug: 'Use 3 to 32 lowercase letters, numbers or dashes.' } : {}),
    ...serverErrors,
  };
  const valid = !!name.trim() && isValidSlug(slug);

  async function submit() {
    if (!valid || pending) return;
    setPending(true);
    setFailure(null);
    setServerErrors({});
    try {
      await onSubmit({ name: name.trim(), slug, description: description.trim(), visibility });
    } catch (e) {
      const f = classifyFailure(e);
      setFailure(f);
      if (f.kind === 'rejected') {
        const field = fieldOf(f.message);
        if (field) setServerErrors({ [field]: f.message });
      }
    } finally {
      setPending(false);
    }
  }

  const unmapped = failure?.kind === 'rejected' && Object.keys(serverErrors).length === 0;
  return (
    <Stack gap="xl">
      <FailureNotice failure={failure} host={active?.origin.replace(/^https?:\/\//, '') ?? ''} hideRejected />
      {failure?.kind === 'rejected' && unmapped ? <Notice tone="danger">{failure.message}</Notice> : null}
      <Stack gap="lg">
        <TextField
          label="Name"
          value={name}
          onChangeText={(v) => {
            setName(v);
            setServerErrors((e) => ({ ...e, name: undefined }));
            if (!slugEdited) setSlug(slugify(v));
          }}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          error={errors.name}
          maxLength={80}
          autoFocus
        />
        <TextField
          label="Address"
          value={slug}
          onChangeText={(v) => {
            setSlug(v.toLowerCase());
            setSlugEdited(true);
            setServerErrors((e) => ({ ...e, slug: undefined }));
          }}
          onBlur={() => setTouched((t) => ({ ...t, slug: true }))}
          error={errors.slug}
          hint={`places/${slug || '…'} · ${slugHint}`}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={32}
        />
        <TextField label="Description" value={description} onChangeText={setDescription} multiline maxLength={500} />
        <Stack gap="xs">
          <Text variant="bodySmStrong" tone="onDark">
            Who can join
          </Text>
          <RadioOptions options={visibilityOptions} value={visibility} onChange={setVisibility} />
        </Stack>
      </Stack>
      <Stack direction="row" gap="sm">
        <Button title={submitLabel} onPress={submit} loading={pending} disabled={!valid || !dirty} />
        <Button title={secondaryLabel} variant="tertiary" onPress={onSecondary} disabled={pending} />
      </Stack>
    </Stack>
  );
}
