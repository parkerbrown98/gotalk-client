import { bindingLabels, callDuration, gridColumns, micStatus, orderTiles, qualityLook, voiceStatesByChannel, type CallQuality } from '@gotalk/core';
import { Avatar, Button, CSS_EASE_OUT, Dialog, hoverTransition, Icon, Keycap, ListCard, ListRow, motion, Notice, Stack, Text, useTheme, type IconName, type PressState } from '@gotalk/ui';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, View, type GestureResponderEvent, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChannelMenu, useChannelMenu } from '@/components/channel-menu';
import { BarButton, TopBar } from '@/components/chat-screen';
import { MenuItem, MenuPopover, MenuSeparator, type Anchor } from '@/components/menu';
import { VideoSurface } from '@/components/video-surface';
import { VoiceSettingsDialog } from '@/components/voice-settings';
import { useInstanceInfo } from '@/lib/api';
import { useSession } from '@/lib/auth';
import type { Channel } from '@/lib/chat';
import { isDesktop } from '@/lib/desktop';
import { failureMessage } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';
import { goBack, useWide } from '@/lib/layout';
import { useChannelAccess, useChannels, usePlace } from '@/lib/places';
import {
  dismissVoiceNotice,
  flipCamera,
  joinVoice,
  leaveVoice,
  resumeAudio,
  setCamera,
  setScreenShare,
  setSelfDeaf,
  setSelfMute,
  useCall,
  useVoice,
  useVoiceModeration,
  useVoiceStates,
  voicePlatform,
  voiceStore,
  type Call,
  type VoiceState,
} from '@/lib/voice';
import { useVoiceSettings } from '@/lib/voice-settings';

// ---- Small pieces shared with the call bars ----

/** A square call control (the mockup's `.ctl`): red icon while it cuts you off, lifted while it is on. */
export function CallControl({ icon, label, state, size = 44, disabled, onPress }: { icon: IconName; label: string; state?: 'off' | 'on'; size?: number; disabled?: boolean; onPress: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: state !== undefined, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => ({
        ...hoverTransition,
        width: size,
        height: size,
        borderRadius: theme.radii.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: state === 'on' ? c.hairlineStrong : 'transparent',
        backgroundColor: state === 'on' || pressed || hovered ? c.surfaceCard : c.surfaceElevated,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Icon name={icon} size={size >= 44 ? 20 : 18} color={state === 'off' ? c.accentRed : c.onDark} />
    </Pressable>
  );
}

/** Leave the call: a red label beside the icon, or the icon alone where space is short. */
export function LeaveControl({ compact, size = 44, onPress }: { compact?: boolean; size?: number; onPress: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Leave the call"
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => ({
        ...hoverTransition,
        height: size,
        minWidth: size,
        paddingHorizontal: compact ? 0 : 16,
        borderRadius: theme.radii.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: pressed || hovered ? c.accentRedSoft : c.surfaceElevated,
      })}
    >
      <Icon name="phoneOff" size={compact ? 18 : 20} color={c.accentRed} />
      {compact ? null : (
        <Text variant="bodySmStrong" tone="danger">
          Leave
        </Text>
      )}
    </Pressable>
  );
}

/** Four rising bars for the connection; the label is for screen readers and the wide top bar. */
export function QualityBars({ quality, showLabel }: { quality: CallQuality; showLabel?: boolean }) {
  const theme = useTheme();
  const c = theme.colors;
  const look = qualityLook(quality);
  const lit = look.tone === 'success' ? c.accentGreen : look.tone === 'warning' ? c.accentYellow : c.accentRed;
  return (
    <View accessible accessibilityLabel={look.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12 }}>
        {[4, 7, 10, 12].map((h, i) => (
          <View key={h} style={{ width: 3, height: h, borderRadius: 1, backgroundColor: i < look.bars ? lit : c.stone }} />
        ))}
      </View>
      {showLabel ? (
        <Text variant="captionMd" tone="muted">
          {look.label}
        </Text>
      ) : null}
    </View>
  );
}

