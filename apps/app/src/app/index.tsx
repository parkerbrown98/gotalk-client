import { Screen } from '@gotalk/ui';
import { Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { useAuthHydrated, useSession } from '@/lib/auth';
import { useActiveInstance, useInstancesHydrated } from '@/lib/instances';
import { welcomeHref } from '@/lib/welcome';

export default function Index() {
  const instancesReady = useInstancesHydrated();
  const authReady = useAuthHydrated();
  const hydrated = instancesReady && authReady;
  const active = useActiveInstance();
  const session = useSession();
  if (!hydrated) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <ActivityIndicator />
      </Screen>
    );
  }
  if (!active) return <Redirect href="/welcome" />;
  return <Redirect href={session ? '/home' : welcomeHref(active.origin)} />;
}
