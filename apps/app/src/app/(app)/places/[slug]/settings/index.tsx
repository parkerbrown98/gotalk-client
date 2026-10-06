import { Redirect, useLocalSearchParams } from 'expo-router';

import { PlaceSettingsList, sectionHref, usePlaceSettings } from '@/components/place-settings';
import { ScreenFrame } from '@/components/screen-frame';
import { goBack, useWide } from '@/lib/layout';

/** Phones list the sections; wide screens open the first one beside the nav. */
export default function PlaceSettingsIndex() {
  const wide = useWide();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { place, sections } = usePlaceSettings(slug);
  if (!place) return null;
  if (wide && sections[0]) return <Redirect href={sectionHref(place.slug, sections[0].key)} />;
  return (
    <ScreenFrame title="Place settings" onBack={() => goBack({ pathname: '/places/[slug]', params: { slug: place.slug } })}>
      <PlaceSettingsList slug={place.slug} />
    </ScreenFrame>
  );
}