/** Ticks once a second while `active`. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function statusIcon(status: 'live' | 'muted' | 'deafened'): { name: IconName; off: boolean } {
  if (status === 'deafened') return { name: 'headphones', off: true };
  if (status === 'muted') return { name: 'micOff', off: true };
  return { name: 'mic', off: false };
}

// ---- Tiles ----

export interface Tile {
  userId: string;
  name: string;
  avatarUrl: string | null;
  joinedAt: string;
  isMe: boolean;
  state: VoiceState | null;
  status: 'live' | 'muted' | 'deafened';
  connected: boolean;
  camera: boolean;
  sharing: boolean;
}

/** Everyone in a channel; your own tile follows your controls at once rather than the server's echo. */
export function useTiles(here: readonly VoiceState[], call: Call | null, channelId: string): Tile[] {
  const session = useSession();
  const myId = session?.userId;
  const video = useVoice((s) => s.video);
  const inCall = !!call && call.channelId === channelId;
  const tiles: Tile[] = here.map((s) => {
    const mine = inCall && s.user_id === myId;
    return {
      userId: s.user_id,
      name: s.user?.display_name || s.user?.username || 'Someone',
      avatarUrl: s.user?.avatar_url ?? null,
      joinedAt: s.joined_at,
      isMe: s.user_id === myId,
      state: s,
      status: mine ? micStatus({ self_mute: call.selfMute, self_deaf: call.selfDeaf, mute: call.serverMute, deaf: call.serverDeaf, can_speak: call.canSpeak }) : micStatus(s),
      connected: mine ? call.status !== 'joining' : s.connected,
      camera: inCall ? !!video[s.user_id]?.camera : s.self_video,
      sharing: inCall ? !!video[s.user_id]?.screen : s.self_stream,
    };
  });
  // Until the server's echo arrives, you are still in your own call.
  if (inCall && myId && !tiles.some((t) => t.userId === myId)) {
    tiles.push({
      userId: myId,
      name: session?.displayName ?? 'You',
      avatarUrl: session?.avatarUrl ?? null,
      joinedAt: call.joinedAt ?? new Date().toISOString(),
      isMe: true,
      state: null,
      status: micStatus({ self_mute: call.selfMute, self_deaf: call.selfDeaf, mute: call.serverMute, deaf: call.serverDeaf, can_speak: call.canSpeak }),
      connected: call.status !== 'joining',
      camera: !!video[myId]?.camera,
      sharing: !!video[myId]?.screen,
    });
  }
  return orderTiles(tiles);
}

