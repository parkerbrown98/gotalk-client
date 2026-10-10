import { unwrap, type Schemas } from '@gotalk/api-client';
import { classifyEmailFailure, resendSecondsLeft, RESEND_WAIT_SECONDS } from '@gotalk/core';
import { Badge, Button, Notice, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useApiClient, useOnAppFocus } from '@/lib/api';
import { useCountdown } from '@/lib/countdown';
import { useActiveInstance } from '@/lib/instances';
import { useInstanceCapabilities } from '@/lib/uploads';

type SelfUser = Schemas['SelfUser'];

/** Remembers when this device last asked for a link, per instance, so the wait survives leaving the screen. */
const lastSent = new Map<string, number>();

/**
 * The account's email address, a Verified badge once it is confirmed, and otherwise a notice to confirm it
 * with Resend. The server confirms in a browser page, so the profile is refetched when the app regains focus.
 */
export function EmailStatus({ user, onRefresh }: { user: SelfUser; onRefresh: () => void }) {
  const theme = useTheme();
  const inst = useActiveInstance()?.id ?? '';
  const client = useApiClient();
  const qc = useQueryClient();
  const caps = useInstanceCapabilities();
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'danger' | 'warning'; text: string } | null>(null);
  const [wait, setWait] = useState<number | null>(() => resendSecondsLeft(lastSent.get(inst)) || null);
  const [attempt, setAttempt] = useState(0);
  const cooldown = useCountdown(wait, attempt);

  const unconfirmed = !user.email_verified && !!user.email;
  useOnAppFocus(onRefresh, unconfirmed);

  if (!user.email) return null;

  async function resend() {
    if (!client || sending) return;
    setSending(true);
    setMessage(null);
    try {
      unwrap(await client.POST('/users/@me/email/verification'));
      lastSent.set(inst, Date.now());
      setSentTo(user.email);
      setWait(RESEND_WAIT_SECONDS);
      setAttempt((n) => n + 1);
    } catch (e) {
      const f = classifyEmailFailure(e);
      switch (f.kind) {
        case 'already_verified':
          await qc.invalidateQueries({ queryKey: ['me', inst] });
          break;
        case 'cooldown':
        case 'rate_limited':
          setWait(f.retryAfter);
          setAttempt((n) => n + 1);
          setMessage({ tone: 'warning', text: f.kind === 'cooldown' ? 'A link was sent less than a minute ago. Check your inbox and spam folder.' : `Slow down a little. Try again in ${f.retryAfter} seconds.` });
          break;
        case 'email_unavailable':
          setMessage({ tone: 'danger', text: "This instance can't send email right now. Try again later, or ask its administrator." });
          break;
        case 'network':
          setMessage({ tone: 'danger', text: 'Could not reach the instance. Check your connection and try again.' });
          break;
        default:
          setMessage({ tone: 'danger', text: f.message });
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Stack direction="row" gap="sm" align="center">
          <Text variant="bodySmStrong" tone="onDark">
            Email
          </Text>
          {user.email_verified ? <Badge label="Verified" tone="success" /> : caps.emailVerification ? <Badge label="Not confirmed" tone="warning" /> : null}
        </Stack>
        <TextField value={user.email} editable={false} accessibilityLabel="Email" style={{ color: theme.colors.mute }} hint="The address you sign in with. It can't be changed in the app." />
      </Stack>
      {unconfirmed && caps.emailVerification ? (
        <Notice tone="info" icon="mail" title="Confirm your email.">
          {sentTo ? `We sent a new link to ${sentTo}. ` : `Open the link we sent to ${user.email}. `}
          Confirming happens in your browser; this page updates when you come back.
        </Notice>
      ) : null}
      {message && unconfirmed ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {unconfirmed && caps.emailVerification ? (
        <Button
          title={cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend link'}
          variant="tertiary"
          size="sm"
          style={{ alignSelf: 'flex-start' }}
          loading={sending}
          disabled={cooldown > 0}
          onPress={resend}
        />
      ) : null}
    </Stack>
  );
}
