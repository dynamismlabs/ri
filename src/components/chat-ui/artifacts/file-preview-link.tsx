'use client';
import { InlineAction } from '@/components/system/inline-action';

import { useMemo, type ReactNode } from 'react';
import { File, FileArchive, FileAudio, FileVideo, Sheet } from 'lucide-react';
import { filePreviewKind, fileSizeLabel, type FilePreviewSource } from '@/lib/files/preview-types';

import { useArtifactPreview, useArtifactPreviewCard, type ArtifactPreview } from './artifact-preview-provider';
import { FileSourceTip } from './file-source-tip';

export function FilePreviewLink({ source, name, children, appearance = 'link', tone = 'surface', size }: {
  source: FilePreviewSource; name: string; children?: ReactNode;
  appearance?: 'link' | 'chip'; tone?: 'surface' | 'bubble'; size?: number;
}) {
  const sourceKind = source.kind;
  const sessionId = source.kind === 'session' ? source.sessionId : '';
  const path = source.kind === 'session' ? source.path : '';
  const fileName = source.kind === 'attachment' ? source.fileName : '';
  const media = source.kind === 'attachment' ? source.media : undefined;
  // Stable source fields keep card registration intact while a reply streams.
  const preview = useMemo<ArtifactPreview>(() => ({ kind: 'file', name, source: sourceKind === 'session' ? { kind: 'session', sessionId, path } : { kind: 'attachment', fileName, ...(media ? { media } : {}) } }), [sourceKind, sessionId, path, fileName, media, name]);
  const ref = useArtifactPreviewCard(preview);
  const open = useArtifactPreview();
  const kind = filePreviewKind(name);
  const Icon = kind === 'video' ? FileVideo : kind === 'audio' ? FileAudio : kind === 'table' ? Sheet : kind === 'archive' ? FileArchive : File;
  const destination = source.kind === 'session' ? source.path : name;
  return <FileSourceTip source={destination} onlyWhenTextHidden={(children || name) === destination}>
    <InlineAction appearance={appearance === "chip" ? "chip" : "link"} bubble={tone === "bubble"}   ref={ref} type="button" data-artifact-card="" aria-label={`Open file: ${name}`} onClick={event => { event.stopPropagation(); open(preview, event.currentTarget); }}
      className="max-w-full items-baseline align-baseline gap-1 mx-0.5 text-left"
    ><Icon size={12} aria-hidden className="shrink-0 self-center opacity-70" /><span className={appearance === 'chip' ? 'max-w-[200px] truncate font-mono text-[11px]' : 'wrap-anywhere'}>{children || name}</span>{appearance === 'chip' && size !== undefined && <span className="shrink-0 text-[10px] opacity-70">{fileSizeLabel(size)}</span>}</InlineAction>
  </FileSourceTip>;
}
