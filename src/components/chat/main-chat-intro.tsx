'use client';

import { Button } from '@/components/system/button';
import { createContext, useContext, type ReactNode } from 'react';
import { ArrowUp, PenLine } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { APP_NAME } from '@/constants/app';
import { FIRST_TASK_PROMPT } from '@/lib/coordinator/first-task';
import { trpc } from '@/lib/trpc/client';

import { Tip } from '@/components/ui/tip';

/**
 * What an empty main chat shows instead of a blank column: a line on what
 * this chat is for and a few starters. Sending anything (a starter or a
 * typed message) replaces it with the transcript.
 *
 * A starter either sends as written, or, when it only makes sense with the
 * user's words after it, drops its text in the composer to finish.
 */
export interface MainChatStarter {
  label: string;
  prompt: string;
  /** Put `prompt` in the composer instead of sending it. */
  draft?: boolean;
  /** The one to start with, drawn as the primary button. At most one, first. */
  primary?: boolean;
}

/** What an empty main chat can do: send a starter, or put one in the composer. */
export interface EmptyChatActions {
  send: (prompt: string) => void;
  draft: (prompt: string) => void;
  disabled: boolean;
}

/** Provided by the chat around a custom empty state (`HarnessChat`'s `emptyState`). */
export const EmptyChatActionsContext = createContext<EmptyChatActions | null>(null);

export function useEmptyChatActions(): EmptyChatActions {
  const actions = useContext(EmptyChatActionsContext);
  if (!actions) throw new Error('useEmptyChatActions must be used inside an empty chat');
  return actions;
}

export interface MainChatIntro {
  title: string;
  description: string;
  starters: MainChatStarter[];
}

/**
 * The app's main chat, introducing itself by the name the user calls it.
 * A `fresh` Ri, one with no tasks yet, starts with something real: the
 * person's first task, in their own words, saved and linked in the reply
 * (the brief tells the coordinator how, `FIRST_TASK_PROMPT`). Planning and
 * a look at what it can do stay beside it. The usual starters would read an
 * empty plate, agents and stream.
 */
export function appMainChatIntro(name: string = APP_NAME, { fresh = false }: { fresh?: boolean } = {}): MainChatIntro {
  if (fresh) return {
    title: 'What do you need to get done?',
    description: `I’m ${name}. Tell me one thing you need to do and I’ll save it as your first task. I can also help you plan your day.`,
    starters: [
      { label: 'Capture your first task', prompt: FIRST_TASK_PROMPT, draft: true, primary: true },
      { label: 'Plan my day with me', prompt: 'Help me plan my day. Ask me what I have going on, then turn it into tasks.' },
      { label: 'What can you do for me?', prompt: 'What can you help me with? Keep it short, and suggest one thing to try first.' },
    ],
  };
  return {
    title: 'What should we work on?',
    description:
      `I’m ${name}. I keep your tasks, notes, deck and stream in order, and I can see and steer every agent’s work. Ask me to set ${APP_NAME} up the way you work, too.`,
    starters: [
      { label: 'What’s on my plate today?', prompt: 'What’s on my plate today?' },
      { label: 'What needs me across my agents?', prompt: 'What needs my attention across my agents right now?' },
      { label: 'Triage my stream', prompt: 'Triage my stream.' },
      { label: `Help me set up ${APP_NAME}`, prompt: `Help me set up ${APP_NAME} for how I work. Ask me what you need to know.` },
    ],
  };
}

/** A Ri with no tasks yet. Still loading counts as not fresh. */
export function useFreshHome(enabled = true): boolean {
  const tasks = useQuery({ ...trpc.tasks.list.queryOptions({ limit: 1 }), enabled });
  return tasks.data?.length === 0;
}

/** The app's main chat intro for this Ri: fresh until it has a task. */
export function useAppMainChatIntro(name?: string, enabled = true): MainChatIntro {
  return appMainChatIntro(name, { fresh: useFreshHome(enabled) });
}

/** One agent's main chat. */
export function agentMainChatIntro(name: string): MainChatIntro {
  return {
    title: `Tell ${name} what to build`,
    description:
      'Anything you ask it to build starts a chat you can watch, steer and review. Ask here about its work any time.',
    starters: [
      { label: 'Build something', prompt: 'Build ', draft: true },
      { label: 'What’s in flight?', prompt: 'What are this agent’s chats doing, and does any of them need me?' },
      { label: 'Suggest what to build next', prompt: 'Look around this folder and suggest what to build next.' },
    ],
  };
}

export function MainChatIntroPanel({
  intro,
  onSend,
  onDraft,
  disabled,
  footer,
}: {
  intro: MainChatIntro;
  onSend: (prompt: string) => void;
  onDraft: (prompt: string) => void;
  disabled?: boolean;
  /** Under the starters: a setup step added since this home finished setting up. */
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto my-auto w-full max-w-md px-6 py-8">
        <h2 className="text-[15px] font-semibold text-foreground">{intro.title}</h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{intro.description}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {intro.starters.map((s) => (
            <StarterButton key={s.label} starter={s} size="sm" disabled={disabled} onSend={onSend} onDraft={onDraft} />
          ))}
        </div>
        {footer}
      </div>
    </div>
  );
}

/**
 * One starter: sends as written, or puts its text in the composer to finish.
 * The primary one is the clear first step, the rest are quieter.
 */
export function StarterButton({
  starter,
  size,
  disabled,
  onSend,
  onDraft,
}: {
  starter: MainChatStarter;
  size: 'sm' | 'md';
  disabled?: boolean;
  onSend: (prompt: string) => void;
  onDraft: (prompt: string) => void;
}) {
  return (
    <Tip label={starter.draft ? 'Start this in the composer' : 'Send this'}>
      <Button
        type="button"
        disabled={disabled}
        onClick={() => (starter.draft ? onDraft(starter.prompt) : onSend(starter.prompt))}
        variant={starter.primary ? 'primary' : 'secondary'}
        size={size}
        data-starter-primary={starter.primary || undefined}
        className="inline-flex max-w-full items-center gap-1.5"
      >
        {starter.draft
          ? <PenLine size={11} className="flex-shrink-0" />
          : <ArrowUp size={11} className={starter.primary ? 'flex-shrink-0' : 'flex-shrink-0 opacity-60'} />}
        <span className="truncate">{starter.label}</span>
      </Button>
    </Tip>
  );
}
