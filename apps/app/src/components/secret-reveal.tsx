import { Button, Dialog, Notice, Stack, Text, useTheme } from '@gotalk/ui';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { copyText } from '@/lib/clipboard';

/** Shows a token or signing secret once, with a way to copy it. The server never returns it again. */
export function SecretReveal({
  visible,
  title,
  secret,
  description = "You won't see it again. If you lose it, rotate or recreate it.",
  onClose,
}: {
  visible: boolean;
  title: string;
  secret: string | null;
  description?: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  if (!secret) return null;
  return (
    <Dialog
      visible={visible}
      onClose={() => {
        setCopied(false);
        onClose();
      }}
    >
      <Text variant="headingMd" accessibilityRole="header">
        {title}
      </Text>
      <Notice tone="warning">{description}</Notice>
      <View
        style={{
          borderWidth: 1,
          borderColor: theme.colors.hairlineStrong,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.md,
          padding: theme.space.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.sm,
        }}
      >
        <Text selectable variant="bodySm" tone="onDark" style={{ flex: 1, fontFamily: Platform.OS === 'web' ? theme.fontFamilies.mono : 'monospace' }}>
          {secret}
        </Text>
        <Button
          title={copied ? 'Copied' : 'Copy'}
          size="sm"
          onPress={async () => {
            await copyText(secret);
            setCopied(true);
          }}
        />
      </View>
      <Stack direction="row" justify="flex-end">
        <Button
          title="Done"
          variant="tertiary"
          onPress={() => {
            setCopied(false);
            onClose();
          }}
        />
      </Stack>
    </Dialog>
  );
}
