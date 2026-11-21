'use client';
import { MenuAction } from '@/components/system/menu-action';

import { IconButton } from '@/components/system/icon-button';

import {
  MoreHorizontal,
  Pencil,
  Trash2,
  FilePlus,
  FolderPlus,
  Copy,
  AtSign,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface TreeRowActionsProps {
  kind: 'file' | 'dir';
  /** Always shown — the kebab fades in on hover but stays visible if open. */
  visible: boolean;
  /** Omitted for a read-only folder (the agent view's Files tab). */
  onRename?: () => void;
  onDelete?: () => void;
  /** Only available for dirs — files don't get child-create entries. */
  onCreateFile?: () => void;
  onCreateFolder?: () => void;
  /** Path utilities — shared by files and dirs. Absolute path is
   *  optional because non-git workspaces may not have a worktree path. */
  onCopyRelativePath?: () => void;
  onCopyAbsolutePath?: () => void;
  /** Insert an `@<relative-path>` reference at the composer's cursor. */
  onReferenceInChat?: () => void;
}

/**
 * The hover kebab on a tree row. Lives outside `tree-entry-row.tsx` so
 * the row stays a thin button + label, and the menu's portal-rendered
 * popover doesn't have to thread through the row's flex layout.
 *
 * The trigger swallows clicks (`stopPropagation`) so opening the menu
 * doesn't also fire the row's `onSelect`.
 */
export function TreeRowActions({
  kind,
  visible,
  onRename,
  onDelete,
  onCreateFile,
  onCreateFolder,
  onCopyRelativePath,
  onCopyAbsolutePath,
  onReferenceInChat,
}: TreeRowActionsProps) {
  const hasPathActions = !!(onCopyRelativePath || onCopyAbsolutePath || onReferenceInChat);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label="Row actions" size="xs" reveal={!visible} onClick={event => event.stopPropagation()}>
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="min-w-44">
        {kind === 'dir' && onCreateFile && (
          <MenuAction kind="menu"
            onClick={(e) => {
              e.stopPropagation();
              onCreateFile();
            }}
          >
            <FilePlus size={14} />
            New file
          </MenuAction>
        )}
        {kind === 'dir' && onCreateFolder && (
          <MenuAction kind="menu"
            onClick={(e) => {
              e.stopPropagation();
              onCreateFolder();
            }}
          >
            <FolderPlus size={14} />
            New folder
          </MenuAction>
        )}
        {kind === 'dir' && (onCreateFile || onCreateFolder) && <DropdownMenuSeparator />}
        {onReferenceInChat && (
          <MenuAction kind="menu"
            onClick={(e) => {
              e.stopPropagation();
              onReferenceInChat();
            }}
          >
            <AtSign size={14} />
            Reference in chat
          </MenuAction>
        )}
        {onCopyRelativePath && (
          <MenuAction kind="menu"
            onClick={(e) => {
              e.stopPropagation();
              onCopyRelativePath();
            }}
          >
            <Copy size={14} />
            Copy relative path
          </MenuAction>
        )}
        {onCopyAbsolutePath && (
          <MenuAction kind="menu"
            onClick={(e) => {
              e.stopPropagation();
              onCopyAbsolutePath();
            }}
          >
            <Copy size={14} />
            Copy absolute path
          </MenuAction>
        )}
        {hasPathActions && (onRename || onDelete) && <DropdownMenuSeparator />}
        {onRename && (
          <MenuAction kind="menu"
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
          >
            <Pencil size={14} />
            Rename
          </MenuAction>
        )}
        {onDelete && (
          <MenuAction kind="menu"
            tone="error"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 size={14} />
            Delete
          </MenuAction>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
