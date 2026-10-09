import { useTheme } from '@gotalk/ui';
import { Stack } from 'expo-router';

/** Signed-out browsing of public topics. */
export default function ExploreLayout() {
  const theme = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.canvas } }} />;
}
