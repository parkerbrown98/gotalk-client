import type { Theme, TypographyVariant } from '@gotalk/tokens';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text as RNText,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps as RNTextProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from './theme.tsx';

type Space = keyof Theme['space'];

/**
 * Inter with the design system's feature set. Native has no `font-feature-settings`, so `ss03`
 * goes through `fontVariant`; React Native has no weight synthesis, so each weight is its own
 * family (the app must register them, see `fontFaces`).
 */
export function typeStyle(theme: Theme, variant: TypographyVariant): TextStyle {
  const s = theme.typography[variant];
  return {
    fontFamily: theme.fontFaces[s.fontWeight],
    fontSize: s.fontSize,
    lineHeight: Math.round(s.fontSize * s.lineHeight),
    letterSpacing: s.letterSpacing,
    ...(Platform.OS === 'web' ? ({ fontFeatureSettings: s.fontFeature } as TextStyle) : { fontVariant: ['stylistic-three'] }),
  };
}

export type TextVariant = TypographyVariant;
export type TextTone = 'default' | 'muted' | 'faint' | 'onDark' | 'inverse' | 'danger' | 'success' | 'warning' | 'info';

const headingVariants: ReadonlySet<TextVariant> = new Set(['displayXl', 'displayLg', 'headingXl', 'headingLg', 'headingMd', 'headingSm']);

function toneColor(theme: Theme, variant: TextVariant, tone: TextTone): string {
  const c = theme.colors;
  switch (tone) {
    case 'default':
      return headingVariants.has(variant) ? c.ink : c.body;
    case 'muted':
      return c.mute;
    case 'faint':
      return c.ash;
    case 'onDark':
      return c.onDark;
    case 'inverse':
      return c.onPrimary;
    case 'danger':
      return c.accentRed;
    case 'success':
      return c.accentGreen;
    case 'warning':
      return c.accentYellow;
    case 'info':
      return c.accentBlue;
  }
}

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
}

export function Text({ variant = 'bodyMd', tone = 'default', style, ...rest }: TextProps) {
  const theme = useTheme();
  return <RNText {...rest} style={[typeStyle(theme, variant), { color: toneColor(theme, variant, tone) }, style]} />;
}

export interface StackProps extends ViewProps {
  gap?: Space;
  direction?: 'row' | 'column';
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
}

export function Stack({ gap = 'md', direction = 'column', align, justify, wrap, style, ...rest }: StackProps) {
  const theme = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          flexDirection: direction,
          gap: theme.space[gap],
          alignItems: align,
          justifyContent: justify,
          flexWrap: wrap ? 'wrap' : undefined,
        },
        style,
      ]}
    />
  );
}

/** Full-screen canvas with a centered, width-limited content column. */
export function Screen({ children, style, maxWidth = 640 }: { children: ReactNode; style?: StyleProp<ViewStyle>; maxWidth?: number }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <View style={[{ flex: 1, width: '100%', maxWidth, alignSelf: 'center', padding: theme.space.xl }, style]}>{children}</View>
    </View>
  );
}

export interface CardProps extends ViewProps {
  /** One notch up the surface ladder (feature-card-elevated). */
  elevated?: boolean;
  /** Tighter chrome for list rows (store-extension-card: 16px padding, 8px radius). */
  compact?: boolean;
}

/** Hairline border and surface fill; depth never comes from shadows. */
export function Card({ elevated, compact, style, ...rest }: CardProps) {
  const theme = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: elevated ? theme.colors.surfaceElevated : theme.colors.surface,
          borderColor: theme.colors.hairline,
          borderWidth: 1,
          borderRadius: compact ? theme.radii.md : theme.radii.lg,
          padding: compact ? theme.space.lg : theme.space.xl,
          gap: theme.space.md,
        },
        style,
      ]}
    />
  );
}

/** `primary` is the single white action; `outline` is the store-style install button. */
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'outline' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, variant = 'primary', loading, disabled, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const c = theme.colors;
  const looks: Record<ButtonVariant, { bg: string; bgPressed: string; fg: string; border: string }> = {
    primary: { bg: c.primary, bgPressed: c.primaryPressed, fg: c.onPrimary, border: 'transparent' },
    secondary: { bg: 'transparent', bgPressed: c.surfaceElevated, fg: c.onDark, border: 'transparent' },
    tertiary: { bg: c.surfaceElevated, bgPressed: c.surfaceCard, fg: c.onDark, border: 'transparent' },
    outline: { bg: 'transparent', bgPressed: c.surfaceElevated, fg: c.onDark, border: c.hairlineStrong },
    danger: { bg: c.surfaceElevated, bgPressed: c.accentRedSoft, fg: c.accentRed, border: 'transparent' },
  };
  const look = looks[variant];
  const inactive = disabled || loading;
  const fg = disabled ? c.ash : look.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      hitSlop={4}
      {...rest}
      style={({ pressed }) => [
        {
          minHeight: theme.sizes.controlHeight,
          paddingHorizontal: variant === 'outline' ? 14 : theme.space.lg,
          paddingVertical: variant === 'outline' ? 6 : theme.space.sm,
          borderRadius: theme.radii.md,
          borderWidth: 1,
          borderColor: look.border,
          backgroundColor: disabled ? c.surfaceElevated : pressed ? look.bgPressed : look.bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: theme.space.sm,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : null}
      <RNText style={[typeStyle(theme, 'buttonMd'), { color: fg }]}>{title}</RNText>
    </Pressable>
  );
}

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
}

export function TextField({ label, error, hint, style, onFocus, onBlur, multiline, ...rest }: TextFieldProps) {
  const theme = useTheme();
  const c = theme.colors;
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: theme.space.xs }}>
      {label ? (
        <Text variant="bodySmStrong" tone="onDark" nativeID={rest.nativeID ? `${rest.nativeID}-label` : undefined}>
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={c.ash}
        accessibilityLabel={label}
        multiline={multiline}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          typeStyle(theme, 'bodyMd'),
          {
            minHeight: theme.sizes.controlHeight,
            paddingHorizontal: theme.space.md,
            paddingVertical: theme.space.sm,
            borderRadius: theme.radii.md,
            borderWidth: 1,
            // Focus is a subtle brightening of the border, not a colored ring.
            borderColor: error ? c.accentRed : focused ? c.hairlineStrong : c.hairline,
            backgroundColor: c.surfaceElevated,
            color: c.onDark,
          },
          Platform.OS === 'web' ? { outlineWidth: 0 } : null,
          style,
        ]}
      />
      {error ? (
        <Text variant="captionMd" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="captionMd" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** `neutral` is the plan/tier chip; the rest are soft-tinted status chips. */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const theme = useTheme();
  const c = theme.colors;
  const looks: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: c.surfaceElevated, fg: c.onDarkMute },
    info: { bg: c.accentBlueSoft, fg: c.accentBlue },
    success: { bg: c.accentGreenSoft, fg: c.accentGreen },
    warning: { bg: c.accentYellowSoft, fg: c.accentYellow },
    danger: { bg: c.accentRedSoft, fg: c.accentRed },
  };
  const look = looks[tone];
  return (
    <View
      style={{
        paddingHorizontal: tone === 'neutral' ? 6 : theme.space.sm,
        paddingVertical: theme.space.xxs,
        borderRadius: theme.radii.xs,
        backgroundColor: look.bg,
        alignSelf: 'flex-start',
      }}
    >
      <RNText style={[typeStyle(theme, 'captionSm'), { color: look.fg }]}>{label}</RNText>
    </View>
  );
}
