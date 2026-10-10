import { Redirect } from 'expo-router';

import { useActiveInstance } from '@/lib/instances';
import { welcomeHref } from '@/lib/welcome';

/** Old address: signing in now happens on the welcome screen's account step. */
export default function SignIn() {
  const active = useActiveInstance();
  return <Redirect href={welcomeHref(active?.origin)} />;
}
