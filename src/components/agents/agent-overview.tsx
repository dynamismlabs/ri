'use client';
import { InlineAction } from '@/components/system/inline-action';

import { StatusBadge } from '@/components/system/status-badge';

import { Button } from '@/components/system/button';
import type { ReactNode } from 'react';
import { AppWindow, ExternalLink, ListTodo, Loader2, Moon, Pin, Plus } from 'lucide-react';
import { useWorkNavigation, useWorkActivity } from '@/contexts/work-context';
import { useAgentExecutions, useAgentPreviews, useAgentTasks } from '@/hooks/use-agent';
import { useDiffStats } from '@/hooks/use-workspaces';
import { openLauncher } from '@/components/workspaces/launcher/launcher-store';
import { DiffStatsPair } from '@/components/workspaces/diff-stats';
import { SessionRowMenu } from '@/components/workspaces/session-row-menu';
import { ChatAskSize, ChatStatusLine } from '@/components/workspaces/chat-status-line';
import { InactiveFold } from '@/components/workspaces/inactive-fold';
import { ChatLensBar, ChatLensPanel, ChatLenses } from '@/components/workspaces/chat-lens-bar';
import { useAgentChatLens, type AgentChatLens } from '@/lib/client/chat-lens';
import { harnessDefinition } from '@/lib/harness/registry';
import { formatCompactRelative } from '@/lib/utils/relative-time';
import type { RailSession } from '@/lib/api/sessions';
import type { AgentPreview } from '@/lib/api/agents';
import type { WorkspaceRecord } from '@/db/types';
import type { AgentTab } from '@/types/dashboard';
import { cn } from '@/lib/utils';
import { BACKGROUND_DOT, BACKGROUND_LABEL, UNREAD_WITH_BACKGROUND_DOT } from '@/components/workspaces/activity-style';
import { Tip } from '@/components/ui/tip';

type RowState = 'approve' | 'unread' | 'working' | 'idle';

/**
 * The agent's chats (docs/agents-view-spec.md Phase 7), under three tabs
 * (docs/chat-lenses.md): All, its pins and then every chat newest first, each
 * with a dot for its state; Unread, what wants you; Working, what's running.
 * Each tab carries its count, so the row of tabs says what needs you and
 * what's running before you pick one. The tab is remembered across agents.
 * All also holds the tasks its chats are working and its previews.
 */
