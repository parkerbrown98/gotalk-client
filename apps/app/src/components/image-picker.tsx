import { describeUploadFailure, uploadHint, type ImagePurpose, type InstanceCapabilities } from '@gotalk/core';
import { Avatar, Button, Notice, Stack, Text, TextField, useImageFallback, useTheme } from '@gotalk/ui';
import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';

import { InstanceIcon } from '@/components/instance-summary';
import { useCountdown } from '@/lib/countdown';
import { failureMessage } from '@/lib/failure';
import { pickImage } from '@/lib/image-pick';

export interface ImagePickerProps {
  purpose: ImagePurpose;
  /** For the initials when there is no image. */
  name: string;
  url: string | null | undefined;
  /** Resolves relative icon URLs. */
  origin: string;
  caps: InstanceCapabilities;
  /** "photo", "icon", "banner": used in the button labels. */
  noun: string;
  onUpload: (image: Blob, type: string) => Promise<void>;
  onRemove: () => Promise<void>;
  /** Without uploads on the instance, an image URL is saved instead. */
  onSetUrl?: (url: string) => Promise<void>;
  disabled?: boolean;
}

function Preview({ purpose, name, url, origin, size }: { purpose: ImagePurpose; name: string; url: string | null | undefined; origin: string; size: number }) {
  const theme = useTheme();
  const banner = useImageFallback(purpose === 'placeBanner' ? url : null);
  if (purpose === 'avatar') return <Avatar name={name} uri={url} size={size} />;
  if (purpose !== 'placeBanner') return <InstanceIcon name={name} iconUrl={url} origin={origin} size={size} />;
  const box = { width: '100%' as const, height: 112, borderRadius: theme.radii.md, borderWidth: 1, borderColor: theme.colors.hairline };
  if (banner.uri) return <Image source={{ uri: banner.uri }} onError={banner.onError} style={box} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />;
  return (
    <View style={[box, { backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }]}>
      <Text variant="captionMd" tone="muted">
        No banner
      </Text>
    </View>
  );
}

/**
 * The image-picker pattern from DESIGN.md: the current image (or its fallback) beside Upload or Replace
 * and Remove, the accepted formats and size underneath, and errors in a notice. There is no progress
 * bar; files are small, so the button says "Uploading…".
 */
export function ImagePicker({ purpose, name, url, origin, caps, noun, onUpload, onRemove, onSetUrl, disabled }: ImagePickerProps) {
  const theme = useTheme();
  const [busy, setBusy] = useState<'uploading' | 'removing' | 'saving' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cooldown = useCountdown(wait, attempt);
  const [draft, setDraft] = useState(url ?? '');

  if (!caps.uploads) {
    if (!onSetUrl) return null;
    const changed = draft.trim() !== (url ?? '');
    return (
      <Stack gap="sm">
        <Stack direction="row" gap="lg" align="center">
          {purpose === 'placeBanner' ? null : <Preview purpose={purpose} name={name} url={url} origin={origin} size={64} />}
          <View style={{ flex: 1 }}>
            <TextField
              label={`${noun.charAt(0).toUpperCase()}${noun.slice(1)} URL`}
              value={draft}
              onChangeText={(v) => {
                setDraft(v);
                setError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              hint="An https image URL. Leave it empty for none. This instance doesn't take uploads."
              editable={!disabled}
            />
          </View>
        </Stack>
        {purpose === 'placeBanner' ? <Preview purpose={purpose} name={name} url={url} origin={origin} size={64} /> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button
          title={`Save ${noun} URL`}
          variant="tertiary"
          size="sm"
          style={{ alignSelf: 'flex-start' }}
          loading={busy === 'saving'}
          disabled={!changed || disabled}
          onPress={async () => {
            const next = draft.trim();
            if (next && !/^https:\/\/\S+$/i.test(next)) return setError('Use an https image URL.');
            setBusy('saving');
            try {
              await onSetUrl(next);
            } catch (e) {
              setError(failureMessage(e, `The ${noun} could not be saved. Try again.`));
            } finally {
              setBusy(null);
            }
          }}
        />
      </Stack>
    );
  }

  async function choose() {
    setError(null);
    const picked = await pickImage({ purpose, types: caps.uploadTypes, maxSize: caps.uploadSize }).catch(() => ({ status: 'invalid' as const, message: "That image couldn't be opened. Try another file." }));
    if (picked.status === 'canceled') return;
    if (picked.status === 'invalid') return setError(picked.message);
    setBusy('uploading');
    try {
      await onUpload(picked.image.blob, picked.image.type);
    } catch (e) {
      const f = describeUploadFailure(e, caps);
      setError(f.message);
      if (f.kind === 'rate_limited') {
        setWait(f.retryAfter);
        setAttempt((n) => n + 1);
      }
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setError(null);
    setBusy('removing');
    try {
      await onRemove();
    } catch (e) {
      setError(failureMessage(e, `The ${noun} could not be removed. Try again.`));
    } finally {
      setBusy(null);
    }
  }

  const waiting = cooldown > 0;
  const buttons = (
    <Stack direction="row" gap="sm" wrap>
      <Button
        title={busy === 'uploading' ? 'Uploading…' : waiting ? `Try again in ${cooldown}s` : url ? `Replace ${noun}` : `Upload ${noun}`}
        variant="tertiary"
        size="sm"
        loading={busy === 'uploading'}
        disabled={!!busy || waiting || disabled}
        onPress={choose}
      />
      {url ? <Button title="Remove" variant="secondary" size="sm" loading={busy === 'removing'} disabled={!!busy || disabled} onPress={remove} /> : null}
    </Stack>
  );
  const hint = (
    <Text variant="captionMd" tone="muted">
      {uploadHint(caps)}
      {purpose === 'placeBanner' ? ' Wide images work best; they are cropped to fit.' : ' Cropped to a square.'}
    </Text>
  );

  return (
    <Stack gap="sm">
      {purpose === 'placeBanner' ? (
        <Stack gap="sm">
          <Preview purpose={purpose} name={name} url={url} origin={origin} size={64} />
          {buttons}
          {hint}
        </Stack>
      ) : (
        <Stack direction="row" gap="lg" align="center">
          <Preview purpose={purpose} name={name} url={url} origin={origin} size={64} />
          <Stack gap="xs" style={{ flex: 1 }}>
            {buttons}
            {hint}
          </Stack>
        </Stack>
      )}
      {error ? (
        <View style={{ marginTop: theme.space.xs }}>
          <Notice tone="danger">{error}</Notice>
        </View>
      ) : null}
    </Stack>
  );
}
