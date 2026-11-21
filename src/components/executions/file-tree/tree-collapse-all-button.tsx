'use client';

import { IconButton } from '@/components/system/icon-button';
import { ListChevronsDownUp, ListChevronsUpDown } from 'lucide-react';


interface TreeCollapseAllButtonProps {
  /** Whether the tree shows any folder open: the button collapses them all, else expands every folder. */
  anyOpen: boolean;
  onClick: () => void;
  /** Why there's nothing to fold (the flat Changes list, a tree without folders). Disables the button. */
  disabledReason?: string;
}

/**
 * One button beside the tree's search that folds the whole tree: Collapse
 * all while any folder shows open, Expand all once none does. It stays in
 * place when there's nothing to fold, disabled and saying why, so the
 * search field never shifts as the Changes only filter flips.
 */
export function TreeCollapseAllButton({ anyOpen, onClick, disabledReason }: TreeCollapseAllButtonProps) {
  const action = anyOpen ? 'Collapse all folders' : 'Expand all folders';
  return (

      <IconButton
        type="button"
        onClick={onClick}
        disabled={!!disabledReason}
        label={action}
        tooltip={disabledReason ?? action}
        variant="secondary"
        size="sm"
        focus="inside"
        className="inline-flex shrink-0 items-center justify-center"
      >
        {anyOpen ? <ListChevronsDownUp size={14} /> : <ListChevronsUpDown size={14} />}
      </IconButton>

  );
}
