import { INDEX_REMOVAL_TIME } from '@gotalk/core';
import { Checkbox, Notice, Stack, Text } from '@gotalk/ui';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { FailureNotice } from '@/components/failure-notice';
import { SettingsPage } from '@/components/settings-page';
import { useInstanceInfo, useMe } from '@/lib/api';
import { classifyFailure, failureMessage } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';
import { useIndexActions } from '@/lib/search-index';

const LABEL = "Don't show my posts in public search results";

/** How your posts appear outside the instance: keeping them out of search engines and the public directory. */
export default function Privacy() {
  const active = useActiveInstance();
  const me = useMe();
  const listed = useInstanceInfo().data?.directory?.listed;
  const actions = useIndexActions();
  const [pending, setPending] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const user = me.data;
  const subtitle = 'How your posts appear outside this instance.';

  if (!active) return null;
  if (!user) {
    return (
      <SettingsPage title="Privacy" subtitle={subtitle}>
        {me.isError ? <FailureNotice failure={classifyFailure(me.error)} host={active.origin} /> : <ActivityIndicator />}
      </SettingsPage>
    );
  }

  function change(next: boolean) {
    setPending(next);
    setError(null);
    actions
      .setExcludeFromIndex(next)
      .catch((e) => setError(failureMessage(e, 'Could not change this. Try again.')))
      .finally(() => setPending(null));
  }

  const exclude = pending ?? user.exclude_from_index;
  return (
    <SettingsPage title="Privacy" subtitle={subtitle}>
      <Stack gap="md">
        <Text variant="headingSm">Search engines</Text>
        <Checkbox
          checked={exclude}
          disabled={pending !== null}
          onChange={change}
          accessibilityLabel={LABEL}
          description={`Keeps everything you post, past and future, out of search engines and the public Gotalk directory. People on this instance still see your posts as usual. Changes take effect ${INDEX_REMOVAL_TIME}. Saved right away.`}
        >
          {LABEL}
        </Checkbox>
        {user.index_notice ? (
          <Text variant="captionMd" tone="muted">
            {user.index_notice}
          </Text>
        ) : null}
        {listed === false ? (
          <Text variant="captionMd" tone="muted">
            This instance isn&apos;t listed in the public directory right now, so none of its posts are in search results. Your choice still applies if that changes.
          </Text>
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </Stack>
    </SettingsPage>
  );
}
