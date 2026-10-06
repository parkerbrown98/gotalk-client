import { Icon, ListCard, ListRow, NavRow, Stack, Text, useTheme, type IconName } from '@gotalk/ui';
import { router, usePathname, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ScreenFrame } from '@/components/screen-frame';
import { useInstanceInfo } from '@/lib/api';
import { goBack, useWide } from '@/lib/layout';
import { useOpenReportCount } from '@/lib/moderation';
import { usePlace, usePlaceAccess, type Place, type PlaceAccess } from '@/lib/places';

export type SectionKey = 'general' | 'invites' | 'roles' | 'permissions' | 'members' | 'reports' | 'bans' | 'audit-log' | 'webhooks' | 'bots';

const PATHS = {
  general: '/places/[slug]/settings/general',
  invites: '/places/[slug]/settings/invites',
  roles: '/places/[slug]/settings/roles',
  permissions: '/places/[slug]/settings/permissions',
  members: '/places/[slug]/settings/members',
  reports: '/places/[slug]/settings/reports',
  bans: '/places/[slug]/settings/bans',
  'audit-log': '/places/[slug]/settings/audit-log',
  webhooks: '/places/[slug]/settings/webhooks',
  bots: '/places/[slug]/settings/bots',
} as const satisfies Record<SectionKey, string>;

type Group = 'Place' | 'Moderation' | 'Integrations';

interface SectionDef {
  key: SectionKey;
  label: string;
  icon: IconName;
  group: Group;
  allowed: (access: PlaceAccess, features: { webhooks: boolean; bots: boolean }) => boolean;
}

const SECTIONS: readonly SectionDef[] = [
  { key: 'general', label: 'General', icon: 'settings', group: 'Place', allowed: (a) => a.can('MANAGE_PLACE') },
  { key: 'invites', label: 'Invites', icon: 'users', group: 'Place', allowed: (a) => a.can('MANAGE_INVITES') },
  { key: 'roles', label: 'Roles', icon: 'shield', group: 'Place', allowed: (a) => a.can('MANAGE_ROLES') },
  { key: 'permissions', label: 'Permissions', icon: 'lock', group: 'Place', allowed: (a) => a.can('MANAGE_BOARDS') || a.can('MANAGE_CHANNELS') },
  {
    key: 'members',
    label: 'Members',
    icon: 'user',
    group: 'Moderation',
    allowed: (a) => a.can('KICK_MEMBERS') || a.can('BAN_MEMBERS') || a.can('MODERATE_MEMBERS') || a.can('MANAGE_ROLES') || a.can('MANAGE_NICKNAMES'),
  },
  { key: 'reports', label: 'Reports', icon: 'flag', group: 'Moderation', allowed: (a) => a.can('MANAGE_REPORTS') },
  { key: 'bans', label: 'Bans', icon: 'ban', group: 'Moderation', allowed: (a) => a.can('BAN_MEMBERS') },
  { key: 'audit-log', label: 'Audit log', icon: 'clock', group: 'Moderation', allowed: (a) => a.can('VIEW_AUDIT_LOG') },
  { key: 'webhooks', label: 'Webhooks', icon: 'link', group: 'Integrations', allowed: (a, f) => f.webhooks && a.can('MANAGE_WEBHOOKS') },
  { key: 'bots', label: 'Bots', icon: 'command', group: 'Integrations', allowed: (a, f) => f.bots && a.can('MANAGE_PLACE') },
];

const GROUPS: readonly Group[] = ['Place', 'Moderation', 'Integrations'];

export function sectionHref(slug: string, key: SectionKey): Href {
  return { pathname: PATHS[key], params: { slug } };
}

export function settingsHref(slug: string): Href {
  return { pathname: '/places/[slug]/settings', params: { slug } };
}

export interface PlaceSettings {
  place: Place | undefined;
  access: PlaceAccess;
  sections: SectionDef[];
  loading: boolean;
}

/** The settings sections the signed-in user may open in a place. The server still checks each request. */
export function usePlaceSettings(slug: string | undefined): PlaceSettings {
  const place = usePlace(slug);
  const access = usePlaceAccess(place.data);
  const features = useInstanceInfo().data?.features;
  const flags = { webhooks: features?.webhooks ?? true, bots: features?.bots ?? true };
  const sections = access.isMember ? SECTIONS.filter((s) => s.allowed(access, flags)) : [];
  return { place: place.data, access, sections, loading: place.isPending };
}