function NameRow({ tile, chip }: { tile: Tile; chip: boolean }) {
  const theme = useTheme();
  const c = theme.colors;
  const icon = statusIcon(tile.status);
  const content = (
    <>
      <Icon name={icon.name} size={14} color={icon.off ? c.accentRed : c.mute} />
      <Text variant="captionMd" tone="onDark" numberOfLines={1} style={{ flexShrink: 1 }}>
        {tile.isMe ? 'You' : tile.name}
      </Text>
      {tile.sharing ? <Icon name="monitor" size={14} color={c.mute} /> : null}
    </>
  );
  return (
    <View style={{ position: 'absolute', left: 10, right: 10, bottom: 8, flexDirection: 'row' }}>
      <View
        style={[
          { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
          chip ? { paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radii.full, backgroundColor: c.surfaceElevated } : null,
        ]}
      >
        {content}
      </View>
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** One person in a call: their camera or avatar, a green hairline while they talk, and their mic state. */
export function VoiceTile({ tile, speaking, avatarSize = 64, style, onPress }: { tile: Tile; speaking: boolean; avatarSize?: number; style?: ViewStyle; onPress?: (e: GestureResponderEvent) => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const track = useVoice((s) => (tile.camera ? s.video[tile.userId]?.camera : undefined));
  const label = `${tile.isMe ? 'You' : tile.name}${tile.status === 'live' ? '' : `, ${tile.status}`}${speaking ? ', talking' : ''}${tile.connected ? '' : ', connecting'}`;
  return (
    <AnimatedPressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${label}. Voice actions` : label}
      disabled={!onPress}
      onPress={onPress}
      style={[
        {
          minHeight: 0,
          borderRadius: theme.radii.lg,
          borderWidth: 1,
          borderColor: speaking ? c.accentGreen : c.hairline,
          backgroundColor: track ? c.stone : c.surface,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          opacity: tile.connected ? 1 : 0.5,
          // Keeps the avatar clear of the name row on short tiles.
          paddingBottom: track ? 0 : 20,
          // The talking ring fades rather than flickers as voice activity comes and goes.
          transitionProperty: 'borderColor',
          transitionDuration: motion.close,
          transitionTimingFunction: CSS_EASE_OUT,
        },
        style,
      ]}
    >
      {track ? <VideoSurface track={track} fit="cover" mirror={tile.isMe} /> : <Avatar name={tile.name} uri={tile.avatarUrl} size={avatarSize} />}
      <NameRow tile={tile} chip={!!track} />
    </AnimatedPressable>
  );
}

/** Tiles in an even grid; the last row keeps the same tile size. */
function TileGrid({ tiles, columns, speaking, rowHeight, onTilePress }: { tiles: Tile[]; columns: number; speaking: Record<string, boolean>; rowHeight?: number; onTilePress?: (t: Tile, e: GestureResponderEvent) => void }) {
  const rows: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += columns) rows.push(tiles.slice(i, i + columns));
  return (
    <>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 12, ...(rowHeight ? { height: rowHeight } : { flex: 1 }) }}>
          {row.map((t) => (
            <VoiceTile key={t.userId} tile={t} speaking={!!speaking[t.userId]} style={{ flex: 1 }} onPress={onTilePress && !t.isMe && t.state ? (e) => onTilePress(t, e) : undefined} />
          ))}
          {Array.from({ length: columns - row.length }, (_, i) => (
            <View key={`pad-${i}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </>
  );
}

/** A shared screen on the stage, with fit and full screen on web and desktop. */
function ShareStage({ tile, style }: { tile: Tile; style?: ViewStyle }) {
  const theme = useTheme();
  const c = theme.colors;
  const track = useVoice((s) => s.video[tile.userId]?.screen);
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');
  const el = useRef<HTMLElement | null>(null);
  const onElement = useCallback((e: HTMLElement | null) => void (el.current = e), []);
  if (!track) return null;
  return (
    <View style={[{ borderRadius: theme.radii.xl, borderWidth: 1, borderColor: c.hairline, backgroundColor: c.canvas, overflow: 'hidden' }, style]}>
      <VideoSurface track={track} fit={fit} onElement={onElement} />
      <View style={{ position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingLeft: 6, paddingRight: 10, borderRadius: theme.radii.full, backgroundColor: c.surfaceElevated, borderWidth: 1, borderColor: c.hairlineStrong }}>
        <Avatar name={tile.name} uri={tile.avatarUrl} size={24} />
        <Text variant="captionMd" tone="onDark">
          {tile.isMe ? 'You are sharing your screen' : `${tile.name} is sharing a screen`}
        </Text>
      </View>
      {Platform.OS === 'web' ? (
        <View style={{ position: 'absolute', right: 12, top: 12, flexDirection: 'row', gap: 8 }}>
          <Button size="sm" variant="tertiary" title={fit === 'contain' ? 'Fill window' : 'Fit to window'} onPress={() => setFit(fit === 'contain' ? 'cover' : 'contain')} />
          <Button size="sm" variant="tertiary" title="Full screen" onPress={() => void el.current?.requestFullscreen?.().catch(() => undefined)} />
        </View>
      ) : null}
    </View>
  );
}

// ---- Moderator menu ----

function useModerator(channel: Channel, slug: string, placeId: string | undefined) {
  const access = useChannelAccess(channel);
  const all = useChannels(slug).data ?? [];
  const mod = useVoiceModeration(placeId);
  const [target, setTarget] = useState<{ tile: Tile; anchor?: Anchor } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const canMute = access.can('MUTE_MEMBERS');
  const canMove = access.can('MOVE_MEMBERS');
  const elsewhere = all.filter((c) => c.kind === 'voice' && c.id !== channel.id);
  const open = (tile: Tile, e?: GestureResponderEvent) => {
    if (tile.isMe || !tile.state || (!canMute && !canMove)) return;
    setProblem(null);
    const anchor = e && Platform.OS === 'web' ? { left: e.nativeEvent.pageX, top: e.nativeEvent.pageY } : undefined;
    setTarget({ tile, anchor });
  };
  const run = (work: () => Promise<unknown>, fallback: string) => {
    setTarget(null);
    work().catch((e) => setProblem(failureMessage(e, fallback)));
  };
  return { canModerate: canMute || canMove, canMute, canMove, elsewhere, target, setTarget, open, run, mod, problem, setProblem };
}

function ModeratorMenu({ m, wide }: { m: ReturnType<typeof useModerator>; wide: boolean }) {
  const theme = useTheme();
  const [moving, setMoving] = useState(false);
  const t = m.target?.tile;
  const s = t?.state;
  const close = () => {
    setMoving(false);
    m.setTarget(null);
  };
  const body =
    t && s ? (
      moving ? (
        <>
          <MenuItem label="Back" icon="chevronLeft" onPress={() => setMoving(false)} />
          <MenuSeparator />
          {m.elsewhere.length === 0 ? (
            <Text variant="captionMd" tone="muted" style={{ padding: 10 }}>
              There is no other voice channel to move them to.
            </Text>
          ) : (
            m.elsewhere.map((ch) => (
              <MenuItem
                key={ch.id}
                label={ch.name}
                icon="volume"
                onPress={() => {
                  setMoving(false);
                  m.run(() => m.mod.move(t.userId, ch.id), `Could not move ${t.name}.`);
                }}
              />
            ))
          )}
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Avatar name={t.name} uri={t.avatarUrl} size={24} />
            <Text variant="bodySmStrong" tone="onDark" numberOfLines={1} style={{ flex: 1 }}>
              {t.name}
            </Text>
          </View>
          <MenuSeparator />
          {m.canMute ? (
            <>
              <MenuItem label={s.mute ? 'Unmute for everyone' : 'Mute for everyone'} icon={s.mute ? 'mic' : 'micOff'} onPress={() => m.run(() => m.mod.setMute(t.userId, !s.mute), `Could not change ${t.name}'s mute.`)} />
              <MenuItem label={s.deaf ? 'Undeafen for everyone' : 'Deafen for everyone'} icon="headphones" onPress={() => m.run(() => m.mod.setDeaf(t.userId, !s.deaf), `Could not change ${t.name}'s deafen.`)} />
            </>
          ) : null}
          {m.canMove ? (
            <>
              <MenuItem label="Move to…" icon="volume" onPress={() => setMoving(true)} />
              <MenuSeparator />
              <MenuItem label="Disconnect" icon="phoneOff" danger onPress={() => m.run(() => m.mod.disconnect(t.userId), `Could not disconnect ${t.name}.`)} />
            </>
          ) : null}
        </>
      )
    ) : null;
  if (wide && m.target?.anchor) {
    return (
      <MenuPopover visible={!!m.target} onClose={close} anchor={m.target.anchor} width={232}>
        {body}
      </MenuPopover>
    );
  }
  return (
    <Dialog visible={!!m.target} onClose={close}>
      <View style={{ gap: theme.space.xxs }}>{body}</View>
    </Dialog>
  );
}

// ---- Notices about the call ----

function CallNotices({ channelId }: { channelId: string }) {
  const theme = useTheme();
  const notice = useVoice((s) => s.notice);
  const blocked = useVoice((s) => s.audioBlocked && s.call?.channelId === channelId);
  const shown = notice && (notice.channelId === channelId || notice.channelId === null) ? notice : null;
  if (!shown && !blocked) return null;
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 12, gap: 8 }}>
      {blocked ? (
        <Pressable accessibilityRole="button" onPress={resumeAudio}>
          <Notice tone="info" icon="volume" title={isDesktop ? 'Call audio is paused.' : 'Your browser paused call audio.'}>
            Click here to hear the call.
          </Notice>
        </Pressable>
      ) : null}
      {shown ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.sm }}>
          <View style={{ flex: 1 }}>
            <Notice tone={shown.tone}>{shown.text}</Notice>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} onPress={dismissVoiceNotice} style={{ paddingTop: 12 }}>
            <Icon name="x" size={16} color={theme.colors.mute} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

// ---- The voice channel screen ----

/** Before joining: who is here, mute and deafen for joining, and Join. */
function Lobby({ channel, here, tiles, wide, placeId, placeName, slug }: { channel: Channel; here: VoiceState[]; tiles: Tile[]; wide: boolean; placeId: string; placeName: string; slug: string }) {
  const theme = useTheme();
  const access = useChannelAccess(channel);
  const info = useInstanceInfo().data;
  const settings = useVoiceSettings();
  const call = useCall();
  const speaking = useVoice((s) => s.speaking);
  const insets = useSafeAreaInsets();
  const enabled = info?.features.voice !== false;
  const allowed = access.can('CONNECT_VOICE');
  const full = channel.user_limit > 0 && here.length >= channel.user_limit && !access.can('MOVE_MEMBERS');
  const muted = settings.joinMuted || settings.joinDeafened;
  const caption = settings.joinDeafened
    ? 'You join deafened: you will not hear anyone until you undeafen.'
    : muted
      ? 'You join muted.'
      : 'You join with your microphone on. Mute first to join muted.';
  const join = () => void joinVoice({ channelId: channel.id, channelName: channel.name, placeId, placeName, slug });

  const people =
    tiles.length === 0 ? (
      <Text variant="bodySm" tone="muted">
        No one is here yet.
      </Text>
    ) : wide ? (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, maxWidth: 720 }}>
        {tiles.map((t) => (
          <VoiceTile key={t.userId} tile={t} speaking={!!speaking[t.userId]} style={{ width: 132, height: 108 }} />
        ))}
      </View>
    ) : (
      <View style={{ alignSelf: 'stretch', gap: 12 }}>
        <TileGrid tiles={tiles} columns={2} speaking={speaking} rowHeight={150} />
      </View>
    );

  const blocked = !enabled ? (
    <Notice tone="info" title="Voice is not available on this instance.">
      It has no media server for voice and video. The administrator can set one up.
    </Notice>
  ) : !allowed ? (
    <Notice tone="info" title="You can't join this voice channel.">
      Ask a moderator for the Connect permission.
    </Notice>
  ) : null;

  const controls = (
    <>
      <CallControl icon={muted ? 'micOff' : 'mic'} label={muted ? 'Join unmuted' : 'Join muted'} state={muted ? 'off' : undefined} onPress={() => setSelfMute(!muted)} />
      <CallControl icon="headphones" label={settings.joinDeafened ? 'Join undeafened' : 'Join deafened'} state={settings.joinDeafened ? 'off' : undefined} onPress={() => setSelfDeaf(!settings.joinDeafened)} />
    </>
  );
  const joinButton = full ? <Button title="This channel is full" disabled style={wide ? undefined : { flex: 1 }} /> : <Button title="Join voice" onPress={join} style={wide ? undefined : { flex: 1 }} />;
  const switching = call && call.channelId !== channel.id ? `Joining moves you out of ${call.channelName}.` : null;

  if (wide) {
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 }}>
        {blocked ?? (
          <>
            {people}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {controls}
              {joinButton}
            </View>
            <Text variant="captionMd" tone="muted" style={{ textAlign: 'center' }}>
              {switching ?? caption}
            </Text>
          </>
        )}
      </ScrollView>
    );
  }
  return (
    <>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 16 }}>
        {blocked ?? (
          <>
            <Text variant="captionMd" tone="muted">
              {here.length === 0 ? 'Empty' : `${here.length} in call`}
            </Text>
            {people}
            <Text variant="captionMd" tone="muted" style={{ textAlign: 'center' }}>
              {switching ?? caption}
            </Text>
          </>
        )}
      </ScrollView>
      {blocked ? null : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12), borderTopWidth: 1, borderTopColor: theme.colors.hairline }}>
          {controls}
          {joinButton}
        </View>
      )}
    </>
  );
}

