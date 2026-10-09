import { Redirect, useLocalSearchParams } from 'expo-router';

/** The feed moved onto the place's own page; links to the old address keep their filters. */
export default function PlaceFeedRedirect() {
  const params = useLocalSearchParams<Record<string, string>>();
  return <Redirect href={{ pathname: '/places/[slug]', params: { ...params, slug: params.slug! } }} />;
}
