import { BAN_DURATIONS, REPORT_REASONS, TIMEOUT_DURATIONS, canManageRole, isTimedOut, sortRoles, timeLeft, type ReportReason } from '@gotalk/core';
import { Avatar, Badge, Button, Checkbox, Dialog, ListCard, ListRow, Notice, PillTabs, RadioOptions, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, View, useWindowDimensions } from 'react-native';

import { RoleDot } from '@/components/roles';
import { useSession } from '@/lib/auth';
import { failureMessage } from '@/lib/failure';
import { useModerationActions, usePlaceMember, useRoles, useStanding, type Member, type ReportTarget, type Role } from '@/lib/moderation';
import { usePlace, usePlaceAccess } from '@/lib/places';

/** Counts openings, so a dialog's form starts fresh each time yet keeps its content while fading out. */
function useOpenings(visible: boolean): number {
  const [opened, setOpened] = useState({ visible, count: visible ? 1 : 0 });
  if (visible !== opened.visible) setOpened({ visible, count: opened.count + (visible ? 1 : 0) });
  return opened.count;
}

function Actions({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: theme.space.sm }}>{children}</View>;
}

// Reporting -------------------------------------------------------------------

/**
 * Reporting a post, chat message or member to the place's moderators. `place` is the place's slug or
 * ID; `subject` names what is reported in the title ("this message", "Tom R.").
 */
export function ReportDialog({ place, target, subject, visible, onClose }: { place: string | null | undefined; target: ReportTarget | null; subject: string; visible: boolean; onClose: () => void }) {
  const openings = useOpenings(visible);
  return (
    <Dialog visible={visible} onClose={onClose}>
      {openings > 0 && place && target ? <ReportForm key={openings} place={place} target={target} subject={subject} onClose={onClose} /> : null}
    </Dialog>
  );
}

function ReportForm({ place, target, subject, onClose }: { place: string; target: ReportTarget; subject: string; onClose: () => void }) {
  const placeName = usePlace(place).data?.name;
  const actions = useModerationActions(place);
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const what = target.kind === 'message' ? 'the message as it is now' : target.kind === 'post' ? 'the post as it is now' : 'who they are';

  if (sent) {
    return (
      <>
        <Text variant="headingMd" accessibilityRole="header">
          Report sent
        </Text>
        <Notice tone="success">The moderators will take a look. You won&apos;t be told who handles it.</Notice>
        <Actions>
          <Button title="Done" onPress={onClose} />
        </Actions>
      </>
    );
  }

  return (
    <>
      <Text variant="headingMd" accessibilityRole="header">
        Report {subject}
      </Text>
      <Text variant="bodySm" tone="muted">
        The moderators of {placeName ?? 'this place'} see the report, {what}, and who sent it.
      </Text>
      <RadioOptions options={REPORT_REASONS} value={reason as ReportReason} onChange={setReason} />
      <TextField
        label="Details (optional)"
        value={details}
        onChangeText={setDetails}
        multiline
        maxLength={2000}
        placeholder={reason === 'other' ? 'What is wrong?' : 'Anything the moderators should know'}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Actions>
        <Button title="Cancel" variant="tertiary" onPress={onClose} />
        <Button
          title="Send report"
          loading={busy}
          disabled={!reason || (reason === 'other' && !details.trim())}
          onPress={async () => {
            if (!reason) return;
            setBusy(true);
            setError(null);
            try {
              await actions.report(target, reason, details);
              setSent(true);
            } catch (e) {
              setError(failureMessage(e, 'Could not send the report. Try again.'));
            } finally {
              setBusy(false);
            }
          }}
        />
      </Actions>
    </>
  );
}

// Members ---------------------------------------------------------------------

/** The position of a member's highest role; 0 when they only have @everyone. */
export function topPosition(member: Pick<Member, 'role_ids'>, roles: readonly Role[]): number {
  const ids = new Set(member.role_ids ?? []);
  return roles.reduce((top, r) => (ids.has(r.id) && r.position > top ? r.position : top), 0);
}

export function memberName(member: Pick<Member, 'nickname' | 'user'>): string {
  return member.nickname || member.user.display_name;
}

/** Role dots and names for a member, highest first. */
export function MemberRoles({ member, roles, limit = 3 }: { member: Pick<Member, 'role_ids'>; roles: readonly Role[]; limit?: number }) {
  const theme = useTheme();
  const ids = new Set(member.role_ids ?? []);
  const mine = sortRoles(roles).filter((r) => ids.has(r.id));
  if (mine.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: theme.space.md, rowGap: 2 }}>
      {mine.slice(0, limit).map((r) => (
        <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <RoleDot color={r.color} size={8} />
          <Text variant="captionMd" tone="muted">
            {r.name}
          </Text>
        </View>
      ))}
      {mine.length > limit ? (
        <Text variant="captionMd" tone="muted">
          +{mine.length - limit}
        </Text>
      ) : null}
    </View>
  );
}

