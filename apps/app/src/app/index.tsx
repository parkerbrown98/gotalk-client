import { Screen } from '@gotalk/ui';
import { Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { useActiveInstance, useInstancesHydrated } from '@/lib/instances';

export default function Index() {
  const hydrated = useInstancesHydrated();
  const active = useActiveInstance();
  if (!hydrated) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <ActivityIndicator />
      </Screen>
    );
  }
  return <Redirect href={active ? '/home' : '/connect'} />;
}
