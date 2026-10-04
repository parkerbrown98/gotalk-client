import { Icon, Screen, Text, useTheme } from '@gotalk/ui';
import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useWide } from '@/lib/layout';

function TitleBar({ title, onBack, end }: { title: string; onBack?: () => void; end?: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        height: 48,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.space.lg,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.hairline,
      }}
    >
      <View style={{ width: 72, alignItems: 'flex-start' }}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={onBack}>
            <Icon name="chevronLeft" size={20} color={theme.colors.onDark} />
          </Pressable>
        ) : null}
      </View>
      <Text variant="bodySmStrong" tone="onDark" accessibilityRole="header" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
        {title}
      </Text>
      <View style={{ width: 72, alignItems: 'flex-end' }}>{end}</View>
    </View>
  );
}

export interface ScreenFrameProps {
  /** Shown in the title bar below the tablet breakpoint; wider layouts draw their own heading. */
  title: string;
  onBack?: () => void;
  end?: ReactNode;
  /** Drawn above the title bar (the hero stripes). */
  banner?: ReactNode;
  maxWidth?: number;
  /** Replaces the default padding of the content column. */
  contentStyle?: ViewStyle;
  children: ReactNode;
}

/** Safe-area aware screen: stripes or nothing on top, a title bar on phones, then a scrolling column. */
export function ScreenFrame({ title, onBack, end, banner, maxWidth = 640, contentStyle, children }: ScreenFrameProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.canvas, paddingTop: insets.top }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {banner}
      {wide ? null : <TitleBar title={title} onBack={onBack} end={end} />}
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Screen maxWidth={maxWidth} style={contentStyle ?? (wide ? { paddingVertical: 48, paddingHorizontal: theme.space.xl } : { padding: theme.space.lg })}>
          {children}
        </Screen>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
