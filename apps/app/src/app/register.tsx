import { Redirect } from 'expo-router';

import { useActiveInstance } from '@/lib/instances';
import { welcomeHref } from '@/lib/welcome';

/** Old address: creating an account now happens on the welcome screen's account step. */
export default function Register() {
  const active = useActiveInstance();
  return <Redirect href={welcomeHref(active?.origin, 'create')} />;
}
