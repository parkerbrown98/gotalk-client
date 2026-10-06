import {
  PERMISSION_GROUPS,
  hasBit,
  permissionInfo,
  roleColorHex,
  roleColorValue,
  ungroupedPermissions,
  withPermission,
  type OverwriteState,
  type PermissionTable,
} from '@gotalk/core';
import { Checkbox, Stack, Text, useElevated, useTheme, type IconName } from '@gotalk/ui';
import { Pressable, View } from 'react-native';

import type { OverwriteKind } from '@/lib/moderation';
import type { Board, Channel } from '@/lib/places';

/** A role's color as a small dot before its name. Names themselves stay neutral. */
export function RoleDot({ color, size = 10 }: { color: number | null | undefined; size?: number }) {
  const hex = roleColorHex(color);
  if (!hex) return null;
  return <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: hex }} />;
}

/** None plus the four accent colors; a role picked elsewhere in another color keeps it until changed. */
export function RoleColorPicker({ value, onChange, disabled }: { value: number; onChange: (color: number) => void; disabled?: boolean }) {
  const theme = useTheme();
  const c = theme.colors;
  const options = [
    { label: 'No color', value: 0 },
    { label: 'Blue', value: roleColorValue(c.accentBlue) },
    { label: 'Green', value: roleColorValue(c.accentGreen) },
    { label: 'Yellow', value: roleColorValue(c.accentYellow) },
    { label: 'Red', value: roleColorValue(c.accentRed) },
  ];
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: theme.space.sm, alignItems: 'center' }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.label}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: on, disabled: !!disabled }}
            disabled={disabled}
            onPress={() => onChange(o.value)}
            hitSlop={4}
            style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: on ? c.onDark : 'transparent' }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: o.value ? roleColorHex(o.value)! : 'transparent',
                borderWidth: o.value ? 0 : 1,
                borderColor: c.hairlineStrong,
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Every permission as a checkbox, grouped. Permissions the editor does not hold cannot be granted or
 * taken away by them, so those rows are disabled.
 */
export function PermissionChecklist({
  bits,
  onChange,
  table,
  grantable,
  disabled,
}: {
  bits: number;
  onChange: (bits: number) => void;
  table: PermissionTable;
  /** The editor's own permissions; null when they hold every permission (owner or administrator). */
  grantable: number | null;
  disabled?: boolean;
}) {
  const extra = ungroupedPermissions(table);
  const groups = [
    ...PERMISSION_GROUPS.map((g) => ({ key: g.key, label: g.label, names: g.permissions.map((p) => p.name as string).filter((n) => n in table) })),
    ...(extra.length ? [{ key: 'other', label: 'Other', names: extra }] : []),
  ];
  return (
    <Stack gap="xl">
      {groups.map((g) => (
        <Stack key={g.key} gap="md">
          <Text variant="bodySmStrong" tone="onDark" accessibilityRole="header">
            {g.label}
          </Text>
          {g.names.map((name) => {
            const info = permissionInfo(name);
            const locked = grantable !== null && !hasBit(grantable, name, table);
            return (
              <Checkbox
                key={name}
                checked={hasBit(bits, name, table)}
                disabled={disabled || locked}
                description={locked ? `${info.description} You don't have this permission, so you can't change it.`.trim() : info.description || undefined}
                onChange={(on) => onChange(withPermission(bits, name, on, table))}
              >
                {info.label}
              </Checkbox>
            );
          })}
        </Stack>
      ))}
    </Stack>
  );
}

const STATES: readonly { value: OverwriteState; label: string }[] = [
  { value: 'deny', label: 'Deny' },
  { value: 'inherit', label: 'Default' },
  { value: 'allow', label: 'Allow' },
];

/** Deny, Default or Allow for one permission in an override. */
export function TriState({ value, onChange, disabled, label }: { value: OverwriteState; onChange: (v: OverwriteState) => void; disabled?: boolean; label: string }) {
  const theme = useTheme();
  const c = theme.colors;
  const lifted = useElevated() ? c.surfaceCard : c.surfaceElevated;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 2, opacity: disabled ? 0.5 : 1 }}>
      {STATES.map((s) => {
        const on = s.value === value;
        return (
          <Pressable
            key={s.value}
            accessibilityRole="radio"
            accessibilityLabel={`${label}: ${s.label}`}
            accessibilityState={{ checked: on, disabled: !!disabled }}
            disabled={disabled}
            onPress={() => onChange(s.value)}
            style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radii.full, backgroundColor: on ? lifted : 'transparent' }}
          >
            <Text variant="bodySm" tone={on ? 'onDark' : 'muted'}>
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** How a forum or channel is named and drawn in the permissions screens. */
export function overwriteTargetLabel(kind: OverwriteKind, target: Board | Channel): { title: string; icon: IconName } {
  if (kind === 'board') return { title: target.name, icon: (target as Board).kind === 'category' ? 'chevronDown' : 'forum' };
  const ch = target as Channel;
  if (ch.kind === 'category') return { title: ch.name, icon: 'chevronDown' };
  if (ch.kind === 'voice') return { title: ch.name, icon: 'volume' };
  return { title: ch.name, icon: 'hash' };
}
