'use client';
import { MenuAction } from '@/components/system/menu-action';

import { IconButton } from '@/components/system/icon-button';
import {
  MoreVertical, Archive, Eye, EyeOff, Settings, Plus, Pin, PinOff,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  useMarkSessionRead,
  useMarkSessionUnread,
  usePinSession,
  useUnpinSession,
} from '@/hooks/use-workspaces';
import { useArchiveExecution } from '@/hooks/use-archive-execution';

interface SessionRowMenuProps {
  sessionId: string;
  /** The row's execution: archiving it leaves a viewer on any of its chats. */
  executionId: string | null;
  workspaceId: string | null;
  /** True when the parent workspace is git-backed. Gates the
   *  "Execution from git…" item. */
  /**
   * Pre-classified read state. The menu hides Mark unread / Mark read
   * based on which one is the current state.
   */
  isUnread: boolean;
  /**
   * Whether this row's execution is pinned to the rail's Pinned group.
   * Toggles the menu item between "Pin to top" and "Unpin". Omitted on
   * rows that can't be pinned (no execution) — the item is hidden then.
   * Rail rows leave it out too: their pin is a button beside the menu
   * (`SessionRowActions`), one click either way.
   */
  isPinned?: boolean;
  label: string;
  /** Open the workspace settings sheet. Hidden when omitted. */
  onOpenWorkspaceSettings?: (id: string) => void;
  /** Open the launcher seeded with the row's workspace. Hidden when omitted. */
  onOpenLauncher?: (workspaceId: string) => void;
  /**
   * The trigger shows only while its row is hovered or the menu is open.
   * False where something around it already decides that (a rail row's
   * actions), so the trigger always shows within it.
   */
  revealOnRowHover?: boolean;
  className?: string;
}

/**
 * Shared per-session context menu. Three intent groups, separated by
 * dividers so the action set is scannable:
 *
 *   1. Read state — Mark read / Mark unread (toggles based on current).
 *   2. Workspace ops — New execution, Execution from git, Workspace
 *      settings. Lifted into the row menu so lists without the workspace
 *      tree (Pinned, Recent) can still drive them.
 *   3. Destructive — Archive.
 *
 * Stops pointerdown so dnd-kit doesn't see the click as a drag start
 * and the row click handler doesn't fire when the menu is invoked.
 */
export function SessionRowMenu({
  sessionId,
  executionId,
  workspaceId,
  isUnread,
  isPinned,
  label,
  onOpenWorkspaceSettings,
  onOpenLauncher,
  revealOnRowHover = true,
  className,
}: SessionRowMenuProps) {
  const { archive } = useArchiveExecution();
  const markRead = useMarkSessionRead();
  const markUnread = useMarkSessionUnread();
  const pin = usePinSession();
  const unpin = useUnpinSession();

  const handleArchive = () => {
    void archive({ id: sessionId, executionId, workspaceId, label });
  };

  const showWorkspaceGroup =
    !!workspaceId && (!!onOpenLauncher || !!onOpenWorkspaceSettings);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          label="Session actions"
          variant="ghost"
          size="xs"
          reveal={revealOnRowHover}
          className={className}
          focus="inside"
        >
          <MoreVertical size={12} />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="text-[11px] min-w-[180px]"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {isUnread ? (
          <MenuAction kind="menu" onSelect={() => markRead.mutate(sessionId)}>
            <Eye size={12} /> Mark as read
          </MenuAction>
        ) : (
          <MenuAction kind="menu" onSelect={() => markUnread.mutate(sessionId)}>
            <EyeOff size={12} /> Mark as unread
          </MenuAction>
        )}

        {isPinned !== undefined && (
          isPinned ? (
            <MenuAction kind="menu" onSelect={() => unpin.mutate(sessionId)}>
              <PinOff size={12} /> Unpin
            </MenuAction>
          ) : (
            <MenuAction kind="menu" onSelect={() => pin.mutate(sessionId)}>
              <Pin size={12} /> Pin to top
            </MenuAction>
          )
        )}

        {showWorkspaceGroup && (
          <>
            <DropdownMenuSeparator />
            {onOpenLauncher && workspaceId && (
              <MenuAction kind="menu" onSelect={() => onOpenLauncher(workspaceId)}>
                <Plus size={12} /> New chat here…
              </MenuAction>
            )}
            {onOpenWorkspaceSettings && workspaceId && (
              <MenuAction kind="menu" onSelect={() => onOpenWorkspaceSettings(workspaceId)}>
                <Settings size={12} /> Agent setup
              </MenuAction>
            )}
          </>
        )}

        <DropdownMenuSeparator />
        <MenuAction kind="menu" tone="error" onSelect={handleArchive}>
          <Archive size={12} /> Archive
        </MenuAction>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
