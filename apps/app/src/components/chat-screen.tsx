import { Icon, useTheme, type IconName } from '@gotalk/ui';
import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TitleBar } from '@/components/screen-frame';

/** The 52px bar above a chat on wide screens. */
export function TopBar({ children, end }: { children: ReactNode; end?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: theme.colors.hairline }}>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>{children}</View>
      {end ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>{end}</View> : null}
    </View>
  );
}

/** An icon button in a top or title bar. Toggles (`active` given) are bright while on; plain buttons are bright in title bars. */
export function BarButton({ icon, label, active, size = 16, onPress }: { icon: IconName; label: string; active?: boolean; size?: number; onPress: () => void }) {
  const theme = useTheme();
  const bright = active ?? size > 16;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={active === undefined ? undefined : { selected: active }} onPress={onPress} hitSlop={8}>
      <Icon name={icon} size={size} color={bright ? theme.colors.onDark : theme.colors.mute} />
    </Pressable>
  );
}

export interface ChatFrameProps {
  wide: boolean;
  /** Phone title bar. */
  title: string;
  onBack?: () => void;
  /** Phone title bar, right side. */
  end?: ReactNode;
  /** Wide top bar. */
  topBar?: ReactNode;
  /** Wide right-hand panel. */
  side?: ReactNode;
  children: ReactNode;
}

/** Full-height chat layout: no outer scroll view, since the feed scrolls itself and the composer stays put. */
export function ChatFrame({ wide, title, onBack, end, topBar, side, children }: ChatFrameProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  if (wide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.colors.canvas }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {topBar}
          {children}
        </View>
        {side}
      </View>
    );
  }
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.canvas, paddingTop: insets.top }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TitleBar title={title} onBack={onBack} end={end} />
      {children}
    </KeyboardAvoidingView>
  );
}
