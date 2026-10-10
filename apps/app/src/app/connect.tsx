import { Redirect } from 'expo-router';

/** Old address: choosing a server now happens on the welcome screen. */
export default function Connect() {
  return <Redirect href="/welcome" />;
}