/** Push to talk's hint in the call bar, e.g. "Hold ⌥ Space to talk". */
function PushToTalkHint() {
  const settings = useVoiceSettings();
  const talking = useVoice((s) => !!s.call?.talking);
  if (settings.inputMode !== 'ptt' || voicePlatform.pushToTalk === 'none') return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text variant="captionMd" tone={talking ? 'success' : 'muted'}>
        {talking ? 'Talking' : 'Hold'}
      </Text>
      {talking ? null : (
        <>
          <View style={{ flexDirection: 'row', gap: 2 }}>
            {bindingLabels(settings.pushToTalk, voicePlatform.mac).map((k) => (
              <Keycap key={k}>{k}</Keycap>
            ))}
          </View>
          <Text variant="captionMd" tone="muted">
            to talk
          </Text>
        </>
      )}
    </View>
  );
}

function InCall({ call, tiles, wide, onTilePress, onSettings, onMore }: { call: Call; tiles: Tile[]; wide: boolean; onTilePress?: (t: Tile, e: GestureResponderEvent) => void; onSettings: () => void; onMore: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const speaking = useVoice((s) => s.speaking);
  const sharer = tiles.find((t) => t.sharing);
  const others = sharer ? tiles.filter((t) => t !== sharer || t.camera) : tiles;
  const connected = call.status !== 'joining';
  const micLabel = call.selfMute ? 'Unmute' : 'Mute';
  const mic = (
    <CallControl
      icon={call.selfMute || !call.canSpeak ? 'micOff' : 'mic'}
      label={call.canSpeak ? micLabel : 'A moderator muted you'}
      state={call.selfMute || !call.canSpeak ? 'off' : undefined}
      disabled={!call.canSpeak && !call.selfMute}
      onPress={() => setSelfMute(!call.selfMute)}
    />
  );
  const deaf = <CallControl icon="headphones" label={call.selfDeaf ? 'Undeafen' : 'Deafen'} state={call.selfDeaf || call.serverDeaf ? 'off' : undefined} onPress={() => setSelfDeaf(!call.selfDeaf)} />;
  const camera = call.canStream ? (
    <CallControl icon="video" label={call.selfVideo ? 'Turn camera off' : 'Turn camera on'} state={call.selfVideo ? 'on' : undefined} disabled={!connected} onPress={() => void setCamera(!call.selfVideo)} />
  ) : null;

  if (wide) {
    return (
      <>
        <View style={{ flex: 1, minHeight: 0, padding: 16, gap: 16, flexDirection: 'row' }}>
          {sharer ? (
            <>
              <ShareStage tile={sharer} style={{ flex: 1 }} />
              <ScrollView style={{ width: 260, flexGrow: 0 }} contentContainerStyle={{ gap: 12, flexGrow: 1 }}>
                {others.map((t) => (
                  <VoiceTile key={t.userId} tile={t} speaking={!!speaking[t.userId]} style={{ flex: 1, minHeight: 120 }} onPress={onTilePress && !t.isMe && t.state ? (e) => onTilePress(t, e) : undefined} />
                ))}
              </ScrollView>
            </>
          ) : (
            <View style={{ flex: 1, gap: 12 }}>
              <TileGrid tiles={tiles} columns={gridColumns(tiles.length, true)} speaking={speaking} onTilePress={onTilePress} />
            </View>
          )}
        </View>
        <View style={{ height: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: theme.colors.hairline, backgroundColor: theme.colors.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {mic}
            {deaf}
            {camera}
            {call.canStream && voicePlatform.shareScreen ? (
              <CallControl icon="monitor" label={call.selfStream ? 'Stop sharing your screen' : 'Share your screen'} state={call.selfStream ? 'on' : undefined} disabled={!connected} onPress={() => void setScreenShare(!call.selfStream)} />
            ) : null}
            <CallControl icon="settings" label="Voice settings" onPress={onSettings} />
          </View>
          <PushToTalkHint />
          <LeaveControl onPress={() => void leaveVoice()} />
        </View>
      </>
    );
  }
  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {sharer ? <ShareStage tile={sharer} style={{ aspectRatio: 16 / 9 }} /> : null}
        <TileGrid tiles={others} columns={gridColumns(others.length, false)} speaking={speaking} rowHeight={150} onTilePress={onTilePress} />
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12), borderTopWidth: 1, borderTopColor: theme.colors.hairline }}>
        {mic}
        {deaf}
        {camera}
        <CallControl icon="more" label="More call options" onPress={onMore} />
        <LeaveControl compact onPress={() => void leaveVoice()} />
      </View>
    </>
  );
}

