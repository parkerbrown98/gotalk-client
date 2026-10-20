import { parseFcmEnvelope } from '@gotalk/core';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { receiveAndroidPush } from './push-receive.native';

/**
 * Loaded by the app entry (`index.js`) before anything renders, because Android may start the JavaScript runtime
 * just to run this task for a data message while the app is closed. iOS shows pushes through the Notification
 * Service Extension instead, so the task ignores them there.
 */
export const PUSH_TASK = 'gotalk-push';

TaskManager.defineTask<Notifications.NotificationTaskPayload>(PUSH_TASK, async ({ data, error }) => {
  if (error || Platform.OS !== 'android' || !data || 'actionIdentifier' in data) return;
  const envelope = parseFcmEnvelope(data.data as Record<string, unknown>);
  if (!envelope) return;
  try {
    await receiveAndroidPush(envelope);
  } catch {
    // A push that cannot be shown is dropped; the inbox still has the notification.
  }
});

if (Platform.OS === 'android') void Notifications.registerTaskAsync(PUSH_TASK).catch(() => undefined);
