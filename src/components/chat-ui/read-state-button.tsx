'use client';

import { Button } from '@/components/system/button';
import { IconButton } from '@/components/system/icon-button';
import { EyeOff } from 'lucide-react';
import { Tip } from '@/components/ui/tip';
import { useSession } from '@/hooks/use-execution';
import { useMarkSessionRead, useMarkSessionUnread } from '@/hooks/use-workspaces';
import { isSessionUnread } from '@/lib/utils/session-sort';
import { cn } from '@/lib/utils';

/**
 * Mark unread, where you're reading. Reading a chat clears it, so this is the
 * way back to it: marked unread, it stays lit (bold with a dot in the rail,
 * counted in the header's Unread) until you read it again. Marked, the button
 * says Unread in the rail's amber, and a click marks it read.
 *
 * Reads and writes the chat's own read state (`unread_marker_at`, the same
 * one the rail's Mark as unread sets), through the optimistic hooks, so the
 * rail and this button agree at once. Nothing for an archived chat.
 */
export function ReadStateButton({ sessionId, className }: { sessionId: string | null; className?: string }) {
  const { data: chat } = useSession(sessionId);
  const markRead = useMarkSessionRead();
  const markUnread = useMarkSessionUnread();
  if (!chat || chat.status !== 'active') return null;

  if (isSessionUnread(chat)) {
    return (
      <Tip label="Mark read">
        <Button
          type="button"
          onClick={() => markRead.mutate(chat.id)}
          aria-label="Unread, mark read"
          variant="ghost"
          size="xs"
          tone="warning"
          className={cn("flex flex-shrink-0 items-center gap-1", className)}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Unread
        </Button>
      </Tip>
    );
  }

  return (
      <IconButton
        type="button"
        onClick={() => markUnread.mutate(chat.id)}
        label="Mark unread"
        tooltip="Mark unread to come back to it. It stays lit until you open it again."
        variant="ghost"
        size="xs"
        className={cn("flex-shrink-0", className)}
      >
        <EyeOff size={13} />
      </IconButton>
  );
}
