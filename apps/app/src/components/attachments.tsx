import { embedSite, fileLabel, fitSize, formatBytes, isImageAttachment, type Attachment, type Embed } from '@gotalk/core';
import { Icon, Text, hoverTransition, useTheme, type PressState } from '@gotalk/ui';
import { Image } from 'expo-image';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, View, useWindowDimensions, type TextInput } from 'react-native';

import { MenuItem, MenuPopover, type Anchor } from '@/components/menu';
import { ATTACH_SOURCES, chooseAttachments, dragHasFiles, filesIn, prepareFiles, type AttachSource } from '@/lib/attachment-files';
import type { AttachmentDraft, PendingAttachment } from '@/lib/attachments';
import { openExternal } from '@/lib/desktop';
import { useInstanceCapabilities } from '@/lib/uploads';

// ---- Adding files: the + button, paste and drag and drop ----

/** Turns pasted, dropped or chosen browser files into uploads for the draft. */
function useAddFiles(draft: AttachmentDraft) {
  const caps = useInstanceCapabilities();
  return async (files: readonly File[]) => {
    if (files.length > 0 && draft.enabled) draft.add(await prepareFiles(files, caps));
  };
}

/** The `+` that attaches files: the file chooser on the web and desktop; photos or files on phones. */
export function AttachButton({ draft, size = 30 }: { draft: AttachmentDraft; size?: number }) {
  const theme = useTheme();
  const c = theme.colors;
  const caps = useInstanceCapabilities();
  const button = useRef<View>(null);
  const [menu, setMenu] = useState<Anchor | null>(null);
  if (!draft.enabled) return null;
  const full = draft.items.length >= draft.max;
  const pick = async (source: AttachSource) => {
    setMenu(null);
    draft.add(await chooseAttachments(source, caps));
  };
  return (
    <>
      <Pressable
        ref={button}
        accessibilityRole="button"
        accessibilityLabel="Attach files"
        accessibilityHint={full ? `Up to ${draft.max} files` : undefined}
        disabled={full}
        onPress={() => {
          if (ATTACH_SOURCES.length === 1) return void pick(ATTACH_SOURCES[0]!);
          button.current?.measureInWindow((x, y, _w, h) => setMenu({ left: x, top: y + h + 4, flipAt: y }));
        }}
        hitSlop={6}
        style={({ pressed, hovered }: PressState) => ({
          ...hoverTransition,
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: size / 2,
          opacity: full ? 0.4 : 1,
          backgroundColor: pressed || hovered ? c.surfaceCard : 'transparent',
        })}
      >
        <Icon name="plus" size={18} color={c.mute} />
      </Pressable>
      <MenuPopover visible={!!menu} onClose={() => setMenu(null)} anchor={menu ?? {}} width={200}>
        <MenuItem label="Photos" icon="image" onPress={() => void pick('photos')} />
        <MenuItem label="Files" icon="upload" onPress={() => void pick('files')} />
      </MenuPopover>
    </>
  );
}

/** Web and desktop: files pasted into the input are attached instead of pasted as text. */
export function usePasteFiles(input: RefObject<TextInput | null>, draft: AttachmentDraft) {
  const add = useAddFiles(draft);
  const latest = useRef(add);
  latest.current = add;
  const enabled = draft.enabled;
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    const node = input.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = filesIn(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      void latest.current(files);
    };
    node.addEventListener('paste', onPaste);
    return () => node.removeEventListener('paste', onPaste);
  }, [input, enabled]);
}

/** Web and desktop: makes a view accept dropped files for the draft. Reports whether files are over it. */
export function useFileDrop(zone: RefObject<View | null>, draft: AttachmentDraft): boolean {
  const add = useAddFiles(draft);
  const latest = useRef(add);
  latest.current = add;
  const [over, setOver] = useState(false);
  const enabled = draft.enabled;
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    const node = zone.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    // Enter and leave fire for every child crossed; count them so the overlay does not flicker.
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!dragHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      depth += 1;
      setOver(true);
    };
    const hover = (e: DragEvent) => {
      if (!dragHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const dropped = (e: DragEvent) => {
      if (!dragHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      void latest.current(filesIn(e.dataTransfer));
    };
    node.addEventListener('dragenter', enter);
    node.addEventListener('dragover', hover);
    node.addEventListener('dragleave', leave);
    node.addEventListener('drop', dropped);
    return () => {
      node.removeEventListener('dragenter', enter);
      node.removeEventListener('dragover', hover);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', dropped);
    };
  }, [zone, enabled]);
  return over && enabled;
}