export function AgentOverview({
  workspace,
  onSelectTab,
}: {
  workspace: WorkspaceRecord;
  onSelectTab: (tab: AgentTab) => void;
}) {
  const { needsYou, needsYouInactive, working, pinned, pinnedInactive, unpinned, unpinnedInactive, all, isLoading } =
    useAgentExecutions(workspace.id);
  const [lens, setLens] = useAgentChatLens();
  const archived = workspace.status === 'archived';

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={14} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-8">
        <div>
          <p className="text-[13px] font-semibold text-foreground">No chats yet</p>
          <p className="text-[11px] text-muted-foreground/80 mt-1 max-w-xs">
            {archived
              ? 'This agent is archived.'
              : `Start a chat in ${workspace.name}, or ask its main chat to start one for you.`}
          </p>
          {!archived && (
            <Button
              onClick={() => openLauncher(workspace.id)}
              variant="primary"
              size="md"
              className="mt-3 inline-flex items-center gap-1.5"
            >
              <Plus size={12} strokeWidth={2.5} />
              New chat
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Each chat's dot in All: blocked, unread, working or quiet.
  const states = new Map<string, RowState>();
  for (const s of working) states.set(s.id, 'working');
  for (const { session, bucket } of [...needsYou, ...needsYouInactive]) {
    states.set(session.id, bucket === 'needsApproval' ? 'approve' : 'unread');
  }
  const state = (s: RailSession): RowState => states.get(s.id) ?? 'idle';

  return (
    <ChatLenses value={lens} onChange={setLens} className="flex-1 min-h-0 flex flex-col">
      <div className="flex-shrink-0 px-3 pt-3 pb-2">
        <ChatLensBar<AgentChatLens>
          label={`Show chats in ${workspace.name}`}
          options={[
            { value: 'all', label: 'All' },
            {
              value: 'unread',
              label: 'Unread',
              count: needsYou.length,
              tone: 'attention',
              pulse: needsYou.some((n) => n.bucket === 'needsApproval'),
            },
            { value: 'working', label: 'Working', count: working.length, tone: 'working' },
          ]}
        />
      </div>
      <ChatLensPanel value="all" className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-5">
        {pinned.length + pinnedInactive.length > 0 && (
          <Section title="Pinned" icon={<Pin size={10} className="-rotate-45" />} count={pinned.length} showBody>
            {pinned.map((s) => (
              <ExecutionRow key={s.id} session={s} state={state(s)} />
            ))}
            <InactiveFold sectionId={`overview:${workspace.id}:pinned`} count={pinnedInactive.length} className="pl-4">
              {pinnedInactive.map((s) => (
                <ExecutionRow key={s.id} session={s} state={state(s)} inactive />
              ))}
            </InactiveFold>
          </Section>
        )}
        {unpinned.length + unpinnedInactive.length > 0 && (
          // Titled only under the pins, to tell the two apart. Alone, the tab says it.
          <Section title={pinned.length + pinnedInactive.length > 0 ? 'Recent' : undefined} count={0} showBody>
            {unpinned.map((s) => (
              <ExecutionRow key={s.id} session={s} state={state(s)} />
            ))}
            <InactiveFold sectionId={`overview:${workspace.id}:recent`} count={unpinnedInactive.length} className="pl-4">
              {unpinnedInactive.map((s) => (
                <ExecutionRow key={s.id} session={s} state={state(s)} inactive />
              ))}
            </InactiveFold>
          </Section>
        )}
        <AgentTasksSection workspaceId={workspace.id} />
        <AgentPreviewsSection workspaceId={workspace.id} onOpenPreviewTab={() => onSelectTab('preview')} />
      </ChatLensPanel>
      <ChatLensPanel value="unread" className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        {needsYou.length + needsYouInactive.length === 0 && <LensEmpty text="Nothing waiting on you." />}
        <div className="space-y-px">
          {needsYou.map(({ session, bucket }) => (
            <ExecutionRow key={session.id} session={session} state={bucket === 'needsApproval' ? 'approve' : 'unread'} />
          ))}
        </div>
        <InactiveFold sectionId={`overview:${workspace.id}:needs`} count={needsYouInactive.length} className="pl-4">
          {needsYouInactive.map(({ session, bucket }) => (
            <ExecutionRow
              key={session.id}
              session={session}
              state={bucket === 'needsApproval' ? 'approve' : 'unread'}
              inactive
            />
          ))}
        </InactiveFold>
      </ChatLensPanel>
      <ChatLensPanel value="working" className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        {working.length === 0 && <LensEmpty text="Nothing running right now." />}
        <div className="space-y-px">
          {working.map((s) => (
            <ExecutionRow key={s.id} session={s} state="working" />
          ))}
        </div>
      </ChatLensPanel>
    </ChatLenses>
  );
}

function LensEmpty({ text }: { text: string }) {
  return <p className="px-1 pt-6 text-center text-[11px] text-muted-foreground/60">{text}</p>;
}

function Section({
  title,
  icon,
  count,
  tone,
  empty,
  showBody = false,
  children,
}: {
  /** None for a list the tab above already names. */
  title?: string;
  icon?: ReactNode;
  count: number;
  tone?: 'attention' | 'working';
  /** Shown when the section has nothing. Sections without it hide instead. */
  empty?: string;
  /** Render the body even at a count of 0 (a section holding only folded inactive rows). */
  showBody?: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      {title && <h3 className="flex items-center gap-1.5 px-1 mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {icon}
        {title}
        {count > 0 && (
          <StatusBadge tone={(tone === 'attention' ? "warning" : (tone === 'working' ? "success" : "neutral"))}

          >
            {count}
          </StatusBadge>
        )}
      </h3>}
      {count === 0 && empty && !showBody ? (
        <p className="px-1 text-[11px] text-muted-foreground/60">{empty}</p>
      ) : (
        <div className="space-y-px">{children}</div>
      )}
    </section>
  );
}

/** One execution: label, diff, harness and last activity. Opens the execution view. */
function ExecutionRow({ session, state, inactive = false }: { session: RailSession; state: RowState; inactive?: boolean }) {
  const { openExecution } = useWorkNavigation();
  const { activeSessionId, backgroundSessionIds } = useWorkActivity();
  const { data: diffStats } = useDiffStats(session.id, session.executionId ?? null);
  // The turn is over but something it started is still running. Not working.
  const background = state !== 'working' && backgroundSessionIds.has(session.id);
  const label = session.execution?.label ?? session.label ?? 'Untitled';
  const untitled = !(session.execution?.label ?? session.label);
  const timestamp = session.lastActivityAt ?? session.lastOutcomeEventAt ?? session.startedAt;
  const isPinned = !!session.execution?.pinnedAt;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openExecution(session.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openExecution(session.id);
        }
      }}
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-[color,background-color,opacity]',
        activeSessionId === session.id ? 'bg-secondary' : 'hover:bg-muted/50',
        inactive && activeSessionId !== session.id && 'opacity-60 hover:opacity-100',
      )}
    >
      <StateDot state={state} background={background} />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'truncate text-[12px]',
            untitled ? 'italic text-muted-foreground/70' : 'text-foreground/90',
            state === 'unread' && !untitled ? 'font-semibold' : 'font-medium',
          )}
        >
          {label}
        </div>
        {/* What its agent said it needs or did (docs/chat-status-lines.md). */}
        <ChatStatusLine status={session.turnStatus} className="mt-0.5 text-[11px]" />
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
          <span>{harnessDefinition(session.harness).name}</span>
          <DiffStatsPair stats={diffStats} className="text-[9.5px]" />
          <ChatAskSize status={session.turnStatus} />
        </div>
      </div>
      <div className="relative flex items-center flex-shrink-0 text-[10px] min-h-5">
        <span className="transition-opacity group-hover:opacity-0 group-has-data-[state=open]:opacity-0">
          {state === 'approve' ? (
            <span className="font-medium text-amber-500/90">approve</span>
          ) : state === 'working' ? (
            <span className="text-emerald-600/80 dark:text-emerald-400/80">working</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground/70">
              {inactive && <Moon size={10} aria-label="Inactive" />}
              {formatCompactRelative(timestamp)}
            </span>
          )}
        </span>
        <SessionRowMenu
          sessionId={session.id}
          executionId={session.executionId ?? null}
          workspaceId={session.workspaceId ?? null}
          isUnread={state === 'unread'}
          isPinned={isPinned}
          label={label}
          className="absolute right-0 top-1/2 -translate-y-1/2"
        />
      </div>
    </div>
  );
}

