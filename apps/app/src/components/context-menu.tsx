import { useEffect, useState } from 'react';
import type { ViewProps } from 'react-native';

import { MenuItem, MenuPopover, MenuSeparator, type Anchor } from '@/components/menu';
import { copyText, pasteText } from '@/lib/clipboard';
import { desktopOS, isDesktop, openExternal } from '@/lib/desktop';

// Right-click in the desktop app never shows the webview's own menu (Reload, Inspect Element and so on).
// Text fields, selected text and links get an edit menu here; components open their own menus through
// `contextMenu` below.

type TextField = HTMLInputElement | HTMLTextAreaElement;

interface FieldSnapshot {
  el: TextField;
  start: number;
  end: number;
}

interface ContextState {
  anchor: Anchor;
  field: FieldSnapshot | null;
  selection: string;
  link: string | null;
}

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);

function isTextField(el: Element | null): el is TextField {
  return el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(el.type));
}

function anchorAt(e: MouseEvent): Anchor {
  return { left: e.clientX, top: e.clientY, flipAt: e.clientY };
}

/** What a right-click landed on that deserves the edit menu, or null when it is just app chrome. */
function readContext(e: MouseEvent): ContextState | null {
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return null;
  const field = target.closest('input, textarea');
  if (isTextField(field)) {
    return { anchor: anchorAt(e), field: { el: field, start: field.selectionStart ?? 0, end: field.selectionEnd ?? 0 }, selection: '', link: null };
  }
  const link = target.closest('[data-external-link]')?.getAttribute('data-external-link') ?? null;
  const selection = window.getSelection();
  const text = selection && !selection.isCollapsed && selection.containsNode(target, true) ? selection.toString() : '';
  if (!link && !text.trim()) return null;
  return { anchor: anchorAt(e), field: null, selection: text, link };
}

/**
 * Opens a component's own menu at the pointer on right-click, in the desktop app only. Right-clicks on
 * text fields, links and selected text fall through to the edit menu instead.
 */
export function contextMenu(open: (anchor: Anchor) => void): ViewProps {
  if (!isDesktop) return {};
  const onContextMenu = (e: { nativeEvent: MouseEvent }) => {
    if (readContext(e.nativeEvent)) return;
    e.nativeEvent.preventDefault();
    open(anchorAt(e.nativeEvent));
  };
  return { onContextMenu } as unknown as ViewProps;
}

/** Marks text as a link to an outside page, so right-clicking it offers to open or copy it. */
export function externalLink(url: string): object {
  return isDesktop ? { dataSet: { externalLink: url } } : {};
}

const mod = desktopOS === 'macos' ? '⌘' : 'Ctrl+';

function restore(field: FieldSnapshot) {
  field.el.focus({ preventScroll: true });
  field.el.setSelectionRange(field.start, field.end);
}

/** Hosts the edit menu for the whole desktop app. Renders nothing elsewhere. */
export function DesktopContextMenu() {
  const [menu, setMenu] = useState<ContextState | null>(null);

  useEffect(() => {
    if (!isDesktop) return;
    // React's handlers run first (they listen on the root), so a component that opened its own menu has
    // already called preventDefault by the time the event reaches the document.
    const onContextMenu = (e: MouseEvent) => {
      const handled = e.defaultPrevented;
      e.preventDefault();
      if (!handled) setMenu(readContext(e));
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, []);

  if (!menu) return null;
  const { field, selection, link } = menu;
  const close = () => setMenu(null);
  // The menu is a modal, which takes focus; act once it has closed and the field can have it back.
  const act = (run: () => unknown) => () => {
    close();
    requestAnimationFrame(() => void run());
  };

  let items;
  if (field) {
    const selected = field.el.value.slice(field.start, field.end);
    const secret = field.el instanceof HTMLInputElement && field.el.type === 'password';
    const editable = !field.el.readOnly && !field.el.disabled;
    items = (
      <>
        <MenuItem
          label="Cut"
          shortcut={`${mod}X`}
          disabled={!selected || secret || !editable}
          onPress={act(async () => {
            await copyText(selected);
            restore(field);
            document.execCommand('delete');
          })}
        />
        <MenuItem
          label="Copy"
          shortcut={`${mod}C`}
          disabled={!selected || secret}
          onPress={act(async () => {
            await copyText(selected);
            restore(field);
          })}
        />
        <MenuItem
          label="Paste"
          shortcut={`${mod}V`}
          disabled={!editable}
          onPress={act(async () => {
            const text = await pasteText();
            restore(field);
            // insertText goes through the editor, so it fires input events and can be undone.
            if (text) document.execCommand('insertText', false, text);
          })}
        />
        <MenuSeparator />
        <MenuItem
          label="Select all"
          shortcut={`${mod}A`}
          disabled={!field.el.value}
          onPress={act(() => {
            field.el.focus({ preventScroll: true });
            field.el.select();
          })}
        />
      </>
    );
  } else {
    items = (
      <>
        {selection.trim() ? <MenuItem label="Copy" icon="copy" shortcut={`${mod}C`} onPress={act(() => copyText(selection))} /> : null}
        {selection.trim() && link ? <MenuSeparator /> : null}
        {link ? (
          <>
            <MenuItem label="Open link" icon="globe" onPress={act(() => openExternal(link))} />
            <MenuItem label="Copy link" icon="link" onPress={act(() => copyText(link))} />
          </>
        ) : null}
      </>
    );
  }

  return (
    <MenuPopover visible onClose={close} anchor={menu.anchor} width={field ? 200 : 220}>
      {items}
    </MenuPopover>
  );
}