/** Covers a drop zone while files are dragged over it. */
export function DropOverlay({ visible, label }: { visible: boolean; label: string }) {
  const theme = useTheme();
  const c = theme.colors;
  if (!visible) return null;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, padding: 12, pointerEvents: 'none', backgroundColor: 'rgba(14,15,17,0.88)' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed', borderColor: c.hairlineStrong, borderRadius: theme.radii.lg }}>
        <View style={{ alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 20, borderRadius: theme.radii.lg, backgroundColor: c.surfaceElevated, borderWidth: 1, borderColor: c.hairlineStrong }}>
          <Icon name="upload" size={28} color={c.onDark} />
          <Text variant="bodyMd" tone="onDark" style={{ fontFamily: theme.fontFaces['500'] }}>
            {label}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ---- Files waiting to be sent ----

function TrayItem({ item, draft }: { item: PendingAttachment; draft: AttachmentDraft }) {
  const theme = useTheme();
  const c = theme.colors;
  const failed = item.state === 'failed';
  const image = item.file.previewUri && item.file.type.startsWith('image/');
  return (
    <View accessibilityLabel={`${item.file.name}${item.state === 'uploading' ? ', uploading' : failed ? `, failed: ${item.error ?? ''}` : ''}`} style={{ width: 168, gap: 4 }}>
      <View style={{ height: 96, borderRadius: theme.radii.md, overflow: 'hidden', borderWidth: 1, borderColor: failed ? c.accentRed : c.hairline, backgroundColor: c.surfaceCard }}>
        {image ? (
          <Image source={{ uri: item.file.previewUri }} contentFit="cover" style={{ width: '100%', height: '100%', opacity: item.state === 'uploading' ? 0.6 : 1 }} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Icon name="upload" size={20} color={c.mute} />
            <Text variant="captionSm" tone="muted">
              {fileLabel(item.file.name, item.file.type)}
            </Text>
          </View>
        )}
        {item.state === 'uploading' ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={c.onDark} />
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.file.name}`}
          onPress={() => draft.remove(item.key)}
          hitSlop={6}
          style={({ pressed, hovered }: PressState) => ({ ...hoverTransition, position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed || hovered ? c.surfaceCard : c.surfaceElevated, borderWidth: 1, borderColor: c.hairlineStrong })}
        >
          <Icon name="x" size={12} color={c.onDark} />
        </Pressable>
      </View>
      <Text variant="captionSm" tone={failed ? 'danger' : 'muted'} numberOfLines={1}>
        {failed ? (item.error ?? 'Upload failed') : item.file.name}
      </Text>
      {failed ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Retry uploading ${item.file.name}`} onPress={() => draft.retry(item.key)} hitSlop={4}>
          <Text variant="captionSm" tone="onDark" style={{ textDecorationLine: 'underline' }}>
            Retry
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The files added to a composer, each uploading in the background, with a way to remove or retry them. */
export function AttachmentTray({ draft }: { draft: AttachmentDraft }) {
  const theme = useTheme();
  if (draft.items.length === 0 && !draft.notice) return null;
  return (
    <View style={{ gap: theme.space.xs }}>
      {draft.items.length > 0 ? (
        <View accessibilityLabel={`${draft.items.length} ${draft.items.length === 1 ? 'attachment' : 'attachments'}`} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {draft.items.map((item) => (
            <TrayItem key={item.key} item={item} draft={draft} />
          ))}
        </View>
      ) : null}
      {draft.notice ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="captionMd" tone="danger" accessibilityLiveRegion="polite" style={{ flexShrink: 1 }}>
            {draft.notice}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={draft.dismissNotice} hitSlop={6}>
            <Icon name="x" size={12} color={theme.colors.mute} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

// ---- Sent attachments and link previews ----

interface Viewed {
  url: string;
  width: number;
  height: number;
  label: string;
}

/** An image filling the window; tap anywhere or press Escape to close. */
function Lightbox({ image, onClose }: { image: Viewed | null; onClose: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const win = useWindowDimensions();
  const size = image ? fitSize(image.width, image.height, win.width - 48, win.height - 120) : { width: 0, height: 0 };
  return (
    <Modal visible={!!image} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close image" onPress={onClose} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: 'rgba(0,0,0,0.88)' }}>
        {image ? (
          <>
            <Image source={{ uri: image.url }} accessibilityLabel={image.label} contentFit="contain" style={{ width: size.width, height: size.height, borderRadius: theme.radii.sm }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Text variant="captionMd" tone="muted" numberOfLines={1} style={{ maxWidth: win.width - 160 }}>
                {image.label}
              </Text>
              <Pressable accessibilityRole="link" onPress={() => openExternal(image.url)} hitSlop={6}>
                <Text variant="captionMd" tone="onDark" style={{ textDecorationLine: 'underline' }}>
                  Open original
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}
        <View style={{ position: 'absolute', top: 24, right: 24 }}>
          <Icon name="x" size={20} color={c.onDark} />
        </View>
      </Pressable>
    </Modal>
  );
}

function FileCard({ file, wide }: { file: Attachment; wide: boolean }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Download ${file.filename}, ${formatBytes(file.size)}`}
      onPress={() => openExternal(file.url)}
      style={({ pressed, hovered }: PressState) => ({
        ...hoverTransition,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        maxWidth: wide ? 400 : 320,
        padding: 10,
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: c.hairline,
        backgroundColor: pressed || hovered ? c.surfaceCard : c.surfaceElevated,
      })}
    >
      <View style={{ width: 40, height: 40, borderRadius: theme.radii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceCard }}>
        <Text variant="captionSm" tone="onDark" style={{ fontFamily: theme.fontFaces['600'] }} numberOfLines={1}>
          {fileLabel(file.filename, file.content_type)}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodySm" tone="onDark" numberOfLines={1}>
          {file.filename}
        </Text>
        <Text variant="captionMd" tone="muted">
          {formatBytes(file.size)}
        </Text>
      </View>
      <Icon name="arrowDown" size={16} color={c.mute} />
    </Pressable>
  );
}

function ImageTile({ image, width, height, onOpen, cover }: { image: Viewed; width: number; height: number; onOpen: (v: Viewed) => void; cover?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={`Open ${image.label}`} onPress={() => onOpen(image)} style={({ hovered }: PressState) => ({ ...hoverTransition, opacity: hovered ? 0.92 : 1 })}>
      <Image source={{ uri: image.url }} accessibilityLabel={image.label} contentFit={cover ? 'cover' : 'contain'} transition={120} style={{ width, height, borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceCard }} />
    </Pressable>
  );
}

function ImageGrid({ images, wide, onOpen }: { images: Viewed[]; wide: boolean; onOpen: (v: Viewed) => void }) {
  if (images.length === 1) {
    const one = images[0]!;
    const size = fitSize(one.width, one.height, wide ? 400 : 280, wide ? 320 : 260);
    return <ImageTile image={one} width={size.width} height={size.height} onOpen={onOpen} />;
  }
  const side = wide ? 160 : 112;
  const columns = images.length === 2 || images.length === 4 ? 2 : 3;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, maxWidth: columns * side + (columns - 1) * 4 }}>
      {images.map((img) => (
        <ImageTile key={img.url} image={img} width={side} height={side} onOpen={onOpen} cover />
      ))}
    </View>
  );
}

function EmbedCard({ embed, wide, onOpen }: { embed: Embed; wide: boolean; onOpen: (v: Viewed) => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const image = embed.image as Embed['image'] | null;
  if (embed.kind === 'image' && image) {
    const size = fitSize(image.width, image.height, wide ? 400 : 280, wide ? 320 : 260);
    return <ImageTile image={{ url: image.url, width: image.width, height: image.height, label: embed.url }} width={size.width} height={size.height} onOpen={onOpen} />;
  }
  const large = !!image && embed.large_image;
  const thumb = !!image && !large;
  const site = embedSite(embed);
  const maxWidth = wide ? 432 : 320;
  const big = image && large ? fitSize(image.width, image.height, maxWidth - 28, 240) : null;
  return (
    <View style={{ maxWidth, alignSelf: 'flex-start', flexDirection: 'row', gap: 12, padding: 12, borderRadius: theme.radii.md, borderLeftWidth: 3, borderLeftColor: embed.color ?? c.hairlineStrong, backgroundColor: c.surfaceElevated }}>
      <View style={{ flexShrink: 1, gap: 4 }}>
        {site ? (
          <Text variant="captionMd" tone="muted" numberOfLines={1}>
            {site}
          </Text>
        ) : null}
        {embed.title ? (
          <Text variant="bodySmStrong" tone="onDark" accessibilityRole="link" numberOfLines={2} onPress={() => openExternal(embed.url)} style={{ textDecorationLine: 'underline' }}>
            {embed.title}
          </Text>
        ) : null}
        {embed.description ? (
          <Text variant="bodySm" tone="muted" numberOfLines={3}>
            {embed.description}
          </Text>
        ) : null}
        {image && big ? (
          <View style={{ marginTop: 6 }}>
            <ImageTile image={{ url: image.url, width: image.width, height: image.height, label: embed.title || embed.url }} width={big.width} height={big.height} onOpen={onOpen} cover />
          </View>
        ) : null}
      </View>
      {image && thumb ? <ImageTile image={{ url: image.url, width: image.width, height: image.height, label: embed.title || embed.url }} width={72} height={72} onOpen={onOpen} cover /> : null}
    </View>
  );
}

/** Images (as a grid), files (as download cards) and link previews under a message or post. */
export function MessageMedia({ attachments, embeds, wide, faded }: { attachments?: readonly Attachment[] | null; embeds?: readonly Embed[] | null; wide: boolean; faded?: boolean }) {
  const [viewing, setViewing] = useState<Viewed | null>(null);
  const files = attachments ?? [];
  const links = embeds ?? [];
  if (files.length === 0 && links.length === 0) return null;
  const images: Viewed[] = files.filter(isImageAttachment).map((a) => ({ url: a.url, width: a.width ?? 0, height: a.height ?? 0, label: a.filename }));
  const others = files.filter((a) => !isImageAttachment(a));
  return (
    <View style={{ gap: 6, marginTop: 4, opacity: faded ? 0.6 : 1 }}>
      {images.length > 0 ? <ImageGrid images={images} wide={wide} onOpen={setViewing} /> : null}
      {others.map((f) => (
        <FileCard key={f.id} file={f} wide={wide} />
      ))}
      {links.map((e) => (
        <EmbedCard key={e.url} embed={e} wide={wide} onOpen={setViewing} />
      ))}
      <Lightbox image={viewing} onClose={() => setViewing(null)} />
    </View>
  );
}

// ---- Feed cards ----

/**
 * The opening post's images on a feed card. Not pressable on its own: a tap opens the topic like the
 * rest of the card. One image is shown large; several as a strip, the last counting any not shown.
 */
export function FeedImages({ images, count, wide }: { images: readonly Attachment[]; count: number; wide: boolean }) {
  const theme = useTheme();
  const c = theme.colors;
  const shown = images.filter(isImageAttachment);
  if (shown.length === 0) return null;
  if (shown.length === 1) {
    const one = shown[0]!;
    const size = fitSize(one.width ?? 0, one.height ?? 0, wide ? 520 : 320, wide ? 320 : 240);
    return <Image source={{ uri: one.url }} accessibilityLabel={one.filename} contentFit="cover" transition={120} style={{ width: size.width, height: size.height, maxWidth: '100%', marginTop: 6, borderRadius: theme.radii.md, backgroundColor: c.surfaceCard }} />;
  }
  const side = wide ? 132 : 88;
  const more = count - shown.length;
  return (
    <View accessibilityLabel={`${count} images`} style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
      {shown.map((img, i) => (
        <View key={img.id} style={{ width: side, height: side, borderRadius: theme.radii.md, overflow: 'hidden', backgroundColor: c.surfaceCard }}>
          <Image source={{ uri: img.url }} accessibilityLabel={img.filename} contentFit="cover" transition={120} style={{ width: '100%', height: '100%' }} />
          {more > 0 && i === shown.length - 1 ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' }}>
              <Text variant="bodyStrong" tone="onDark">
                +{more}
              </Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** A link topic's preview image, beside the title on a feed card. */
export function FeedThumbnail({ embed, wide }: { embed: Embed; wide: boolean }) {
  const theme = useTheme();
  const image = embed.image as Embed['image'] | null;
  if (!image) return null;
  return (
    <Image
      source={{ uri: image.url }}
      accessibilityLabel={embed.title || embedSite(embed)}
      contentFit="cover"
      transition={120}
      style={{ width: wide ? 112 : 72, height: wide ? 80 : 56, borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceCard }}
    />
  );
}
