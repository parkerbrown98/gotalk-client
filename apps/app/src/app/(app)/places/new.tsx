import { Stack, Text } from '@gotalk/ui';
import { router } from 'expo-router';

import { PlaceForm } from '@/components/place-form';
import { ScreenFrame } from '@/components/screen-frame';
import { goBack, resetTo, useWide } from '@/lib/layout';
import { usePlaceActions } from '@/lib/places';

export default function NewPlace() {
  const wide = useWide();
  const actions = usePlaceActions();
  return (
    <ScreenFrame title="Create a place" onBack={() => goBack('/home')} maxWidth={wide ? 560 : 640}>
      <Stack gap="xl">
        <Stack gap="xs">
          {wide ? (
            <Text variant="headingXl" accessibilityRole="header">
              Create a place
            </Text>
          ) : null}
          <Text variant="bodySm" tone="muted">
            A place holds forums, chat and voice for one community. You become its owner and can hand it over later.
          </Text>
        </Stack>
        <PlaceForm
          autoSlug
          submitLabel="Create place"
          secondaryLabel="Cancel"
          slugHint="Shown in links. You can change it later."
          onSubmit={async (values) => {
            const place = await actions.create(values);
            resetTo({ pathname: '/places/[slug]', params: { slug: place.slug } });
          }}
          onSecondary={() => (router.canGoBack() ? router.back() : resetTo('/home'))}
        />
      </Stack>
    </ScreenFrame>
  );
}
