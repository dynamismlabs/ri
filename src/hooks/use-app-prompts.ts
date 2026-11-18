'use client';

import { useQuery } from '@tanstack/react-query';
import { usePersonalServices } from '@/components/home/use-personal-services';
import type { SlashCommand } from '@/components/chat/editor/slash-menu/types';
import type { ChatAppPrompt } from '@/lib/integrations/app-prompts';
import { trpc } from '@/lib/trpc/client';

/** An app's prompt as a `/` menu row: `/<app>:<prompt>`, then the app and what the prompt does. */
export function appPromptCommand(prompt: ChatAppPrompt): SlashCommand {
  return {
    id: `app-prompt:${prompt.serverId}:${prompt.name}`,
    name: prompt.command,
    description: `${prompt.app} · ${prompt.title ?? prompt.description ?? prompt.name}`,
    source: 'app',
    userInvocable: true,
    available: true,
    execution: { kind: 'expanded-prompt', provider: 'ri' },
    appPrompt: prompt,
  };
}

/**
 * The prompts of the apps a chat can use (src/lib/integrations/app-prompts.ts). Ri keeps each
 * app's list until the app says it changed, so asking again is cheap: the composer asks as its
 * `/` menu opens.
 */
export function useChatAppPrompts(chatId: string | null | undefined) {
  const personal = usePersonalServices();
  return useQuery({
    ...trpc.personalApps.chatPrompts.queryOptions({ chatId: chatId ?? '' }, { staleTime: 15_000 }),
    enabled: personal && !!chatId,
    refetchOnWindowFocus: true,
  });
}
