'use client';

import { CornerDownRight } from 'lucide-react';
import { useCoordinatorName } from '@/hooks/use-user-state';
import { useDashboard } from '@/contexts/dashboard-context';
import { executionView, HOME_VIEW } from '@/lib/client/active-view';
import { Button } from '@/components/system/button';
import { startedByTitle, type StartedBy } from '@/lib/sessions/started-by';
import { Tip } from '@/components/ui/tip';
import { cn } from '@/lib/utils';

/**
 * The mark on a chat another chat started (docs/started-chats.md): a corner
 * arrow before its title, the usual sign for a sub-item. Pointing at it names
 * the chat that started it. Chats you started carry nothing.
 */
export function StartedMark({ startedBy, size = 10, className }: { startedBy: StartedBy; size?: number; className?: string }) {
  const coordinatorName = useCoordinatorName();
  const label = `Started by ${startedByTitle(startedBy, coordinatorName)}`;
  return (
    <Tip label={label}>
      <span role="img" aria-label={label} data-started-mark className={cn('inline-flex flex-shrink-0 items-center text-muted-foreground/60', className)}>
        <CornerDownRight size={size} aria-hidden />
      </span>
    </Tip>
  );
}

/** "from <starter>", for a card or a stack that has room to say it. */
export function StartedFromLine({ startedBy, className, iconSize = 11 }: { startedBy: StartedBy; className?: string; iconSize?: number }) {
  const coordinatorName = useCoordinatorName();
  return (
    <span className={cn('flex min-w-0 items-center gap-1 text-muted-foreground', className)}>
      <CornerDownRight size={iconSize} className="flex-shrink-0" aria-hidden />
      <span className="truncate">from {startedByTitle(startedBy, coordinatorName)}</span>
    </span>
  );
}

/**
 * A started chat's way back to the chat that started it, in its header
 * (docs/started-chats.md). Its first message carries the same link, this
 * keeps it in view without scrolling back.
 */
export function StartedFromLink({ startedBy, compact = false }: { startedBy: StartedBy; compact?: boolean }) {
  const { openAgent, setActiveView } = useDashboard();
  const coordinatorName = useCoordinatorName();
  const title = startedByTitle(startedBy, coordinatorName);
  const open = () => {
    if (startedBy.kind === 'agent' && startedBy.workspaceId) openAgent(startedBy.workspaceId);
    else if (startedBy.kind === 'home') setActiveView(HOME_VIEW);
    else setActiveView(executionView(startedBy.sessionId));
  };
  return (
    <Tip label="Started by this chat. Its answer goes back there.">
      <Button
        type="button"
        onClick={open}
        variant="ghost"
        size={compact ? 'xs' : 'sm'}
        data-started-from
        className={cn('flex min-w-0 max-w-[18rem] flex-shrink items-center gap-1', compact && 'max-w-full -ml-1')}
      >
        <CornerDownRight size={compact ? 11 : 12} className="flex-shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex-shrink-0 text-muted-foreground">from</span>
        <span className="truncate font-medium text-foreground/80">{title}</span>
      </Button>
    </Tip>
  );
}
