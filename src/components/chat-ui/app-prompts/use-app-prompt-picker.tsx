'use client';

import { useCallback, useMemo, useState, type ReactNode, type RefObject } from 'react';
import { toast } from 'sonner';
import type { ChatInputEditorHandle } from '@/components/chat/editor/chat-input-editor';
import type { SlashCommand } from '@/components/chat/editor/slash-menu/types';
import { appPromptCommand, useChatAppPrompts } from '@/hooks/use-app-prompts';
import { uploadAttachment } from '@/lib/attachments/client';
import { appMessageParts } from '@/lib/client/app-message';
import type { ChatAppPrompt } from '@/lib/integrations/app-prompts';
import { trpcClient } from '@/lib/trpc/client';
import { AppPromptDialog } from './app-prompt-dialog';

/**
 * A chat composer's app prompts (docs/personal-apps.md, "Prompts"): the prompts of the apps this
 * chat can use, after its skills in the `/` menu. A prompt with arguments opens a small form first.
 * The app's text, files and resources go in the draft as an app's message does
 * (`appMessageParts`), after the app's chip, so its tools come with the message. Nothing is sent.
 */
export function useAppPromptPicker(chatId: string | null | undefined, editor: RefObject<ChatInputEditorHandle | null>): {
  /** The chat's skills with its apps' prompts after them. */
  withPrompts: (skills: SlashCommand[] | undefined) => SlashCommand[] | undefined;
  onAppPrompt: (prompt: ChatAppPrompt) => void;
  /** Lists the prompts again as the `/` menu opens: an app may have changed them. */
  refresh: () => void;
  dialog: ReactNode;
} {
  const prompts = useChatAppPrompts(chatId);
  const [open, setOpen] = useState<ChatAppPrompt | null>(null);
  const commands = useMemo(() => (prompts.data ?? []).map(appPromptCommand), [prompts.data]);
  const withPrompts = useCallback((skills: SlashCommand[] | undefined) => (commands.length ? [...(skills ?? []), ...commands] : skills), [commands]);

  const fill = useCallback(async (prompt: ChatAppPrompt, args: Record<string, string>) => {
    if (!chatId) return;
    const draft = await trpcClient.personalApps.getChatPrompt.mutate({ chatId, serverId: prompt.serverId, name: prompt.name, arguments: args });
    const { parts } = await appMessageParts(draft.blocks, (file, name) => uploadAttachment(file, name));
    editor.current?.insertAppPrompt(draft.sourceRef, parts);
  }, [chatId, editor]);

  const onAppPrompt = useCallback((prompt: ChatAppPrompt) => {
    if (prompt.arguments.length) { setOpen(prompt); return; }
    fill(prompt, {}).catch((error: unknown) => toast.error(error instanceof Error ? error.message : `${prompt.app} couldn’t fill in that prompt.`));
  }, [fill]);

  const refetch = prompts.refetch;
  const refresh = useCallback(() => { if (chatId) void refetch(); }, [chatId, refetch]);

  const dialog = (
    <AppPromptDialog prompt={open} onOpenChange={(next) => { if (!next) setOpen(null); }}
      onFill={async (args) => { if (open) { await fill(open, args); setOpen(null); } }} />
  );
  return { withPrompts, onAppPrompt, refresh, dialog };
}
