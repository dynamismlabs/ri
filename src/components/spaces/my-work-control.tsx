'use client';
import { MenuAction } from '@/components/system/menu-action';

import { Button } from '@/components/system/button';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, Check, ChevronDown, ListPlus } from 'lucide-react';
import { useState } from 'react';
import { myRiClient } from '@/lib/spaces/my-ri-client';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/system/menu';
import { Tip } from '@/components/ui/tip';
import { addToMyWork, removeFromMyNotes, removeFromMyWork, saveToMyNotes } from './my-work';
import { useSpace } from './space-root';

/**
 * Add to my work, on a team task opened inside My Ri (docs/homes-spec.md
 * §9.3, P7.2). It keeps the task in this person's own work without changing
 * who it's assigned to. A task assigned to them is already there, and says
 * so. Outside My Ri, in the team's own app, there's no personal work to add
 * it to, so nothing shows.
 */
export function MyWorkControl({ taskId }: { taskId: string }) {
  const space = useSpace();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const key = ['my-ri', 'my-work', space?.id, taskId];
  const state = useQuery({
    queryKey: key,
    queryFn: () => myRiClient.spaces.myWork.query({ teamId: space!.id, taskId }),
    enabled: !!space && space.status === 'active',
  });
  if (!space || !state.data) return null;
  const { inMyWork, assigned, added, taskId: localId } = state.data;
  const settle = () => void qc.invalidateQueries({ queryKey: key });

  if (!inMyWork) {
    return (
      <Button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await addToMyWork(space.id, taskId);
          setBusy(false);
          settle();
        }}
        variant="secondary"
        size="sm"
        className="inline-flex items-center gap-1.5"
      >
        <ListPlus size={13} aria-hidden /> Add to my work
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Tip label={assigned ? "It's assigned to you, so it's in My Ri." : 'You added it to your work in My Ri.'}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="inline-flex items-center gap-1"
          >
            <Check size={13} aria-hidden /> In my work <ChevronDown size={11} aria-hidden />
          </Button>
        </Tip>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {localId && (
          // My Ri is its own document (src/lib/spaces/document.ts).
          <MenuAction kind="menu"  onClick={() => window.location.assign(`/task/${localId}`)}>
            Open in My Ri
          </MenuAction>
        )}
        {added && !assigned && (
          <MenuAction kind="menu"

            onClick={async () => {
              await removeFromMyWork(space.id, taskId);
              settle();
            }}
          >
            Remove from my work
          </MenuAction>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Save to my notes, on a team note opened inside My Ri (docs/homes-spec.md
 * §9.3, P7.4): a reference beside personal notes, never a second editable
 * copy. Outside My Ri nothing shows.
 */
export function SaveNoteControl({ noteId }: { noteId: string }) {
  const space = useSpace();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const key = ['my-ri', 'saved-note', space?.id, noteId];
  const state = useQuery({
    queryKey: key,
    queryFn: () => myRiClient.spaces.noteSaved.query({ teamId: space!.id, noteId }),
    enabled: !!space && space.status === 'active',
  });
  if (!space || !state.data) return null;
  const settle = () => void qc.invalidateQueries({ queryKey: key });

  if (!state.data.saved) {
    return (
      <Button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await saveToMyNotes(space.id, noteId);
          setBusy(false);
          settle();
        }}
        variant="secondary"
        size="sm"
        className="inline-flex items-center gap-1.5"
      >
        <BookmarkPlus size={13} aria-hidden /> Save to my notes
      </Button>
    );
  }

  const localId = state.data.noteId;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Tip label="You saved it beside your notes in My Ri.">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="inline-flex items-center gap-1"
          >
            <Check size={13} aria-hidden /> In my notes <ChevronDown size={11} aria-hidden />
          </Button>
        </Tip>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {localId && (
          <MenuAction kind="menu"  onClick={() => window.location.assign(`/note/${localId}`)}>
            Open in My Ri
          </MenuAction>
        )}
        <MenuAction kind="menu"

          onClick={async () => {
            await removeFromMyNotes(space.id, noteId);
            settle();
          }}
        >
          Remove from my notes
        </MenuAction>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
