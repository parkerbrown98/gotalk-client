import { Redirect } from 'expo-router';

import { useWide } from '@/lib/layout';

/** The account hub owns the phone menu; wide settings open the profile editor. */
export default function SettingsIndex() {
  return <Redirect href={useWide() ? '/settings/profile' : '/you'} />;
}
