'use client';
import { MetaItem } from '@/components/system/meta';
import { MenuAction } from '@/components/system/menu-action';

import { StatusBadge } from '@/components/system/status-badge';

import { FileText, Gavel } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { NoteKind } from '@/db/types';

/**
 * What a note is (docs/homes-spec.md §9.7): an ordinary note, or a decision
 * someone marked as one. The kind is stored, so a title never decides it.
 */
export const NOTE_KIND_LABELS: Record<NoteKind, string> = { note: 'Note', decision: 'Decision' };

/** A decision's small label wherever a note is listed. An ordinary note shows none. */
export function DecisionLabel({ kind, className }: { kind: NoteKind | null | undefined; className?: string }) {
  if (kind !== 'decision') return null;
  return (
    <StatusBadge
      className={cn("inline-flex flex-shrink-0 items-center gap-1", className)}
    >
      <Gavel size={9} aria-hidden className="flex-shrink-0" />
      Decision
    </StatusBadge>
  );
}

/** The type line above an open note: "Note", or "Decision" with its mark. */
export function NoteKindHeading({ kind }: { kind: NoteKind }) {
  return (
    <MetaItem kind="entity" className="inline-flex items-center gap-1">
      {kind === 'decision' && <Gavel size={10} aria-hidden />}
      {NOTE_KIND_LABELS[kind]}
    </MetaItem>
  );
}

/**
 * Mark as decision / Make regular note: one menu item that changes the same
 * note's kind. Nothing else about the note moves.
 */
export function NoteKindMenuItem({
  kind,
  onChange,
  className = 'text-xs',
  iconClassName = 'mr-2',
}: {
  kind: NoteKind;
  onChange: (next: NoteKind) => void;
  /** Match the menu it sits in. */
  className?: string;
  iconClassName?: string;
}) {
  const next: NoteKind = kind === 'decision' ? 'note' : 'decision';
  return (
    <MenuAction kind="menu"
      onClick={(e) => e.stopPropagation()}
      onSelect={() => onChange(next)}
      className={className}
    >
      {next === 'decision'
        ? <><Gavel size={12} className={iconClassName} /> Mark as decision</>
        : <><FileText size={12} className={iconClassName} /> Make regular note</>}
    </MenuAction>
  );
}