/** Wide screens: the list of sections beside the content. */
export function PlaceSettingsNav({ slug }: { slug: string }) {
  const theme = useTheme();
  const c = theme.colors;
  const pathname = usePathname();
  const { sections, access } = usePlaceSettings(slug);
  const openReports = useOpenReportCount(slug, access.can('MANAGE_REPORTS'));
  const base = `/places/${slug}/settings/`;
  return (
    <View style={{ width: 220, backgroundColor: c.canvas, borderRightWidth: 1, borderRightColor: c.hairline }}>
      <ScrollView contentContainerStyle={{ paddingVertical: theme.space.lg, paddingHorizontal: theme.space.sm, gap: 2 }}>
        {GROUPS.map((group) => {
          const items = sections.filter((s) => s.group === group);
          if (items.length === 0) return null;
          return (
            <View key={group} style={{ gap: 2, marginBottom: theme.space.sm }}>
              <Text variant="captionMd" tone="muted" style={{ paddingHorizontal: 10, paddingTop: 6, paddingBottom: 2 }}>
                {group}
              </Text>
              {items.map((s) => (
                <NavRow
                  key={s.key}
                  label={s.label}
                  icon={s.icon}
                  active={pathname === base + s.key || pathname.startsWith(`${base}${s.key}/`)}
                  count={s.key === 'reports' ? openReports : 0}
                  accessibilityLabel={s.key === 'reports' && openReports > 0 ? `Reports, ${openReports} open` : undefined}
                  onPress={() => router.replace(sectionHref(slug, s.key))}
                />
              ))}
            </View>
          );
        })}
      </ScrollView>
      <View style={{ borderTopWidth: 1, borderTopColor: c.hairline, padding: theme.space.sm }}>
        <NavRow label="Transparency report" icon="eye" onPress={() => router.push({ pathname: '/places/[slug]/transparency', params: { slug } })} />
      </View>
    </View>
  );
}

/** Phones: every section as a list, grouped like the wide nav. */
export function PlaceSettingsList({ slug }: { slug: string }) {
  const { sections, access } = usePlaceSettings(slug);
  const openReports = useOpenReportCount(slug, access.can('MANAGE_REPORTS'));
  return (
    <Stack gap="lg">
      {GROUPS.map((group) => {
        const items = sections.filter((s) => s.group === group);
        if (items.length === 0) return null;
        return (
          <Stack key={group} gap="sm">
            <Text variant="captionMd" tone="muted">
              {group}
            </Text>
            <ListCard>
              {items.map((s) => (
                <ListRow
                  key={s.key}
                  icon={s.icon}
                  title={s.label}
                  chevron
                  trailing={s.key === 'reports' && openReports > 0 ? <Text variant="captionMd" tone="onDark">{openReports > 49 ? '50+' : openReports}</Text> : undefined}
                  onPress={() => router.push(sectionHref(slug, s.key))}
                />
              ))}
            </ListCard>
          </Stack>
        );
      })}
      <ListCard>
        <ListRow icon="eye" title="Transparency report" chevron onPress={() => router.push({ pathname: '/places/[slug]/transparency', params: { slug } })} />
      </ListCard>
    </Stack>
  );
}

export interface PlaceSettingsPageProps {
  slug: string;
  title: string;
  description?: string;
  /** Buttons beside the heading on wide screens, under the description on phones. */
  actions?: ReactNode;
  /** The title bar's right edge on phones, e.g. a plus that creates something. */
  phoneEnd?: ReactNode;
  /** A detail page: where its back link goes, and what to call it on wide screens. */
  back?: { label: string; href: Href };
  width?: number;
  children: ReactNode;
}

/** One place-settings screen: a column beside the section nav on wide screens, a pushed screen on phones. */
export function PlaceSettingsPage({ slug, title, description, actions, phoneEnd, back, width = 680, children }: PlaceSettingsPageProps) {
  const theme = useTheme();
  const wide = useWide();

  if (!wide) {
    return (
      <ScreenFrame title={title} onBack={() => goBack(back?.href ?? settingsHref(slug))} end={phoneEnd} maxWidth={width}>
        <Stack gap="lg">
          {description ? (
            <Text variant="bodySm" tone="muted">
              {description}
            </Text>
          ) : null}
          {actions ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>{actions}</View> : null}
          {children}
        </Stack>
      </ScreenFrame>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingVertical: theme.space.xxl, paddingHorizontal: 40 }} keyboardShouldPersistTaps="handled">
      <Stack gap="xl" style={{ width, maxWidth: '100%' }}>
        <Stack gap="sm">
          {back ? (
            <Pressable accessibilityRole="link" onPress={() => router.replace(back.href)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
              <Icon name="chevronLeft" size={14} color={theme.colors.mute} />
              <Text variant="captionMd" tone="muted">
                {back.label}
              </Text>
            </Pressable>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.lg }}>
            <Stack gap="xs" style={{ flex: 1 }}>
              <Text variant="headingXl" accessibilityRole="header">
                {title}
              </Text>
              {description ? (
                <Text variant="bodySm" tone="muted">
                  {description}
                </Text>
              ) : null}
            </Stack>
            {actions ? <View style={{ flexDirection: 'row', gap: theme.space.sm }}>{actions}</View> : null}
          </View>
        </Stack>
        {children}
      </Stack>
    </ScrollView>
  );
}
