import { Text, type TextProps } from '@gotalk/ui';

/** Body-prose link: full white, no tint, per DESIGN.md `link-inline`. */
export function InlineLink({ onPress, children, ...rest }: TextProps & { onPress: () => void }) {
  return (
    <Text variant="bodySm" tone="onDark" accessibilityRole="link" onPress={onPress} {...rest}>
      {children}
    </Text>
  );
}
