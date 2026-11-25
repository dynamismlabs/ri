'use client';
import { MenuAction } from '@/components/system/menu-action';

import { useMemo } from 'react';
import { Files } from 'lucide-react';
import { Tip } from '@/components/ui/tip';
import { filePreviewKind } from '@/lib/files/preview-types';
import { folderPdfUrl, sessionFolder } from '@/lib/folders/source';
import { isLocalTextTarget } from '@/lib/sessions/reply-text';
import { attachmentPdfUrl } from '@/lib/sessions/reply-pdf';
import type { listExecutionArtifacts } from '@/lib/sessions/execution-artifacts';
import { useArtifactPreview, useArtifactPreviewCard, type ArtifactPreview } from './artifact-preview-provider';
import { PreviewIcon } from './artifact-preview-parts';

export type ArtifactListItem = ReturnType<typeof listExecutionArtifacts>['items'][number];

/** Use the same viewers and access checks as a file opened in the transcript. */
export function listedArtifactPreview(item: Pick<ArtifactListItem, 'source' | 'name' | 'mimeType'>): ArtifactPreview {
  const { source, name, mimeType } = item;
  const target = source.kind === 'session' ? source.path : name;
  const image = mimeType?.startsWith('image/') || /\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(target);
  if (image) return { kind: 'image', name, alt: name, src: source.kind === 'attachment'
    ? `/api/attachments/${encodeURIComponent(source.fileName)}`
    : `/api/sessions/${encodeURIComponent(source.sessionId)}/reply-image?path=${encodeURIComponent(source.path)}` };
  if (mimeType === 'application/pdf' || /\.pdf$/i.test(target)) return { kind: 'pdf', name, source: source.kind === 'session' ? source.path : name, src: source.kind === 'attachment'
    ? attachmentPdfUrl(`/api/attachments/${encodeURIComponent(source.fileName)}`, name) : folderPdfUrl(sessionFolder(source.sessionId), source.path) };
  if (source.kind === 'session') {
    if (/\.html?$/i.test(target)) return { kind: 'html', sessionId: source.sessionId, path: source.path };
    if (filePreviewKind(target) === 'file' && isLocalTextTarget(target)) return { kind: 'text', sessionId: source.sessionId, path: source.path };
  }
  return { kind: 'file', source, name };
}

/** A collection has its own Previous/Next sequence, separate from the transcript.
 * `showChat` names each file's chat, when the list covers several. While
 * `searching` (older messages still loading), an empty list says nothing yet:
 * whoever is loading says so. */
export function ArtifactList({ items, query = '', showChat = true, searching = false }: { items: readonly ArtifactListItem[]; query?: string; showChat?: boolean; searching?: boolean }) {
  const needle = query.trim().toLocaleLowerCase();
  const shown = items.filter(item => `${item.name} ${item.source.kind === 'session' ? item.source.path : ''} ${showChat ? item.chatLabel : ''}`.toLocaleLowerCase().includes(needle));
  return <div data-artifact-list="" aria-label="Shared artifacts">
    {shown.length ? <ul className="divide-y divide-border/60">{shown.map(item => <li key={item.key}><ArtifactRow item={item} showChat={showChat} /></li>)}</ul>
      : !searching && <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
        <Files size={28} aria-hidden className="mb-1 opacity-60" />
        <p className="font-medium text-foreground">{needle ? 'No matching artifacts' : 'No artifacts yet'}</p>
        <p className="max-w-xs text-xs leading-relaxed">{needle ? `Try another filename${showChat ? ', path or chat name' : ' or path'}.` : 'Files the agent shares and message attachments appear here.'}</p>
      </div>}
  </div>;
}

function ArtifactRow({ item, showChat }: { item: ArtifactListItem; showChat: boolean }) {
  const preview = useMemo(() => listedArtifactPreview(item), [item]);
  const ref = useArtifactPreviewCard(preview);
  const open = useArtifactPreview();
  const path = item.source.kind === 'session' ? item.source.path : 'Message attachment';
  return <Tip label={path} onlyWhenTextHidden>
    <MenuAction density="comfortable"  type="button" ref={ref} data-artifact-card="" aria-label={`Open artifact: ${item.name}`} onClick={event => open(preview, event.currentTarget)}
      className="flex w-full min-w-0 items-start gap-3 text-left">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground"><PreviewIcon preview={preview} size={16} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-foreground">{item.name}</span>
        <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted-foreground">{path}</span>
        {showChat && <span className="mt-1 block truncate text-[11px] text-muted-foreground/80">{item.chatLabel}</span>}
      </span>
    </MenuAction>
  </Tip>;
}
