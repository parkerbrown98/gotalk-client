import { Text } from '@gotalk/ui';
import type { ComponentProps } from 'react';

import { useRoleColor } from '@/lib/role-colors';

/** Keeps existing name typography, with a role color only in the author's place. */
export function AuthorName({ placeId, userId, style, ...props }: ComponentProps<typeof Text> & {
  placeId: string | null | undefined;
  userId: string | undefined;
}) {
  const { color, error } = useRoleColor(placeId, userId);
  return <Text {...props} accessibilityHint={error ? 'Role color could not be loaded' : props.accessibilityHint} style={[style, color ? { color } : null]} />;
}
