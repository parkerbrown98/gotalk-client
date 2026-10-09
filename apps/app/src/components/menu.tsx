import { Icon, Text, useTheme, type IconName } from '@gotalk/ui';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';

/** Where a popover opens, in window coordinates. Give `top` to open downward or `bottom` to open upward. */
export interface Anchor {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  /** With `top`: where the menu should end instead if it does not fit below (the top of what opened it). */
  flipAt?: number;
}

/** A small floating menu on the elevated surface; tapping outside closes it. */
export function MenuPopover({ visible, onClose, anchor, width = 232, children }: { visible: boolean; onClose: () => void; anchor: Anchor; width?: number; children: ReactNode }) {
  const theme = useTheme();
  const c = theme.colors;
  const { width: screen, height: screenHeight } = useWindowDimensions();
  const [height, setHeight] = useState(0);
  const left = anchor.left !== undefined ? Math.max(8, Math.min(anchor.left, screen - width - 8)) : undefined;
  // Opening downward is the default; near the bottom edge the menu flips above what opened it.
  const fits = anchor.top === undefined || anchor.top + height + 8 <= screenHeight;
  const top = anchor.top === undefined ? undefined : fits ? anchor.top : Math.max(8, (anchor.flipAt ?? screenHeight - 8) - height - 4);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close menu" onPress={onClose} style={{ flex: 1 }}>
        <View
          accessibilityRole="menu"
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          style={{
            position: 'absolute',
            left,
            right: anchor.right,
            top,
            bottom: anchor.bottom,
            opacity: anchor.top === undefined || height > 0 ? 1 : 0,
            width,
            padding: 6,
            gap: 2,
            backgroundColor: c.surfaceElevated,
            borderColor: c.hairlineStrong,
            borderWidth: 1,
            borderRadius: theme.radii.lg,
          }}
        >
          {children}
        </View>
      </Pressable>
    </Modal>
  );
}

export function MenuItem({
  label,
  description,
  icon,
  leading,
  checked,
  danger,
  disabled,
  shortcut,
  onPress,
}: {
  label: string;
  description?: string;
  icon?: IconName;
  leading?: ReactNode;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** A keyboard shortcut shown at the trailing edge, like "⌘C". */
  shortcut?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: theme.radii.sm,
        opacity: disabled ? 0.4 : 1,
        backgroundColor: !disabled && (pressed || hovered) ? c.surfaceCard : 'transparent',
      })}
    >
      {leading ?? (icon ? <Icon name={icon} size={16} color={danger ? c.accentRed : c.mute} /> : null)}
      <View style={{ flex: 1 }}>
        <Text variant="bodySm" tone={danger ? 'danger' : 'onDark'}>
          {label}
        </Text>
        {description ? (
          <Text variant="captionMd" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      {shortcut ? (
        <Text variant="captionMd" tone="faint">
          {shortcut}
        </Text>
      ) : null}
      {checked ? <Icon name="check" size={16} color={c.onDark} /> : null}
    </Pressable>
  );
}

export function MenuSeparator() {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.colors.hairline, marginVertical: 4 }} />;
}
