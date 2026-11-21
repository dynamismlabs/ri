'use client';
import { StatusBadge } from '@/components/system/status-badge';

import { cn } from '@/lib/utils';
import { TURN_STATUS_EFFORT_LABEL, type ChatTurnStatus } from '@/lib/sessions/turn-status';

/**
 * A chat's status line under its title (docs/chat-status-lines.md): what
 * its agent said at the end of its turn about where it stands. One that
 * waits on the person reads stronger. Nothing without a status: the row keeps
 * its usual line.
 */
export function ChatStatusLine({ status, className }: { status: ChatTurnStatus | null | undefined; className?: string }) {
  if (!status) return null;
  return (
    <span
      data-chat-status={status.needsYou ? 'needs-you' : 'fyi'}
      className={cn(
        'block min-w-0 truncate text-[10px] leading-tight',
        status.needsYou ? 'text-foreground/85' : 'text-muted-foreground/70',
        className,
      )}
    >
      {status.line}
    </span>
  );
}

/**
 * The size of the person's part, at the end of a row's metadata line, apart
 * from the ask so the ask keeps the whole line. A chip, since as plain text it
 * read as one more piece of metadata, and gray, since amber marks what wants
 * you and the row's dot already says that: the size is only how big the ask
 * is. The agent's own estimate, nothing measures it.
 */
export function ChatAskSize({ status }: { status: ChatTurnStatus | null | undefined }) {
  if (!status?.needsYou || !status.effort) return null;
  return (
    <StatusBadge
      data-chat-ask-size={status.effort}
      className="ml-auto flex-shrink-0 whitespace-nowrap"
    >
      {TURN_STATUS_EFFORT_LABEL[status.effort]}
    </StatusBadge>
  );
}
