import { useTheme } from '@gotalk/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

// Offsets and widths mirror .stripes in docs/mockups/mockups.css.
const wide = [
  { left: '8%', offset: 0, width: 140, opacity: 0.9 },
  { left: '8%', offset: 190, width: 84, opacity: 0.55 },
  { left: '8%', offset: 330, width: 34, opacity: 0.3 },
] as const;
const compact = [
  { left: '0%', offset: -10, width: 84, opacity: 0.9 },
  { left: '0%', offset: 100, width: 48, opacity: 0.55 },
  { left: '0%', offset: 180, width: 20, opacity: 0.3 },
] as const;

/** The hero stripe band. DESIGN.md allows it once per page, so only the first-run connect screen uses it. */
export function HeroStripes({ compact: isCompact }: { compact?: boolean }) {
  const theme = useTheme();
  const { start, end } = theme.gradients.heroStripe;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height: isCompact ? 72 : 120,
        overflow: 'hidden',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.hairline,
      }}
    >
      {(isCompact ? compact : wide).map((s, i) => (
        <LinearGradient
          key={i}
          colors={[start, end]}
          style={{
            position: 'absolute',
            top: -20,
            bottom: -20,
            left: s.left,
            marginLeft: s.offset,
            width: s.width,
            opacity: s.opacity,
            transform: [{ skewX: '-28deg' }],
          }}
        />
      ))}
    </View>
  );
}
