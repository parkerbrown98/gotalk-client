import { bindingFromEvent, bindingLabels, type KeyBinding } from '@gotalk/core';
import { Button, Checkbox, Dialog, Icon, Keycap, PillTabs, Stack, Text, useElevated, useTheme } from '@gotalk/ui';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { MenuItem, MenuPopover, type Anchor } from '@/components/menu';
import { isDesktop } from '@/lib/desktop';
import { voicePlatform } from '@/lib/voice';
import { platform } from '@/lib/voice-platform';
import type { AudioDevice } from '@/lib/voice-platform-types';
import { updateVoiceSettings, useVoiceSettings, type InputMode } from '@/lib/voice-settings';

/** A field that opens a list of choices, styled like a text field. */
function SelectField({ label, value, options, onChange }: { label: string; value: string | null; options: AudioDevice[]; onChange: (id: string | null) => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const elevated = useElevated();
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const all: { id: string | null; label: string }[] = [{ id: null, label: 'System default' }, ...options];
  const current = all.find((o) => o.id === value) ?? all[0]!;
  return (
    <View style={{ gap: theme.space.xs }}>
      <Text variant="bodySmStrong" tone="onDark">
        {label}
      </Text>
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current.label}. Change`}
        onPress={() => ref.current?.measureInWindow((x, y, w, h) => setAnchor({ left: x, top: y + h + 4, flipAt: y }))}
        style={{
          minHeight: theme.sizes.controlHeight,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: theme.space.md,
          borderRadius: theme.radii.md,
          borderWidth: 1,
          borderColor: c.hairline,
          backgroundColor: elevated ? c.surface : c.surfaceElevated,
        }}
      >
        <Text variant="bodyMd" tone="onDark" numberOfLines={1} style={{ flex: 1 }}>
          {current.label}
        </Text>
        <Icon name="chevronDown" size={16} color={c.mute} />
      </Pressable>
      <MenuPopover visible={!!anchor} onClose={() => setAnchor(null)} anchor={anchor ?? {}} width={320}>
        {all.map((o) => (
          <MenuItem
            key={o.id ?? 'default'}
            label={o.label}
            checked={o.id === current.id}
            onPress={() => {
              setAnchor(null);
              onChange(o.id);
            }}
          />
        ))}
      </MenuPopover>
    </View>
  );
}

function SettingRow({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <View style={{ flex: 1, minWidth: 180 }}>
        <Text variant="bodySmStrong" tone="onDark">
          {title}
        </Text>
        {hint ? (
          <Text variant="captionMd" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Listens for the next key combination; Escape cancels. */
function useKeyCapture(active: boolean, onDone: (b: KeyBinding | null) => void) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const down = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') return done.current(null);
      const b = bindingFromEvent(e);
      if (b) done.current(b);
    };
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, [active]);
}

function useDevices(kind: 'audioinput' | 'audiooutput', enabled: boolean): AudioDevice[] {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const load = () =>
      void platform
        .listDevices(kind)
        .then((d) => live && setDevices(d))
        .catch(() => undefined);
    load();
    const off = platform.onDevicesChanged(load);
    return () => {
      live = false;
      off();
    };
  }, [kind, enabled]);
  return devices;
}

function VoiceSettingsForm({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const settings = useVoiceSettings();
  const inputs = useDevices('audioinput', voicePlatform.pickDevices);
  const outputs = useDevices('audiooutput', voicePlatform.pickOutput);
  const [capturing, setCapturing] = useState(false);
  const [level, setLevel] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const stopTest = useRef<(() => void) | null>(null);

  useKeyCapture(capturing, (b) => {
    setCapturing(false);
    if (b) updateVoiceSettings({ pushToTalk: b });
  });
  useEffect(() => () => stopTest.current?.(), []);

  const toggleTest = async () => {
    if (stopTest.current) {
      stopTest.current();
      stopTest.current = null;
      return setLevel(null);
    }
    setProblem(null);
    try {
      setLevel(0);
      stopTest.current = await platform.startMicTest({ deviceId: settings.inputDeviceId, noiseSuppression: settings.noiseSuppression }, setLevel);
    } catch (e) {
      setLevel(null);
      setProblem(
        e instanceof Error && e.name === 'NotAllowedError'
          ? `Gotalk can't use your microphone. Allow access in your ${isDesktop ? 'system' : 'browser or system'} settings.`
          : 'Could not start your microphone.',
      );
    }
  };

  const ptt = voicePlatform.pushToTalk;
  return (
    <>
      <Text variant="headingMd" accessibilityRole="header">
        Voice settings
      </Text>
      <Stack gap="lg">
        {voicePlatform.pickDevices ? <SelectField label="Microphone" value={settings.inputDeviceId} options={inputs} onChange={(id) => updateVoiceSettings({ inputDeviceId: id })} /> : null}
        {voicePlatform.pickOutput ? <SelectField label="Speakers" value={settings.outputDeviceId} options={outputs} onChange={(id) => updateVoiceSettings({ outputDeviceId: id })} /> : null}
        {ptt !== 'none' ? (
          <SettingRow title="Input mode" hint={ptt === 'global' ? 'Push to talk works system-wide in the desktop app.' : 'Push to talk works while Gotalk is in front; the desktop app listens system-wide.'}>
            <PillTabs<InputMode>
              options={[
                { value: 'voice', label: 'Voice activity' },
                { value: 'ptt', label: 'Push to talk' },
              ]}
              value={settings.inputMode}
              onChange={(inputMode) => updateVoiceSettings({ inputMode })}
            />
          </SettingRow>
        ) : null}
        {ptt !== 'none' && settings.inputMode === 'ptt' ? (
          <SettingRow title="Push-to-talk key" hint={capturing ? 'Press the keys now. Escape cancels.' : 'Press a key or combination to change it.'}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {bindingLabels(settings.pushToTalk, voicePlatform.mac).map((k) => (
                  <Keycap key={k}>{k}</Keycap>
                ))}
              </View>
              <Button size="sm" variant="tertiary" title={capturing ? 'Listening…' : 'Change'} onPress={() => setCapturing(!capturing)} />
            </View>
          </SettingRow>
        ) : null}
        <Checkbox checked={settings.noiseSuppression} onChange={(noiseSuppression) => updateVoiceSettings({ noiseSuppression })}>
          Reduce background noise
        </Checkbox>
        {level !== null ? (
          <View accessible accessibilityLabel="Input level" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant="captionMd" tone="muted" style={{ width: 96 }}>
              Input level
            </Text>
            <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.surfaceCard, overflow: 'hidden' }}>
              {/* Speech sits low on the linear scale, so the meter follows its square root. */}
              <View style={{ width: `${Math.round(Math.min(1, Math.sqrt(level) * 1.6) * 100)}%`, height: '100%', backgroundColor: c.accentGreen }} />
            </View>
          </View>
        ) : null}
        {problem ? (
          <Text variant="captionMd" tone="danger">
            {problem}
          </Text>
        ) : null}
      </Stack>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
        {voicePlatform.micTest ? <Button title={level !== null ? 'Stop test' : 'Test microphone'} variant="tertiary" onPress={() => void toggleTest()} /> : null}
        <Button title="Done" onPress={onClose} />
      </View>
    </>
  );
}

/** Microphone, speakers, push to talk and noise suppression for this device. */
export function VoiceSettingsDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Dialog visible={visible} onClose={onClose}>
      {visible ? <VoiceSettingsForm onClose={onClose} /> : null}
    </Dialog>
  );
}