type Pane = 'menu' | 'warn' | 'timeout' | 'kick' | 'ban';

/**
 * What a moderator may do to one member: roles, nickname, warn, time out, kick, ban, and their
 * moderation history. Each part appears only with its permission; the server checks rank as well.
 */
export function MemberModerationDialog({ slug, userId, visible, onClose }: { slug: string; userId: string | null; visible: boolean; onClose: () => void }) {
  const openings = useOpenings(visible);
  const { height } = useWindowDimensions();
  return (
    <Dialog visible={visible} onClose={onClose}>
      <ScrollView style={{ maxHeight: height * 0.8 }} contentContainerStyle={{ gap: 16 }} keyboardShouldPersistTaps="handled">
        {openings > 0 && userId ? <MemberModeration key={`${openings}-${userId}`} slug={slug} userId={userId} onClose={onClose} /> : null}
      </ScrollView>
    </Dialog>
  );
}

function MemberModeration({ slug, userId, onClose }: { slug: string; userId: string; onClose: () => void }) {
  const theme = useTheme();
  const place = usePlace(slug).data;
  const access = usePlaceAccess(place);
  const member = usePlaceMember(slug, userId);
  const roles = useRoles(slug).data ?? [];
  const standing = useStanding(slug).data;
  const myId = useSession()?.userId;
  const [view, setView] = useState<Pane>('menu');

  if (member.isPending) return <ActivityIndicator />;
  if (!member.data) {
    return (
      <>
        <Notice tone="warning" title="Not a member any more.">
          They may have left, or been kicked or banned.
        </Notice>
        <Actions>
          <Button title="Close" variant="tertiary" onPress={onClose} />
        </Actions>
      </>
    );
  }
  const m = member.data;
  const name = memberName(m);
  const self = m.user.id === myId;
  const owner = !!place && m.user.id === place.owner_id;
  const outranked = !!standing && !standing.is_owner && topPosition(m, roles) >= standing.top_position;
  const blocked = self ? 'This is you.' : owner ? 'The owner of the place cannot be moderated.' : outranked ? `${name} ranks at or above your highest role.` : null;
  const timedOut = isTimedOut(m);

  const header = (
    <View style={{ flexDirection: 'row', gap: theme.space.md, alignItems: 'center' }}>
      <Avatar name={m.user.display_name} uri={m.user.avatar_url} size={48} />
      <Stack gap="none" style={{ flex: 1 }}>
        <Text variant="headingSm">{name}</Text>
        <Text variant="captionMd" tone="muted">
          @{m.user.username} · member since {new Date(m.joined_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
        </Text>
        {timedOut ? (
          <Text variant="captionMd" tone="warning">
            Timed out · {timeLeft(m.timeout_until)}
          </Text>
        ) : null}
      </Stack>
      {m.user.bot ? <Badge label="Bot" /> : null}
      {owner ? <Badge label="Owner" /> : null}
    </View>
  );

  if (view === 'warn') return <WarnForm slug={slug} member={m} header={header} onBack={() => setView('menu')} onDone={onClose} />;
  if (view === 'timeout') return <TimeoutForm slug={slug} member={m} header={header} onBack={() => setView('menu')} onDone={() => setView('menu')} />;
  if (view === 'kick') return <RemoveForm mode="kick" slug={slug} member={m} placeName={place?.name ?? 'this place'} onBack={() => setView('menu')} onDone={onClose} />;
  if (view === 'ban') return <RemoveForm mode="ban" slug={slug} member={m} placeName={place?.name ?? 'this place'} onBack={() => setView('menu')} onDone={onClose} />;

  const rows: { key: string; title: string; icon: 'alert' | 'clock' | 'logout' | 'ban'; danger?: boolean; onPress: () => void }[] = [];
  if (!blocked && access.can('MODERATE_MEMBERS')) {
    rows.push({ key: 'warn', title: 'Warn', icon: 'alert', onPress: () => setView('warn') });
    rows.push({ key: 'timeout', title: timedOut ? 'Change timeout' : 'Time out', icon: 'clock', onPress: () => setView('timeout') });
  }
  if (!blocked && access.can('KICK_MEMBERS')) rows.push({ key: 'kick', title: 'Kick', icon: 'logout', danger: true, onPress: () => setView('kick') });
  if (!blocked && access.can('BAN_MEMBERS')) rows.push({ key: 'ban', title: 'Ban', icon: 'ban', danger: true, onPress: () => setView('ban') });

  return (
    <>
      {header}
      {blocked && !self ? <Notice tone="info">{blocked}</Notice> : null}
      {access.can('MANAGE_ROLES') ? <RoleToggles slug={slug} member={m} roles={roles} standing={standing} locked={outranked} /> : null}
      {access.can('MANAGE_NICKNAMES') && (!blocked || self) ? <NicknameForm slug={slug} member={m} /> : null}
      {timedOut && !blocked && access.can('MODERATE_MEMBERS') ? <ClearTimeout slug={slug} member={m} /> : null}
      {rows.length > 0 || access.can('VIEW_AUDIT_LOG') ? (
        <ListCard>
          {rows.map((r) => (
            <ListRow key={r.key} icon={r.icon} title={r.title} tone={r.danger ? 'danger' : 'default'} chevron onPress={r.onPress} />
          ))}
          {access.can('VIEW_AUDIT_LOG') ? (
            <ListRow
              icon="clock"
              title="Moderation history"
              chevron
              onPress={() => {
                onClose();
                router.push({ pathname: '/places/[slug]/settings/audit-log', params: { slug, target: m.user.id, name } });
              }}
            />
          ) : null}
        </ListCard>
      ) : null}
      <Actions>
        <Button title="Close" variant="tertiary" onPress={onClose} />
      </Actions>
    </>
  );
}

function RoleToggles({ slug, member, roles, standing, locked }: { slug: string; member: Member; roles: Role[]; standing: ReturnType<typeof useStanding>['data']; locked: boolean }) {
  const actions = useModerationActions(slug);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const has = new Set(member.role_ids ?? []);
  const list = sortRoles(roles).filter((r) => !r.is_default);
  if (list.length === 0) return null;
  return (
    <Stack gap="sm">
      <Text variant="bodySmStrong" tone="onDark">
        Roles
      </Text>
      {list.map((r) => {
        const manageable = !locked && canManageRole(r, standing);
        return (
          <Checkbox
            key={r.id}
            checked={has.has(r.id)}
            disabled={!manageable || busy !== null}
            description={manageable || locked ? undefined : 'Above your highest role'}
            onChange={async (on) => {
              setBusy(r.id);
              setError(null);
              try {
                await actions.setRole(member.user.id, r.id, on);
              } catch (e) {
                setError(failureMessage(e, 'Could not change the role. Try again.'));
              } finally {
                setBusy(null);
              }
            }}
          >
            {r.name}
          </Checkbox>
        );
      })}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Stack>
  );
}

function NicknameForm({ slug, member }: { slug: string; member: Member }) {
  const theme = useTheme();
  const actions = useModerationActions(slug);
  const [nickname, setNickname] = useState(member.nickname ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changed = nickname.trim() !== (member.nickname ?? '');
  return (
    <Stack gap="xs">
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.space.sm }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Nickname"
            value={nickname}
            onChangeText={(t) => {
              setNickname(t);
              setSaved(false);
            }}
            maxLength={32}
            placeholder={member.user.display_name}
          />
        </View>
        <Button
          title={saved && !changed ? 'Saved' : 'Save'}
          variant="outline"
          size="sm"
          loading={busy}
          disabled={!changed}
          style={{ marginBottom: 6 }}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await actions.setNickname(member.user.id, nickname.trim());
              setSaved(true);
            } catch (e) {
              setError(failureMessage(e, 'Could not change the nickname. Try again.'));
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Stack>
  );
}

function ClearTimeout({ slug, member }: { slug: string; member: Member }) {
  const actions = useModerationActions(slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Stack gap="xs">
      <Button
        title="Remove timeout"
        variant="tertiary"
        loading={busy}
        style={{ alignSelf: 'flex-start' }}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await actions.clearTimeout(member.user.id);
          } catch (e) {
            setError(failureMessage(e, 'Could not end the timeout. Try again.'));
          } finally {
            setBusy(false);
          }
        }}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Stack>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return {
    busy,
    error,
    setError,
    async run(work: () => Promise<unknown>, fallback: string) {
      setBusy(true);
      setError(null);
      try {
        await work();
        return true;
      } catch (e) {
        setError(failureMessage(e, fallback));
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}

function WarnForm({ slug, member, header, onBack, onDone }: { slug: string; member: Member; header: ReactNode; onBack: () => void; onDone: () => void }) {
  const actions = useModerationActions(slug);
  const submit = useSubmit();
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const name = memberName(member);
  if (sent) {
    return (
      <>
        {header}
        <Notice tone="success">{name} has been warned. They see the reason in their inbox.</Notice>
        <Actions>
          <Button title="Done" onPress={onDone} />
        </Actions>
      </>
    );
  }
  return (
    <>
      <Text variant="headingMd" accessibilityRole="header">
        Warn {name}
      </Text>
      <Text variant="bodySm" tone="muted">
        A formal warning they receive as a notification. Nothing else changes. It is recorded in the audit log.
      </Text>
      <TextField label="Reason" value={reason} onChangeText={setReason} maxLength={512} multiline autoFocus placeholder="What they did, and what you expect instead" />
      {submit.error ? <Notice tone="danger">{submit.error}</Notice> : null}
      <Actions>
        <Button title="Back" variant="tertiary" onPress={onBack} />
        <Button
          title="Send warning"
          loading={submit.busy}
          disabled={!reason.trim()}
          onPress={async () => {
            if (await submit.run(() => actions.warn(member.user.id, reason.trim()), 'Could not send the warning. Try again.')) setSent(true);
          }}
        />
      </Actions>
    </>
  );
}

function TimeoutForm({ slug, member, header, onBack, onDone }: { slug: string; member: Member; header: ReactNode; onBack: () => void; onDone: () => void }) {
  const actions = useModerationActions(slug);
  const submit = useSubmit();
  const [seconds, setSeconds] = useState('3600');
  const [reason, setReason] = useState('');
  const name = memberName(member);
  return (
    <>
      {header}
      <Text variant="headingMd" accessibilityRole="header">
        Time out {name}
      </Text>
      <Text variant="bodySm" tone="muted">
        They can still read, but cannot post, reply, react or join voice until it ends. They are told why.
      </Text>
      <Stack gap="xs">
        <Text variant="bodySmStrong" tone="onDark">
          Duration
        </Text>
        <PillTabs options={TIMEOUT_DURATIONS.map((d) => ({ value: String(d.seconds), label: d.label }))} value={seconds} onChange={setSeconds} />
      </Stack>
      <TextField label="Reason" value={reason} onChangeText={setReason} maxLength={512} placeholder="Shown to them (optional)" />
      {submit.error ? <Notice tone="danger">{submit.error}</Notice> : null}
      <Actions>
        <Button title="Back" variant="tertiary" onPress={onBack} />
        <Button
          title="Time out"
          loading={submit.busy}
          onPress={async () => {
            if (await submit.run(() => actions.timeout(member.user.id, Number(seconds), reason.trim()), 'Could not time them out. Try again.')) onDone();
          }}
        />
      </Actions>
    </>
  );
}

/** Kick or ban: both remove the member; a ban also stops them coming back until it lifts. */
function RemoveForm({ mode, slug, member, placeName, onBack, onDone }: { mode: 'kick' | 'ban'; slug: string; member: Member; placeName: string; onBack: () => void; onDone: () => void }) {
  const actions = useModerationActions(slug);
  const submit = useSubmit();
  const [seconds, setSeconds] = useState('0');
  const [reason, setReason] = useState('');
  const name = memberName(member);
  const ban = mode === 'ban';
  return (
    <>
      <Text variant="headingMd" accessibilityRole="header">
        {ban ? `Ban ${name}?` : `Kick ${name}?`}
      </Text>
      <Text variant="bodySm" tone="muted">
        {ban
          ? `Removes them from ${placeName} and stops them joining again until the ban lifts.`
          : `Removes them from ${placeName}. They can join again, with an invite if the place needs one.`}
      </Text>
      {ban ? (
        <Stack gap="xs">
          <Text variant="bodySmStrong" tone="onDark">
            Duration
          </Text>
          <PillTabs options={BAN_DURATIONS.map((d) => ({ value: String(d.seconds), label: d.label }))} value={seconds} onChange={setSeconds} />
        </Stack>
      ) : null}
      <TextField label="Reason" value={reason} onChangeText={setReason} maxLength={512} placeholder="Recorded in the audit log (optional)" />
      {submit.error ? <Notice tone="danger">{submit.error}</Notice> : null}
      <Actions>
        <Button title="Back" variant="tertiary" onPress={onBack} />
        <Button
          title={ban ? 'Ban' : 'Kick'}
          variant="danger"
          loading={submit.busy}
          onPress={async () => {
            const ok = await submit.run(
              () => (ban ? actions.ban(member.user.id, Number(seconds), reason.trim()) : actions.kick(member.user.id, reason.trim())),
              ban ? 'Could not ban them. Try again.' : 'Could not kick them. Try again.',
            );
            if (ok) onDone();
          }}
        />
      </Actions>
    </>
  );
}
