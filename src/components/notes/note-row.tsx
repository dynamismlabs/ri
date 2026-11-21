'use client';
import { MenuAction } from '@/components/system/menu-action';

import { Card } from '@/components/system/card';
import { Meta, MetaItem } from '@/components/system/meta';

import { IconButton } from '@/components/system/icon-button';
import { useOptionalHomeContext } from '@/components/home/home-context';
import { useSpace } from '@/components/spaces/space-root';
import { homeResourceHref } from '@/lib/home/resource-href';

import {
  ExternalLink, Archive, MoreHorizontal, X,
} from 'lucide-react';
import { TeamLabel } from '@/components/spaces/team-label';
import { removeFromMyNotes } from '@/components/spaces/my-work';
import { NoteIcon } from '@/components/shared/note-icon';
import { DecisionLabel, NoteKindMenuItem } from './note-kind';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AreaSelect } from '@/components/shared/area-select';
import { TaskPicker } from '@/components/shared/task-picker';

import type { NoteListDTO } from '@/lib/api/dto/entity-list';

/** Strip markdown syntax for plain-text previews */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')       // headings
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
    .replace(/(\*|_)(.*?)\1/g, '$2')    // italic
    .replace(/~~(.*?)~~/g, '$1')        // strikethrough
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, '')) // inline code
    .replace(/^\s*[-*+]\s+/gm, '')      // unordered list markers
    .replace(/^\s*\d+\.\s+/gm, '')      // ordered list markers
    .replace(/^\s*>\s?/gm, '')          // blockquotes
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images
    .replace(/\n{2,}/g, ' ')            // collapse blank lines to space
    .trim();
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface NoteRowProps {
  privatePlanning?: boolean;
  note: NoteListDTO;
  onUpdate: (id: string, field: string, value: unknown) => void;
  onArchive: (id: string) => void;
  onOpen?: (id: string) => void;
}

export function NoteRow({ note, onUpdate, onArchive, onOpen, privatePlanning = true }: NoteRowProps) {
  const home = useOptionalHomeContext();
  const space = useSpace();
  const displayTitle = note.title || stripMarkdown((note.bodyExcerpt ?? '').split('\n')[0]).slice(0, 80);
  const rawPreview = note.title ? (note.bodyExcerpt ?? '') : (note.bodyExcerpt ?? '').split('\n').slice(1).join('\n');
  const bodyPreview = rawPreview ? stripMarkdown(rawPreview) : '';

  return (
    <Card padding="sm" density="row" shadow
      className="group flex items-start gap-1.5 cursor-pointer"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) {
          window.open(homeResourceHref('note', note.id, { kind: home?.home.kind ?? 'personal', spaceId: space?.id }), '_blank')
        } else {
          onOpen?.(note.id)
        }
      }}
    >
      {/* Icon */}
      <div className="mt-0.5 text-muted-foreground/50 flex-shrink-0">
        {note.url ? <ExternalLink size={14} /> : <NoteIcon body={note.bodyExcerpt} size={14} />}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium leading-tight line-clamp-1">{displayTitle}</p>
        {bodyPreview && (
          <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{bodyPreview}</p>
        )}

        {/* Metadata row */}
        <Meta className="mt-1 flex items-center gap-1.5 flex-wrap">
          <TeamLabel teamId={note.sourceTeamId} sourceArea={note.source?.area} />
          <DecisionLabel kind={note.kind} />
          <AreaSelect
            value={note.areaId}
            onChange={(areaId) => onUpdate(note.id, 'areaId', areaId)}
          />

          <MetaItem kind="date" >
            {formatRelativeDate(note.createdAt)}
          </MetaItem>

          {privatePlanning && <TaskPicker
            value={note.taskId}
            onChange={(taskId) => onUpdate(note.id, 'taskId', taskId)}
          />}

          {note.url && (
            <MetaItem as="a"
              href={note.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}

              kind="link"
              className="inline-flex items-center gap-0.5"
            >
              <ExternalLink size={8} /> Link
            </MetaItem>
          )}
        </Meta>
      </div>

      {/* Hover actions */}
      <div data-slot="row-actions" className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              onClick={(e) => e.stopPropagation()}
              label="More note actions"
              variant="ghost"
              size="xs"
              focus="inside"
            >
              <MoreHorizontal size={14} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {note.url && (
              <MenuAction kind="menu" asChild >
                <a href={note.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={12} className="mr-2" /> Open link
                </a>
              </MenuAction>
            )}
            {note.url && <DropdownMenuSeparator />}
            {/* A saved team note is the team's: it leaves your notes, not the team. */}
            {note.sourceTeamId && note.sourceNoteId ? (
              <MenuAction kind="menu"
                onClick={(e) => { e.stopPropagation(); void removeFromMyNotes(note.sourceTeamId!, note.sourceNoteId!); }}

              >
                <X size={12} className="mr-2" /> Remove from my notes
              </MenuAction>
            ) : (
              <>
                <NoteKindMenuItem kind={note.kind} onChange={(kind) => onUpdate(note.id, 'kind', kind)} />
                <DropdownMenuSeparator />
                <MenuAction tone="error" kind="menu"
                  onClick={() => onArchive(note.id)}

                >
                  <Archive size={12} className="mr-2" /> Archive
                </MenuAction>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
