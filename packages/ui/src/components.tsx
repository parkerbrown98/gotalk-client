import type { Theme } from '@gotalk/tokens';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
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

export type TextVariant = 'title' | 'heading' | 'body' | 'label' | 'caption' | 'mono';
export type TextTone = 'default' | 'muted' | 'accent' | 'danger' | 'success' | 'warning' | 'inverse';

function textStyle(theme: Theme, variant: TextVariant, tone: TextTone): TextStyle {
  const { fontSizes: fs, fontWeights: fw, lineHeights: lh, colors } = theme;
  const sizes: Record<TextVariant, [number, TextStyle['fontWeight']]> = {
    title: [fs['2xl'], fw.bold],
    heading: [fs.lg, fw.semibold],
    body: [fs.md, fw.regular],
    label: [fs.sm, fw.medium],
    caption: [fs.xs, fw.regular],
    mono: [fs.sm, fw.regular],
  };
  const tones: Record<TextTone, string> = {
    default: colors.text,
    muted: colors.textMuted,
    accent: colors.accent,
    danger: colors.danger,
    success: colors.success,
    warning: colors.warning,
    inverse: colors.textInverse,
  };
  const [fontSize, fontWeight] = sizes[variant];
  return {
    fontSize,
    fontWeight,
    lineHeight: Math.round(fontSize * (variant === 'title' ? lh.tight : lh.normal)),
    color: tones[tone],
    ...(variant === 'mono' ? { fontFamily: 'monospace' } : null),
  };
}

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
}

export function Text({ variant = 'body', tone = 'default', style, ...rest }: TextProps) {
  const theme = useTheme();
  return <RNText {...rest} style={[textStyle(theme, variant, tone), style]} />;
}

export interface StackProps extends ViewProps {
  gap?: Space;
  direction?: 'row' | 'column';
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
}

export function Stack({ gap = 3, direction = 'column', align, justify, wrap, style, ...rest }: StackProps) {
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

/** Full-screen themed background with a centered, width-limited content column. */
export function Screen({ children, style, maxWidth = 640 }: { children: ReactNode; style?: StyleProp<ViewStyle>; maxWidth?: number }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={[{ flex: 1, width: '100%', maxWidth, alignSelf: 'center', padding: theme.space[5] }, style]}>
        {children}
      </View>
    </View>
  );
}

export function Card({ style, ...rest }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radii.lg,
          padding: theme.space[4],
          gap: theme.space[3],
        },
        style,
      ]}
    />
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, variant = 'primary', loading, disabled, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const { colors } = theme;
  const palette: Record<ButtonVariant, { bg: string; bgPressed: string; fg: string; border: string }> = {
    primary: { bg: colors.accent, bgPressed: colors.accentHover, fg: colors.accentText, border: colors.accent },
    secondary: { bg: colors.surface, bgPressed: colors.surfaceRaised, fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', bgPressed: colors.surfaceRaised, fg: colors.accent, border: 'transparent' },
    danger: { bg: 'transparent', bgPressed: colors.surfaceRaised, fg: colors.danger, border: colors.danger },
  };
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      {...rest}
      style={({ pressed }) => [
        {
          minHeight: 44,
          paddingHorizontal: theme.space[4],
          borderRadius: theme.radii.md,
          borderWidth: 1,
          borderColor: p.border,
          backgroundColor: pressed ? p.bgPressed : p.bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: theme.space[2],
          opacity: inactive ? 0.6 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={p.fg} /> : null}
      <RNText style={{ color: p.fg, fontSize: theme.fontSizes.md, fontWeight: theme.fontWeights.semibold }}>{title}</RNText>
    </Pressable>
  );
}

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
}

export function TextField({ label, error, hint, style, ...rest }: TextFieldProps) {
  const theme = useTheme();
  const { colors } = theme;
  return (
    <View style={{ gap: theme.space[1] }}>
      {label ? (
        <Text variant="label" nativeID={rest.nativeID ? `${rest.nativeID}-label` : undefined}>
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        {...rest}
        style={[
          {
            minHeight: 44,
            paddingHorizontal: theme.space[3],
            borderRadius: theme.radii.md,
            borderWidth: 1,
            borderColor: error ? colors.danger : colors.border,
            backgroundColor: colors.surface,
            color: colors.text,
            fontSize: theme.fontSizes.md,
          },
          style,
        ]}
      />
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const theme = useTheme();
  const { colors } = theme;
  const fg: Record<BadgeTone, string> = {
    neutral: colors.textMuted,
    accent: colors.accent,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
  };
  return (
    <View
      style={{
        paddingHorizontal: theme.space[2],
        paddingVertical: 2,
        borderRadius: theme.radii.full,
        borderWidth: 1,
        borderColor: fg[tone],
        alignSelf: 'flex-start',
      }}
    >
      <RNText style={{ color: fg[tone], fontSize: theme.fontSizes.xs, fontWeight: theme.fontWeights.medium }}>{label}</RNText>
    </View>
  );
}