/** A voice channel: who is here and Join before you join, then the call itself. */
export function VoiceChannelScreen({ channel, slug }: { channel: Channel; slug: string }) {
  const theme = useTheme();
  const c = theme.colors;
  const wide = useWide();
  const insets = useSafeAreaInsets();
  const inst = useActiveInstance()?.id;
  const place = usePlace(slug).data;
  const all = useChannels(slug).data;
  const placeId = channel.place_id ?? place?.id;
  const states = useVoiceStates(placeId).data;
  const here = voiceStatesByChannel(states ?? [])[channel.id] ?? [];
  const call = useCall();
  const mine = call && call.inst === inst && call.channelId === channel.id ? call : null;
  const tiles = useTiles(here, mine, channel.id);
  const now = useNow(!!mine);
  const moved = useVoice((s) => s.moved);
  const menu = useChannelMenu(channel, all ?? [], slug, () => router.replace({ pathname: '/places/[slug]', params: { slug } }));
  const mod = useModerator(channel, slug, placeId);
  const moreRef = useRef<View>(null);
  const [menuAt, setMenuAt] = useState<{ left: number; top: number } | null>(null);
  const [sheet, setSheet] = useState<'channel' | 'call' | 'people' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const placeName = place?.name ?? '';
  const count = Math.max(here.length, tiles.length);

  // A moderator moved this call: follow it to the new channel.
  useEffect(() => {
    if (moved?.from !== channel.id) return;
    voiceStore.setState({ moved: null });
    router.replace({ pathname: '/places/[slug]/channels/[id]', params: { slug, id: moved.to } });
  }, [moved, channel.id, slug]);

  const status = mine ? (mine.status === 'joining' ? 'Connecting…' : mine.status === 'reconnecting' ? 'Reconnecting…' : mine.joinedAt ? callDuration(mine.joinedAt, now) : '') : '';
  const subtitle = `${count === 0 ? 'Empty' : `${count} in call`}${status ? ` · ${status}` : ''}`;
  const back = () => goBack({ pathname: '/places/[slug]', params: { slug } });

  const body = mine ? (
    <InCall call={mine} tiles={tiles} wide={wide} onTilePress={mod.canModerate ? mod.open : undefined} onSettings={() => setSettingsOpen(true)} onMore={() => setSheet('call')} />
  ) : (
    <Lobby channel={channel} here={here} tiles={tiles} wide={wide} placeId={placeId ?? ''} placeName={placeName} slug={slug} />
  );

  const callSheetItems: { key: string; label: string; icon: IconName; onPress: () => void }[] = [];
  if (mine?.selfVideo && voicePlatform.flipCamera) callSheetItems.push({ key: 'flip', label: 'Flip camera', icon: 'video', onPress: () => void flipCamera() });
  if (mine?.canStream && voicePlatform.shareScreen) callSheetItems.push({ key: 'share', label: mine.selfStream ? 'Stop sharing your screen' : 'Share your screen', icon: 'monitor', onPress: () => void setScreenShare(!mine.selfStream) });
  callSheetItems.push({ key: 'settings', label: 'Voice settings', icon: 'settings', onPress: () => setSettingsOpen(true) });

  const problems = (
    <>
      <CallNotices channelId={channel.id} />
      {mod.problem || menu.problem ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <Notice tone="danger">{mod.problem ?? menu.problem}</Notice>
        </View>
      ) : null}
    </>
  );

  const shared = (
    <>
      <ModeratorMenu m={mod} wide={wide} />
      <ChannelMenu items={menu.items} visible={!!menuAt} onClose={() => setMenuAt(null)} anchor={menuAt ?? undefined} />
      <ChannelMenu items={menu.items} visible={sheet === 'channel'} onClose={() => setSheet(null)} />
      <SheetList visible={sheet === 'call'} onClose={() => setSheet(null)} items={callSheetItems} />
      <PeopleSheet visible={sheet === 'people'} onClose={() => setSheet(null)} tiles={tiles} onPick={mod.canModerate ? (t) => mod.open(t) : undefined} />
      <VoiceSettingsDialog visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {menu.dialogs}
    </>
  );

  if (wide) {
    return (
      <View style={{ flex: 1, backgroundColor: c.canvas }}>
        <TopBar
          end={
            <>
              {mine && mine.status !== 'joining' ? <QualityBars quality={mine.quality} showLabel /> : null}
              {menu.items.length > 0 ? (
                <View ref={moreRef}>
                  <BarButton icon="more" label="Channel actions" onPress={() => moreRef.current?.measureInWindow((x, y, w, h) => setMenuAt({ left: x + w - 232, top: y + h + 8 }))} />
                </View>
              ) : null}
            </>
          }
        >
          <Icon name="volume" size={16} color={c.mute} />
          <Text variant="bodyStrong" tone="onDark" accessibilityRole="header" numberOfLines={1}>
            {channel.name}
          </Text>
          <Text variant="captionMd" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        </TopBar>
        {problems}
        {body}
        {shared}
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: c.canvas, paddingTop: insets.top }}>
      <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.space.lg, borderBottomWidth: 1, borderBottomColor: c.hairline }}>
        <View style={{ width: 72, alignItems: 'flex-start' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={mine ? 'Minimize the call' : 'Back'} hitSlop={12} onPress={back}>
            <Icon name={mine ? 'chevronDown' : 'chevronLeft'} size={20} color={c.onDark} />
          </Pressable>
        </View>
        <Text variant="bodySmStrong" tone="onDark" accessibilityRole="header" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
          {channel.name}
        </Text>
        <View style={{ width: 72, flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
          {mine ? <BarButton icon="users" label="People in the call" size={20} onPress={() => setSheet('people')} /> : null}
          {menu.items.length > 0 ? <BarButton icon="more" label="Channel actions" size={20} onPress={() => setSheet('channel')} /> : null}
        </View>
      </View>
      {mine ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 }}>
          <Text variant="captionMd" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {placeName ? `${placeName} · ${status}` : status}
          </Text>
          {mine.status !== 'joining' ? <QualityBars quality={mine.quality} /> : null}
        </View>
      ) : null}
      {problems}
      {body}
      {shared}
    </View>
  );
}

