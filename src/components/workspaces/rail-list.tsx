'use client';

import { SegmentedRoot, SegmentedList, SegmentedPanel } from '@/components/system/segmented-control';

import { Button } from '@/components/system/button';
import { IconButton } from '@/components/system/icon-button';
import type { CSSProperties, ReactNode } from 'react';
import { Archive, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { RailTab } from '@/lib/client/rail-tab';
import { useOptionalHomeContext } from '@/components/home/home-context';
import { HOTKEYS } from '@/constants/commands';
import { cachedRailSession, useBulkArchiveSessions } from '@/hooks/use-workspaces';
import { useLeaveArchivedChat, useReviewChanges } from '@/hooks/use-archive-execution';
import { useConfirm } from '@/components/system/confirm-dialog';
import { archiveAnywayDialog } from '@/components/executions/uncommitted-files';

import { Tip } from '@/components/ui/tip';
import { WorkspaceNav } from './workspace-nav';
import { HistoryView } from './history-view';
import { PinnedRail } from './pinned-rail';
import { WorkspaceCreateModal } from './workspace-create-modal';
import { openWorkspaceCreate, setWorkspaceCreateOpen, useWorkspaceCreateOpen } from './workspace-create-store';
import { WorkspaceSelectionBoundary, useWorkspaceSelection } from './workspace-selection-context';

/**
 * The rail's list of work, shared by the wide rail and the collapsed rail's
 * Agents flyout. One header row, then the list. Two lists, the same work
 * two ways:
 *
 *   - **Agents** (`workspace`): the agent tree, each agent with its
 *     executions. Houses the agent actions (create, setup, reorder, archive).
 *   - **Recent** (`history`): every execution, newest first in date groups,
 *     with an agent filter. The only list that shows archived work.
 *
 * Work by status lives in the header's pills, from every view, so the rail
 * doesn't repeat it.
 *
 * Selecting chats to archive happens in the list you're on, in every rail
 * style. Agents unfolds each agent's chats under it, including in the
 * agents-only rail (docs/rail-agents-first.md), which shows none at rest, and
 * Recent ticks its own rows. Nothing switches lists, so archiving or Cancel
 * just folds them back.
 *
 * Both need `WorkspaceSelectionProvider` above them: the header owns the
 * archive-selection toggle and its toolbar, the rows the checkboxes. Both
 * carry `data-rail-list`, where Esc leaves selection.
 */

/**
 * The list's header: which list, and the list's actions. Agents | Recent is
 * a segmented switch at the left (`ListSwitch`), so the header is still one
 * row and the switch reads as the list's title. Select chats to archive sits
 * at the right on both lists, then New agent on Agents. While selecting, the
 * toolbar (count, Archive, Cancel) takes the row.
 */
export function RailListHeader({ tab }: { tab: RailTab }) {
  const selection = useWorkspaceSelection();
  const selecting = selection?.selecting ?? false;
  const count = selection?.count ?? 0;
  const bulkArchive = useBulkArchiveSessions();
  const confirm = useConfirm();
  const reviewChanges = useReviewChanges();
  const leaveArchivedChat = useLeaveArchivedChat();
  const qc = useQueryClient();
  const createOpen = useWorkspaceCreateOpen();
  const canConfigure = useOptionalHomeContext()?.capabilities.configureAgents ?? true;

  const handleConfirmArchive = async () => {
    if (!selection) return;
    const ids = Array.from(selection.selectedIds);
    if (ids.length === 0 || bulkArchive.isPending) return;
    const rows = new Map(ids.map((id) => [id, cachedRailSession(qc, id)]));
    // On the click, as one archive does: if the chat on screen is going,
    // leave it now rather than when the requests return.
    leaveArchivedChat(
      ids.map((id) => ({
        id,
        executionId: rows.get(id)?.executionId,
        workspaceId: rows.get(id)?.workspaceId,
      })),
    );

    // First pass: archive everything that's clean. Worktrees with files
    // that aren't committed come back unforced, naming those files, so the
    // person sees what archiving them anyway would delete.
    const result = await bulkArchive.mutateAsync({ ids, force: false });

    if (result.dirty.length > 0) {
      const ok = await confirm(archiveAnywayDialog(result.dirty, reviewChanges));
      if (ok) {
        const forced = await bulkArchive.mutateAsync({ ids: result.dirty.map((d) => d.id), force: true });
        result.failed.push(...forced.failed);
      }
    }

    if (result.failed.length > 0) {
      const n = result.failed.length;
      // Named, since the person may be looking at something else by now.
      const name = (id: string) => {
        const row = rows.get(id);
        return row?.execution?.label ?? row?.label ?? 'Untitled';
      };
      toast.error(`Couldn't archive ${n} chat${n === 1 ? '' : 's'}`, {
        description: result.failed.map((f) => `${name(f.id)}: ${f.message}`).join('\n'),
      });
    }

    selection.exit();
  };

  return (
    <div data-rail-list="" className="flex min-h-[32px] items-center gap-2 border-y border-border/40 px-3">
      {selecting ? (
        <>
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{count} selected</span>
          <div className="flex-1" />
          <Button
            type="button"
            onClick={() => void handleConfirmArchive()}
            disabled={count === 0 || bulkArchive.isPending}
            variant="primary"
            size="sm"
            className="inline-flex items-center gap-1"
          >
            <Archive size={11} />
            Archive
          </Button>
          <Tip label="Stop selecting" shortcut={HOTKEYS.cancelSelection.label}>
            <Button
              type="button"
              onClick={() => selection?.exit()}
              variant="ghost"
              size="sm"
              className="inline-flex items-center gap-1"
            >
              <X size={11} />
              Cancel
            </Button>
          </Tip>
        </>
      ) : (
        <>
          <ListSwitch />
          <div className="flex-1" />
          {selection && (
            <div className="flex items-center gap-1">
              <IconButton
                type="button"
                onClick={selection.enter}
                label="Select chats to archive"
                tooltip="Select chats to archive"
                variant="ghost"
                size="sm"
              >
                <Archive size={12} />
              </IconButton>

              {tab === 'workspace' && canConfigure && (
                <IconButton
                  type="button"
                  label="New agent"
                  variant="ghost"
                  size="sm"
                  onClick={openWorkspaceCreate}
                >
                  <Plus />
                </IconButton>
              )}
            </div>
          )}
        </>
      )}
      <WorkspaceCreateModal open={createOpen} onOpenChange={setWorkspaceCreateOpen} />
    </div>
  );
}

/**
 * Agents | Recent: both lists in one soft track, the open one raised, the
 * kind of switch the Agent | Document toggle on tasks and notes is. In
 * sentence case on purpose: in the rail, sentence case is what you click
 * (New chat, Board) and small caps label a group (Pinned, Needs you), so
 * the switch can't pass for one more heading.
 */
function ListSwitch() {
  return (
    <SegmentedList
      ariaLabel="Rail list"
      options={[
        { value: 'workspace', label: 'Agents' },
        { value: 'history', label: 'Recent' },
      ]}
    />
  );
}

export function RailListRoot({
  tab,
  onSelect,
  children,
}: {
  tab: RailTab;
  onSelect: (next: RailTab) => void;
  children: ReactNode;
}) {
  return (
    <SegmentedRoot mode="tabs" value={tab} onChange={onSelect}>
      {children}
    </SegmentedRoot>
  );
}

/**
 * Pinned executions, then the chosen list. Pins sit above both lists, so
 * the work you keep close is one glance away whichever list is open.
 * Renders nothing for pins when there are none.
 *
 * While selecting chats to archive, pins duplicate the list's rows, so they
 * step aside rather than offer a plain row above a checkbox for the same chat.
 *
 * `stickyHeaderHeight` is the room the list header takes when it sticks in
 * this list's own scroller, so an agent held in view while selecting sits
 * under it.
 */
export function RailListBody({ tab, stickyHeaderHeight }: { tab: RailTab; stickyHeaderHeight?: number }) {
  const selecting = useWorkspaceSelection()?.selecting ?? false;
  const style = stickyHeaderHeight ? ({ '--rail-sticky-top': `${stickyHeaderHeight}px` } as CSSProperties) : undefined;
  return (
    <SegmentedPanel value={tab} asChild aria-label={tab === 'history' ? 'Recent' : 'Agents'}>
      <div data-rail-list="" className="pt-1" style={style}>
        {!selecting && (
          <WorkspaceSelectionBoundary>
            <PinnedRail />
          </WorkspaceSelectionBoundary>
        )}
        {tab === 'history' ? <HistoryView /> : <WorkspaceNav />}
      </div>
    </SegmentedPanel>
  );
}
