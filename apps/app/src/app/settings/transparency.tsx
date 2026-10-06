import { useState } from 'react';

import { SettingsPage } from '@/components/settings-page';
import { TransparencyReport } from '@/components/transparency-report';
import { useInstanceInfo } from '@/lib/api';

export default function InstanceTransparency() {
  const instance = useInstanceInfo().data;
  const [days, setDays] = useState<'30' | '90' | '365'>('30');
  return (
    <SettingsPage title="Transparency report" subtitle={`How ${instance?.name ?? 'this instance'} was moderated. Anyone can read this report.`}>
      <TransparencyReport description="Reports, actions and removed content across the whole instance." days={days} onDaysChange={setDays} />
    </SettingsPage>
  );
}
