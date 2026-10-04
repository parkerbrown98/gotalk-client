import { Children, type ReactNode } from 'react';
import { Image, Modal, Pressable, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { accentFor } from './accent.ts';
import { Text, type TextTone } from './components.tsx';
import { ElevationContext, Icon, type IconName } from './icons.tsx';
import { useTheme } from './theme.tsx';

/** Rows separated by hairlines inside one bordered surface. */
export function ListCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme();
  const rows = Children.toArray(children);
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.hairline,
          borderWidth: 1,
          borderRadius: theme.radii.lg,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {rows.map((row, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.hairline } : null}>
          {row}
        </View>
      ))}
    </View>
  );
}

export interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** Rendered at the right edge, before the chevron. */
  trailing?: ReactNode;
  tone?: Extract<TextTone, 'default' | 'danger'>;
  onPress?: () => void;
  /** Show a chevron to signal navigation. */
  chevron?: boolean;
}

export function ListRow({ title, subtitle, icon, trailing, tone = 'default', onPress, chevron }: ListRowProps) {
  const theme = useTheme();
  const c = theme.colors;
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md }}>
      {icon ? <Icon name={icon} size={16} color={tone === 'danger' ? c.accentRed : c.mute} /> : null}
      <View style={{ flex: 1 }}>
        <Text variant="bodySmStrong" tone={tone === 'danger' ? 'danger' : 'onDark'}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="captionMd" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {chevron ? <Icon name="chevronRight" size={16} color={c.mute} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ backgroundColor: pressed ? c.surfaceElevated : 'transparent' })}>
      {body}
    </Pressable>
  );
}

/** Sidebar row: command-palette-row in DESIGN.md. */
export function NavRow({ label, icon, active, onPress }: { label: string; icon?: IconName; active?: boolean; onPress: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: theme.radii.sm,
        backgroundColor: active || pressed ? c.surfaceCard : 'transparent',
      })}
    >
      {icon ? <Icon name={icon} size={16} color={active ? c.onDark : c.mute} /> : null}
      <Text variant="bodySm" tone={active ? 'onDark' : 'default'}>
        {label}
      </Text>
    </Pressable>
  );
}

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}

export function Checkbox({ checked, onChange, children }: CheckboxProps) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={{ flexDirection: 'row', gap: theme.space.md, alignItems: 'flex-start' }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          marginTop: 3,
          borderRadius: theme.radii.xs,
          borderWidth: 1,
          borderColor: checked ? c.primary : c.hairlineStrong,
          backgroundColor: checked ? c.primary : c.surfaceElevated,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Icon name="check" size={12} color={c.onPrimary} /> : null}
      </View>
      <Text variant="bodySm" style={{ flex: 1 }}>
        {children}
      </Text>
    </Pressable>
  );
}

/** Round avatar: the image when there is one, otherwise initials on a stable soft accent. */
export function Avatar({ name, uri, size = 36 }: { name: string; uri?: string | null; size?: number }) {
  const theme = useTheme();
  const accent = accentFor(theme.colors, name);
  const box = { width: size, height: size, borderRadius: theme.radii.full };
  if (uri) return <Image source={{ uri }} style={box} accessibilityIgnoresInvertColors />;
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('') || '?';
  return (
    <View style={[box, { backgroundColor: accent.bg, alignItems: 'center', justifyContent: 'center' }]}>
      <Text variant="bodySmStrong" style={{ color: accent.fg, fontSize: size * 0.36, lineHeight: size * 0.5 }}>
        {initials}
      </Text>
    </View>
  );
}

export interface DialogProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** A centered dialog from the tablet breakpoint up, a bottom sheet below it. Controls inside step up one surface. */
export function Dialog({ visible, onClose, children }: DialogProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= theme.breakpoints.tablet;
  const c = theme.colors;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: wide ? 'center' : 'flex-end', alignItems: wide ? 'center' : 'stretch' }}
      >
        <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <ElevationContext.Provider value>
          <View
            accessibilityViewIsModal
            style={[
              {
                backgroundColor: c.surfaceElevated,
                borderColor: c.hairlineStrong,
                borderWidth: 1,
                gap: theme.space.lg,
              },
              wide
                ? { width: 480, maxWidth: '92%', borderRadius: theme.radii.xl, padding: theme.space.xl }
                : {
                    borderBottomWidth: 0,
                    borderTopLeftRadius: theme.radii.xl,
                    borderTopRightRadius: theme.radii.xl,
                    paddingHorizontal: theme.space.lg,
                    paddingTop: theme.space.xl,
                    paddingBottom: theme.space.xxl,
                  },
            ]}
          >
            {wide ? null : <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.stone, marginTop: -12 }} />}
            {children}
          </View>
        </ElevationContext.Provider>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Keyboard shortcut hint. Solid fill: the keycap gradient in DESIGN.md needs a gradient primitive React Native does not have. */
export function Keycap({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        height: theme.sizes.keycapHeight,
        minWidth: 20,
        paddingHorizontal: 6,
        borderRadius: theme.radii.xs,
        borderWidth: 1,
        borderColor: theme.colors.hairline,
        backgroundColor: theme.colors.surfaceCard,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="captionMd" style={{ lineHeight: 16 }}>
        {children}
      </Text>
    </View>
  );
}

export interface PillTabsProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

/** A row of pill-shaped choices; the active one lifts one surface step. */
export function PillTabs<T extends string>({ options, value, onChange }: PillTabsProps<T>) {
  const theme = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.xs }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: theme.radii.full,
              backgroundColor: active ? theme.colors.surfaceElevated : 'transparent',
            }}
          >
            <Text variant="bodySm" tone={active ? 'onDark' : 'default'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface RadioOptionsProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string; description?: string }>;
  value: T;
  onChange: (value: T) => void;
}

/** Stacked radio cards, each with a label and a one-line description. */
export function RadioOptions<T extends string>({ options, value, onChange }: RadioOptionsProps<T>) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View accessibilityRole="radiogroup" style={{ gap: theme.space.sm }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={{
              flexDirection: 'row',
              gap: theme.space.md,
              alignItems: 'flex-start',
              padding: theme.space.md,
              borderRadius: theme.radii.md,
              borderWidth: 1,
              borderColor: on ? c.hairlineStrong : c.hairline,
              backgroundColor: on ? c.surfaceCard : c.surfaceElevated,
            }}
          >
            <View
              style={{
                width: 16,
                height: 16,
                marginTop: 3,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: on ? c.primary : c.hairlineStrong,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {on ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary }} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodySmStrong" tone="onDark">
                {o.label}
              </Text>
              {o.description ? (
                <Text variant="captionMd" tone="muted">
                  {o.description}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
