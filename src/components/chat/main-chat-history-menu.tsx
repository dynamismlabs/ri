'use client';
import { MenuAction } from '@/components/system/menu-action';

import { ChipButton } from '@/components/system/chip-button';
import { useEffect, useRef, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import {
  useMainChat,
  useMainChatHistory,
  useResumeMainChat,
  type MainChatScope,
} from '@/hooks/use-main-chat';
import { formatCompactRelative } from '@/lib/utils/relative-time';
import { cn } from '@/lib/utils';

/**
 * History popover for a main chat: the app's (scope null) or an agent's
 * (its workspace id). Self-contained: reads the list and the current chat
 * from the main-chat hooks (cache shared with HarnessChat, no duplicate
 * fetches) and resumes on click. A live chat shows its last message, an
 * archived one its retrospective summary, and one with no sends yet shows
 * as "New chat".
 */
export function MainChatHistoryMenu({ scope, onOpenChat }: { scope: MainChatScope; onOpenChat?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data: current } = useMainChat(scope);
  const { data: history, isLoading } = useMainChatHistory(scope, open);
  const resume = useResumeMainChat(scope);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const currentId = current?.session?.id ?? null;
  const sessions = history?.sessions ?? [];

  return (
    <div className="relative" ref={menuRef}>
      <ChipButton
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        variant="secondary"
        size="compact"
        pressed={open}
        className="flex items-center gap-1"
      >
        <History size={10} />
        History
      </ChipButton>

      {open && (
        <div data-slot="popover-content" className="absolute right-0 top-full mt-1 w-64 max-h-72 overflow-y-auto rounded-lg border border-border bg-card shadow-xl z-50 py-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={12} className="animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-3 py-3 text-[10.5px] text-muted-foreground/70 text-center">
              No chats yet
            </p>
          ) : (
            sessions.map((s) => {
              const isCurrent = s.id === currentId;
              return (
                <MenuAction selected={!!((isCurrent))} density="compact"
                  key={s.id}
                  onClick={() => {
                    if (onOpenChat) { onOpenChat(s.id); setOpen(false); }
                    else if (isCurrent) setOpen(false);
                    else resume.mutate(s.id, { onSuccess: () => setOpen(false) });
                  }}
                  disabled={resume.isPending}
                  className={cn("w-full flex items-center gap-2 text-left disabled:opacity-50", isCurrent ? "" : "")}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full shrink-0',
                      isCurrent ? 'bg-primary' : 'bg-transparent',
                    )}
                  />
                  {/* Label chain: retrospective summary (archived) → last
                      user message snippet (live) → placeholder (no sends yet). */}
                  <span
                    className={cn(
                      'flex-1 truncate text-[11px]',
                      isCurrent ? 'text-foreground font-medium' : 'text-muted-foreground',
                      !s.label && !s.snippet && 'italic',
                    )}
                  >
                    {s.label ?? s.snippet ?? 'New chat'}
                  </span>
                  <span className="shrink-0 text-[9.5px] text-muted-foreground/60 font-mono">
                    {formatCompactRelative(s.lastActivityAt ?? s.lastOutcomeEventAt ?? s.startedAt)}
                  </span>
                </MenuAction>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
