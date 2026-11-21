'use client';

import { IconButton } from '@/components/system/icon-button';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';


/**
 * The parts of a tools panel's strip that the execution view's panel
 * (`workbench-panel.tsx`) and the agent view's tools (`agents/agent-tools.tsx`)
 * share, so both strips look and behave the same. Kept apart from the panel
 * itself, which brings every execution view with it.
 */

/** Rich file/chat containers beside the primary track, retained until the content migration. */
export function panelTabClass(on: boolean): string {
  return cn(
    // Compatibility drawing for content containers, not SegmentedControl options.
    'panel-tab -mb-px whitespace-nowrap border-b-2 px-2.5 text-[12.5px] font-medium transition-colors',
    on ? 'panel-tab-on border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
  );
}

/**
 * The right end of a tools panel's strip: expand to the whole view (the
 * chat folds to a strip) or bring the chat back, and close the panel.
 * Escape does the same, restoring first.
 */
export function PanelWindowControls({
  maximized,
  onToggleMaximize,
  onClose,
}: {
  maximized: boolean;
  onToggleMaximize: () => void;
  onClose: () => void;
}) {
  return (
    <>

        <IconButton
          type="button"
          onClick={onToggleMaximize}
          label={maximized ? 'Restore the chat' : 'Expand the panel'}
          tooltip={maximized ? 'Bring the chat back' : 'Expand to the whole view (or double-click a tab)'}
          shortcut={maximized ? 'Esc' : undefined}
          variant="ghost"
          size="sm"
          className="my-1 inline-flex flex-shrink-0 items-center justify-center"
        >
          {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </IconButton>


        <IconButton
          type="button"
          onClick={onClose}
          label="Close the panel"
          tooltip="Close the panel"
          shortcut="Esc"
          variant="ghost"
          size="sm"
          className="my-1 inline-flex flex-shrink-0 items-center justify-center"
        >
          <X size={14} />
        </IconButton>

    </>
  );
}
