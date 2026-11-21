'use client';

import { IconButton } from '@/components/system/icon-button';
import { MoreHorizontal } from 'lucide-react';
import { useChatCapabilities } from '@/components/chat-ui/chat-capabilities';
import { CoordinationSettings } from '@/components/chat-ui/coordination/controls';
import { RestartMenuItem } from '@/components/executions/restart-menu-item';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { useRuntimeStatus } from '@/hooks/use-execution';

/**
 * A chat's ⋯ menu, for what stays away from everyday input: its standing
 * coordination preferences (personal chats) and Restart chat, for whoever
 * may stop it, personal or shared. Executions keep the same Restart in their
 * header's menu. Inline, Restart appears only while a chat is blocked
 * (`ChatRecovery`).
 */
export function ChatMenu({ sessionId }: { sessionId: string | null }) {
  return sessionId ? <SessionChatMenu sessionId={sessionId} /> : null;
}

function SessionChatMenu({ sessionId }: { sessionId: string }) {
  const coordination = useChatCapabilities().coordination !== false;
  const { data: runtime } = useRuntimeStatus(sessionId);
  const restart = runtime?.canStop !== false;
  if (!coordination && !restart) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>

          <IconButton
            type="button"
            label="Chat menu"
            tooltip={coordination ? 'Chat permissions, incoming messages and restart' : 'Restart this chat'}
            variant="ghost"
            size="xs"
          >
            <MoreHorizontal size={14} />
          </IconButton>

      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
        {coordination && <div className="p-4"><CoordinationSettings sessionId={sessionId} /></div>}
        {restart && <div className={coordination ? 'border-t p-1' : 'p-1'}><RestartMenuItem sessionId={sessionId} /></div>}
      </PopoverContent>
    </Popover>
  );
}
