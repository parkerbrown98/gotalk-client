import { Icon, Text, useTheme } from '@gotalk/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useConnection } from '@/lib/connection';
import { refusedHint } from '@/lib/connectivity';
import { useActiveInstance } from '@/lib/instances';
import { useOnline } from '@/lib/realtime';

const GRACE_MS = 1_500;

/**
 * Whether to say the connection is down: right away when the device is offline, otherwise once the
 * gateway has been reconnecting for a moment, so short blips (a server restart, a resync) stay invisible.
 */
export function useConnectionBannerVisible(): boolean {
  const downSince = useConnection((s) => s.downSince);
  const online = useOnline();
  /** The outage whose grace period has run out. */
  const [overdue, setOverdue] = useState<number | null>(null);
  useEffect(() => {
    if (downSince === null) return;
    const t = setTimeout(() => setOverdue(downSince), Math.max(0, GRACE_MS - (Date.now() - downSince)));
    return () => clearTimeout(t);
  }, [downSince]);
  return !online || (downSince !== null && overdue === downSince);
}

/** One line at the top while the gateway is down. Reading continues; messages catch up when it is back. */
export function ConnectionBanner() {
  const theme = useTheme();
  const c = theme.colors;
  const everReady = useConnection((s) => s.everReady);
  const online = useOnline();
  const origin = useActiveInstance()?.origin;
  // Never connected on the web: the instance may be refusing this site's origin at the handshake.
  const hint = !everReady && online ? refusedHint(origin) : null;
  return (
    <View accessibilityRole="alert" style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.accentYellowSoft }}>
      <Icon name="wifi" size={14} color={c.accentYellow} />
      <Text variant="captionMd" style={{ flexShrink: 1, textAlign: 'center' }}>
        {hint ? `Live updates can't connect. ${hint}` : 'Reconnecting. Messages will catch up when you are back.'}
      </Text>
    </View>
  );
}
