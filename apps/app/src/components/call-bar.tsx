import { voiceStatesByChannel } from '@gotalk/core';
import { Avatar, Icon, Text, useTheme } from '@gotalk/ui';
import { router, usePathname } from 'expo-router';
import { Pressable, View } from 'react-native';

import { CallControl, LeaveControl, QualityBars } from '@/components/voice-call';
import { useSession } from '@/lib/auth';
import { useActiveInstance } from '@/lib/instances';
import { leaveVoice, setSelfDeaf, setSelfMute, useCall, useVoice, useVoiceStates, type Call } from '@/lib/voice';

function openCall(call: Call) {
  router.push({ pathname: '/places/[slug]/channels/[id]', params: { slug: call.slug || call.placeId, id: call.channelId } });
}

/** The call on this instance, if any, and whether the screen shows it already. */
function useActiveCall(): { call: Call | null; onCallScreen: boolean } {
  const inst = useActiveInstance()?.id;
  const call = useCall();
  const pathname = usePathname();
  const mine = call && call.inst === inst ? call : null;
  return { call: mine, onCallScreen: !!mine && pathname.endsWith(`/channels/${mine.channelId}`) };
}

function statusLine(call: Call): { text: string; tone: 'success' | 'muted' | 'warning' } {
  if (call.status === 'joining') return { text: 'Connecting…', tone: 'muted' };
  if (call.status === 'reconnecting') return { text: 'Reconnecting…', tone: 'warning' };
  return { text: 'Voice connected', tone: 'success' };
}

/** Bottom of the wide sidebar while in a call, so the call survives navigation. */
export function SidebarCallPanel() {
  const theme = useTheme();
  const c = theme.colors;
  const { call } = useActiveCall();
  if (!call) return null;
  const line = statusLine(call);
  return (
    <View style={{ gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: c.hairline }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLiveRegion="polite">
          <Icon name="volume" size={16} color={line.tone === 'success' ? c.accentGreen : line.tone === 'warning' ? c.accentYellow : c.mute} />
          <Text variant="bodySmStrong" tone={line.tone}>
            {line.text}
          </Text>
        </View>
        {call.status === 'connected' ? <QualityBars quality={call.quality} /> : null}
      </View>
      <Pressable accessibilityRole="link" accessibilityLabel={`Open the call in ${call.channelName}`} onPress={() => openCall(call)}>
        <Text variant="captionMd" tone="muted" numberOfLines={1}>
          {call.placeName ? `${call.channelName} · ${call.placeName}` : call.channelName}
        </Text>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <CallControl size={36} icon={call.selfMute || !call.canSpeak ? 'micOff' : 'mic'} label={call.selfMute ? 'Unmute' : 'Mute'} state={call.selfMute || !call.canSpeak ? 'off' : undefined} onPress={() => setSelfMute(!call.selfMute)} />
        <CallControl size={36} icon="headphones" label={call.selfDeaf ? 'Undeafen' : 'Deafen'} state={call.selfDeaf || call.serverDeaf ? 'off' : undefined} onPress={() => setSelfDeaf(!call.selfDeaf)} />
        <View style={{ flex: 1 }} />
        <LeaveControl compact size={36} onPress={() => void leaveVoice()} />
      </View>
    </View>
  );
}

/** A thin bar above the tab bar (or under wide screens without a sidebar) while browsing during a call. */
export function CallMiniBar() {
  const theme = useTheme();
  const c = theme.colors;
  const myId = useSession()?.userId;
  const { call, onCallScreen } = useActiveCall();
  const states = useVoiceStates(call?.placeId).data;
  const speaking = useVoice((s) => s.speaking);
  if (!call || onCallScreen) return null;
  const here = voiceStatesByChannel(states ?? [])[call.channelId] ?? [];
  const talker = here.find((s) => speaking[s.user_id] && s.user_id !== myId) ?? here.find((s) => speaking[s.user_id]);
  const name = talker ? (talker.user_id === myId ? 'You are' : `${talker.user?.display_name || talker.user?.username} is`) : null;
  const line = call.status === 'connected' ? `${here.length || 1} in call${name ? ` · ${name} talking` : ''}` : statusLine(call).text;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`In a call in ${call.channelName}. Open the call`}
      onPress={() => openCall(call)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, paddingHorizontal: 16, backgroundColor: pressed ? c.surfaceCard : c.surfaceElevated, borderTopWidth: 1, borderTopColor: c.hairline })}
    >
      {talker ? (
        <View style={{ borderRadius: 999, borderWidth: 1, borderColor: c.accentGreen }}>
          <Avatar name={talker.user?.display_name || talker.user?.username || '?'} uri={talker.user?.avatar_url} size={32} />
        </View>
      ) : (
        <View style={{ width: 34, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceCard }}>
          <Icon name="volume" size={16} color={c.mute} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodySmStrong" tone="onDark" numberOfLines={1}>
          {call.channelName}
        </Text>
        <Text variant="captionMd" tone={call.status === 'reconnecting' ? 'warning' : 'muted'} numberOfLines={1}>
          {line}
        </Text>
      </View>
      <CallControl size={36} icon={call.selfMute || !call.canSpeak ? 'micOff' : 'mic'} label={call.selfMute ? 'Unmute' : 'Mute'} state={call.selfMute || !call.canSpeak ? 'off' : undefined} onPress={() => setSelfMute(!call.selfMute)} />
      <LeaveControl compact size={36} onPress={() => void leaveVoice()} />
    </Pressable>
  );
}
