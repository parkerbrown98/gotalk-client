import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import * as Clipboard from 'expo-clipboard';

import { isDesktop } from './desktop';

/**
 * Plain-text clipboard. The desktop shell uses the system clipboard directly rather than the web
 * clipboard API, which WebKit gates behind a "Paste" confirmation bubble on every read.
 */
export async function copyText(text: string): Promise<void> {
  if (isDesktop) return writeText(text);
  await Clipboard.setStringAsync(text);
}

export async function pasteText(): Promise<string> {
  if (isDesktop) return (await readText().catch(() => '')) ?? '';
  return Clipboard.getStringAsync();
}
