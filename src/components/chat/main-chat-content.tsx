'use client';
import { ChipButton } from '@/components/system/chip-button';
import { Loader2, Plus } from 'lucide-react';
import { useOrchestratorName } from '@/hooks/use-user-state';
import { OrchestratorAvatar } from '@/components/shared/orchestrator-mark';
import { HarnessChat } from '@/components/chat/harness-chat';
import { useAppMainChatIntro, type MainChatIntro } from '@/components/chat/main-chat-intro';
import { useNewMainChat, useMainChat, type MainChatScope } from '@/hooks/use-main-chat';
import { ChatMenu } from '@/components/chat-ui/chat-menu';
import { ScheduleChatButton } from '@/components/triggers/schedule-chat-button';
import { MainChatHistoryMenu } from '@/components/chat/main-chat-history-menu';
import { MainChatOnboarding } from '@/components/chat/onboarding/main-chat-onboarding';
import { Tip } from '@/components/ui/tip';
import { useWorkNavigation } from '@/contexts/work-context';

function ChatHeaderBar({
  name,
  onNewChat,
  newChatPending,
  scope = null,
  enabled = true,
}: {
  name: string;
  scope?: MainChatScope;
  enabled?: boolean;
  onNewChat: () => void;
  newChatPending: boolean;
}) {
  const { data: currentChat } = useMainChat(scope);
  const { openExecution } = useWorkNavigation();
  return (
    <div className="shrink-0 flex items-center justify-end gap-1.5 px-2 py-1 border-b border-border/50">
      {/* Who you're talking to, the same name the rail's home row shows. */}
      <span className="mr-auto flex min-w-0 items-center gap-1.5 pl-0.5">
        <OrchestratorAvatar size="xs" />
        <span className="truncate text-[9.5px] font-bold text-muted-foreground">
          {name}
        </span>
      </span>
      {scope === null && <ScheduleChatButton sessionId={currentChat?.session?.id ?? null} />}
      <ChatMenu sessionId={currentChat?.session?.id ?? null} />
      <MainChatHistoryMenu scope={scope} onOpenChat={!enabled ? openExecution : undefined} />
      <Tip label={scope === null ? "Start a new chat (archives the current one)" : "Start a new shared chat"}>
        <ChipButton
          onClick={onNewChat}
          disabled={newChatPending || !enabled}
          variant="secondary"
          size="compact"
          className="flex items-center gap-1"
        >
          {newChatPending ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
          New
        </ChipButton>
      </Tip>
    </div>
  );
}

export function MainChatContent({ scope = null, name, intro, enabled = true }: { scope?: MainChatScope; name: string; intro?: MainChatIntro; enabled?: boolean }) {
  const newChat = useNewMainChat(scope);
  // A team's main chat brings its own intro. The personal one depends on this Ri.
  const appIntro = useAppMainChatIntro(name, scope === null && !intro);

  return (
    <div className="flex flex-col h-full min-h-0">
      <ChatHeaderBar enabled={enabled} scope={scope} name={name} onNewChat={() => newChat.mutate()} newChatPending={newChat.isPending} />
      <HarnessChat
        scope={scope}
        intro={intro ?? appIntro}
        // Every empty main chat asks the onboarding what to show: the
        // first-run conversation, a step added since, or the usual intro.
        emptyState={scope === null ? <MainChatOnboarding /> : undefined}
      />
    </div>
  );
}

export function PersonalMainChatContent() { return <MainChatContent name={useOrchestratorName()} />; }
