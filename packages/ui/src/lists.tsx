import { Children, type ReactNode } from 'react';
import { Image, Modal, Pressable, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { KeyboardAvoidingView, Platform } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { accentFor } from './accent.ts';
import { Text, type TextTone } from './components.tsx';
import { ElevationContext, Icon, useElevated, type IconName } from './icons.tsx';
import { dialogEntering, fadeEntering, fadeExiting, hoverTransition, motion, sheetEntering, sheetExiting, usePresence, type PressState } from './motion.ts';
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
  /** Drawn instead of the icon, e.g. an avatar or a status dot. */
  leading?: ReactNode;
  /** Rendered at the right edge, before the chevron. */
  trailing?: ReactNode;
  /** Buttons at the right edge. Rendered beside the pressable row, never inside it, so a pressable row does not nest <button>s on web. */
  actions?: ReactNode;
  tone?: Extract<TextTone, 'default' | 'danger'>;
  onPress?: () => void;
  /** Show a chevron to signal navigation. */
  chevron?: boolean;
}

export function ListRow({ title, subtitle, icon, leading, trailing, actions, tone = 'default', onPress, chevron }: ListRowProps) {
  const theme = useTheme();
  const c = theme.colors;
  const rowStyle = { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md } as const;
  const content = (
    <>
      {leading ?? (icon ? <Icon name={icon} size={16} color={tone === 'danger' ? c.accentRed : c.mute} /> : null)}
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
    </>
  );
  const end = (
    <>
      {trailing}
      {chevron ? <Icon name="chevronRight" size={16} color={c.mute} /> : null}
    </>
  );
  if (actions) {
    const main = onPress ? (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed, hovered }: PressState) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.space.md, backgroundColor: pressed || hovered ? c.surfaceElevated : 'transparent' }, hoverTransition]}>
        {content}
      </Pressable>
    ) : (
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>{content}</View>
    );
    return (
      <View style={rowStyle}>
        {main}
        {trailing}
        {actions}
        {chevron ? <Icon name="chevronRight" size={16} color={c.mute} /> : null}
      </View>
    );
  }
  const body = (
    <View style={rowStyle}>
      {content}
      {end}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed, hovered }: PressState) => [{ backgroundColor: pressed || hovered ? c.surfaceElevated : 'transparent' }, hoverTransition]}>
      {body}
    </Pressable>
  );
}

export interface NavRowProps {
  label: string;
  icon?: IconName;
  /** Drawn instead of the icon, e.g. an avatar. */
  leading?: ReactNode;
  active?: boolean;
  /** New activity: the label turns bright and medium weight. */
  unread?: boolean;
  /** A white count at the end of the row (mentions, unread direct messages). */
  count?: number;
  /** Notifications are off: the row steps down to ash, never turns bright, and ends in a muted bell unless it has a count. */
  muted?: boolean;
  /** Quiet text at the end of the row, e.g. how many people are in a voice channel. */
  meta?: string;
  accessibilityLabel?: string;
  onPress: () => void;
}

/** Sidebar row: command-palette-row in DESIGN.md. */
export function NavRow({ label, icon, leading, active, unread, count = 0, muted, meta, accessibilityLabel, onPress }: NavRowProps) {
  const theme = useTheme();
  const c = theme.colors;
  const bright = active || (unread && !muted);
  const iconColor = bright ? c.onDark : muted ? c.ash : c.mute;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? `${label}${muted ? ', muted' : ''}${count > 0 ? `, ${count} unread` : unread && !muted ? ', unread' : ''}`}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: theme.radii.sm,
          // Hover is one step quieter than the active row, so the selection still stands out.
          backgroundColor: active || pressed ? c.surfaceCard : hovered ? c.surfaceElevated : 'transparent',
        },
        hoverTransition,
      ]}
    >
      {leading ?? (icon ? <Icon name={icon} size={16} color={iconColor} /> : null)}
      <Text variant="bodySm" tone={bright ? 'onDark' : muted ? 'faint' : 'default'} numberOfLines={1} style={[{ flex: 1 }, unread && !muted ? { fontFamily: theme.fontFaces['500'] } : null]}>
        {label}
      </Text>
      {meta ? (
        <Text variant="captionMd" tone="muted">
          {meta}
        </Text>
      ) : null}
      {muted && count <= 0 ? <Icon name="bellOff" size={14} color={c.ash} /> : null}
      {count > 0 ? (
        <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="captionSm" tone="inverse" style={{ fontFamily: theme.fontFaces['500'], lineHeight: 16 }}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Shown but not changeable; the box and label step down to ash. */
  disabled?: boolean;
  /** A second, muted line under the label. */
  description?: string;
  children: ReactNode;
}

export function Checkbox({ checked, onChange, disabled, description, children }: CheckboxProps) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={{ flexDirection: 'row', gap: theme.space.md, alignItems: 'flex-start', opacity: disabled ? 0.5 : 1 }}
    >
      {({ hovered }: PressState) => (
        <>
          <View
            style={[
              {
                width: 18,
                height: 18,
                marginTop: 3,
                borderRadius: theme.radii.xs,
                borderWidth: 1,
                borderColor: checked ? c.primary : hovered && !disabled ? c.mute : c.hairlineStrong,
                backgroundColor: checked ? c.primary : c.surfaceElevated,
                alignItems: 'center',
                justifyContent: 'center',
              },
              hoverTransition,
            ]}
          >
            {checked ? <Icon name="check" size={12} color={c.onPrimary} /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodySm" tone={description ? 'onDark' : 'default'}>
              {children}
            </Text>
            {description ? (
              <Text variant="captionMd" tone="muted">
                {description}
              </Text>
            ) : null}
          </View>
        </>
      )}
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
  const reduced = useReducedMotion();
  // The modal outlives `visible` briefly so the panel can animate out.
  const present = usePresence(visible, motion.close + 100);
  const c = theme.colors;
  return (
    <Modal visible={present} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: wide ? 'center' : 'flex-end', alignItems: wide ? 'center' : 'stretch' }}
      >
        {visible ? (
          <>
            <Animated.View entering={fadeEntering} exiting={fadeExiting} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}>
              <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose} style={{ flex: 1 }} />
            </Animated.View>
            <ElevationContext.Provider value>
              <Animated.View
                accessibilityViewIsModal
                entering={reduced ? fadeEntering : wide ? dialogEntering : sheetEntering}
                exiting={reduced || wide ? fadeExiting : sheetExiting}
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
              </Animated.View>
            </ElevationContext.Provider>
          </>
        ) : null}
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
  // Inside dialogs the active chip lifts above the elevated surface.
  const lifted = useElevated() ? theme.colors.surfaceCard : theme.colors.surfaceElevated;
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
            style={[
              {
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: theme.radii.full,
                backgroundColor: active ? lifted : 'transparent',
              },
              hoverTransition,
            ]}
          >
            {({ hovered }: PressState) => (
              <Text variant="bodySm" tone={active || hovered ? 'onDark' : 'default'}>
                {o.label}
              </Text>
            )}
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
            style={({ hovered }: PressState) => [
              {
                flexDirection: 'row',
                gap: theme.space.md,
                alignItems: 'flex-start',
                padding: theme.space.md,
                borderRadius: theme.radii.md,
                borderWidth: 1,
                borderColor: on || hovered ? c.hairlineStrong : c.hairline,
                backgroundColor: on ? c.surfaceCard : c.surfaceElevated,
              },
              hoverTransition,
            ]}
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