function SheetList({ visible, onClose, items }: { visible: boolean; onClose: () => void; items: { key: string; label: string; icon: IconName; onPress: () => void }[] }) {
  return (
    <Dialog visible={visible} onClose={onClose}>
      <ListCard style={{ borderWidth: 0, backgroundColor: 'transparent' }}>
        {items.map((item) => (
          <ListRow
            key={item.key}
            icon={item.icon}
            title={item.label}
            onPress={() => {
              onClose();
              item.onPress();
            }}
          />
        ))}
      </ListCard>
    </Dialog>
  );
}

/** Phones: everyone in the call as a list; moderators pick someone for the voice actions. */
function PeopleSheet({ visible, onClose, tiles, onPick }: { visible: boolean; onClose: () => void; tiles: Tile[]; onPick?: (t: Tile) => void }) {
  const theme = useTheme();
  const speaking = useVoice((s) => s.speaking);
  return (
    <Dialog visible={visible} onClose={onClose}>
      <Text variant="headingSm" accessibilityRole="header">
        In the call
      </Text>
      <Stack gap="xs">
        {tiles.map((t) => {
          const icon = statusIcon(t.status);
          const row: ReactNode = (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
              <View style={{ borderRadius: 999, borderWidth: 2, borderColor: speaking[t.userId] ? theme.colors.accentGreen : 'transparent' }}>
                <Avatar name={t.name} uri={t.avatarUrl} size={32} />
              </View>
              <Text variant="bodySm" tone="onDark" style={{ flex: 1 }} numberOfLines={1}>
                {t.isMe ? 'You' : t.name}
              </Text>
              <Icon name={icon.name} size={16} color={icon.off ? theme.colors.accentRed : theme.colors.mute} />
            </View>
          );
          return onPick && !t.isMe ? (
            <Pressable
              key={t.userId}
              accessibilityRole="button"
              accessibilityLabel={`${t.name}. Voice actions`}
              onPress={() => {
                onClose();
                setTimeout(() => onPick(t), 250);
              }}
            >
              {row}
            </Pressable>
          ) : (
            <View key={t.userId}>{row}</View>
          );
        })}
      </Stack>
    </Dialog>
  );
}