function StateDot({ state, background = false }: { state: RowState; background?: boolean }) {
  return (
    <Tip label={background ? BACKGROUND_LABEL : undefined}>
      <span
        aria-hidden
        className={cn(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          state === 'approve' && 'bg-amber-500',
          state === 'unread' && (background ? UNREAD_WITH_BACKGROUND_DOT : 'bg-amber-500'),
          state === 'working' && 'bg-emerald-500 animate-pulse',
          state === 'idle' && (background ? BACKGROUND_DOT : 'bg-muted-foreground/25'),
        )}
      />
    </Tip>
  );
}

function AgentTasksSection({ workspaceId }: { workspaceId: string }) {
  const { openTask } = useWorkNavigation();
  const { data } = useAgentTasks(workspaceId);
  const tasks = data?.tasks ?? [];
  if (tasks.length === 0) return null;
  return (
    <Section title="Tasks" icon={<ListTodo size={10} />} count={tasks.length}>
      <div className="flex flex-wrap gap-1.5 px-1 pt-0.5">
        {tasks.map((t) => (
          <Tip key={t.id} label={t.title || 'Untitled'} onlyWhenTextHidden>
            <Button variant="secondary" size="xs"
              onClick={() => openTask(t.id)}

              data-status={t.status}
              className={cn("inline-flex max-w-[16rem] items-center gap-1", t.status === "in_progress"
    ? "" : "")}
            >
              <span className="truncate">{t.title || 'Untitled'}</span>
            </Button>
          </Tip>
        ))}
      </div>
    </Section>
  );
}

function AgentPreviewsSection({ workspaceId, onOpenPreviewTab }: { workspaceId: string; onOpenPreviewTab: () => void }) {
  const { data } = useAgentPreviews(workspaceId);
  const previews = data?.previews ?? [];
  if (previews.length === 0) return null;
  return (
    <Section title="Preview" icon={<AppWindow size={10} />} count={previews.length}>
      {previews.map((p) => (
        <PreviewRow key={`${p.executionId}:${p.service ?? ''}`} preview={p} onOpen={onOpenPreviewTab} />
      ))}
    </Section>
  );
}

function PreviewRow({ preview, onOpen }: { preview: AgentPreview; onOpen: () => void }) {
  const running = preview.serverStatus === 'running';
  const url = preview.remoteUrl ?? preview.localUrl;
  const statusLabel =
    preview.serverStatus === 'running'
      ? preview.port ? `running on port ${preview.port}` : 'running'
      : preview.serverStatus === 'starting'
        ? 'starting'
        : preview.serverStatus === 'crashed'
          ? 'crashed'
          : 'stopped';
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50">
      <span
        aria-hidden
        className={cn(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          running ? 'bg-emerald-500' : preview.serverStatus === 'crashed' ? 'bg-rose-500' : 'bg-muted-foreground/30',
        )}
      />
      <InlineAction  onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="truncate text-[12px] font-medium text-foreground/90">
          {preview.label ?? preview.previewName}
          {preview.service ? <span className="text-muted-foreground/70"> · {preview.service}</span> : null}
        </div>
        <div className="text-[10px] text-muted-foreground/70">{statusLabel}</div>
      </InlineAction>
      {running && url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-[10.5px] text-primary hover:underline flex-shrink-0"
        >
          Open
          <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}
