"use client";
import { InlineAction } from '@/components/system/inline-action';

import { MenuAction } from '@/components/system/menu-action';

import { IconButton } from '@/components/system/icon-button';
import { Button } from '@/components/system/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { BACKGROUND_DOT, BACKGROUND_LABEL } from '@/components/workspaces/activity-style';
import { InactiveFold } from '@/components/workspaces/inactive-fold';
import { WorkspaceCreateModal } from '@/components/workspaces/workspace-create-modal';
import { ChatAskSize, ChatStatusLine } from '@/components/workspaces/chat-status-line';
import { ChatLensBar, ChatLensPanel, ChatLenses } from '@/components/workspaces/chat-lens-bar';
import { AgentIcon } from '@/components/agents/agent-icon';
import { useWorkNavigation, useWorkActivity } from '@/contexts/work-context';
import { useOptionalHomeContext } from '@/components/home/home-context';
import { useExecutionRuntimeScope } from '@/components/home/execution-runtime-context';
import { useDefaultSelection } from '@/hooks/use-default-selection';
import { openLauncher } from '@/components/workspaces/launcher/launcher-store';
import type { WorkspaceWithCounts } from '@/db/types';
import { useInactivity } from '@/hooks/use-inactivity';
import { useAgentsTabWork, type AgentsTabWork } from '@/hooks/use-agents-tab-work';
import type { AgentAttentionItem } from '@/hooks/use-agent-attention';
import { useRailSessions, useWorkspaces } from '@/hooks/use-workspaces';
import type { ChatSessionWithExecution } from '@/lib/api/dto/records';
import { useAgentViewMode } from '@/lib/client/agent-view-mode';
import { usePhoneChatLens, usePhoneOpenAgents, type PhoneChatLens } from '@/lib/client/chat-lens';
import { startExecution } from '@/lib/executions/start-execution';
import { agentVoice, mainChatActivity, type AgentActivity, type VoiceTone } from '@/lib/utils/agent-rail';
import { cn } from '@/lib/utils';
import { formatCompactRelative } from '@/lib/utils/relative-time';
import { isSessionUnread, latestActivityAt, sortSessionsHotnessDesc } from '@/lib/utils/session-sort';
import type { AgentTab } from '@/types/dashboard';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  ChevronRight,
  FileText,
  Laptop,
  Moon,
  MoreHorizontal,
  Plus,
  Settings,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { RunOnSheet } from './run-on-sheet';
import { Tip } from '@/components/ui/tip';
import { MobileReviewRow } from '@/components/results/mobile-review-attention';

/**
 * The phone's Agents tab (docs/chat-lenses.md). The same chats answer three
 * questions, so three tabs sit at the top, each with its count:
 *
 *   - Unread: everything that wants you, blocked first, each chat with what
 *     its agent said it did or needs, so most can be read from the list.
 *   - Working: what's running now.
 *   - Agents: every agent, each with its own state and what it last said,
 *     its chats under it. Where you go to reach a chat or start one.
 *
 * The tab you pick is remembered, so coming back from a chat lands where you
 * were. Search in the top bar finds any chat by name or message.
 */
export function MobileAgentsView() {
  const { data: workspaces, isLoading } = useWorkspaces({ status: 'active' });
  const [createWsOpen, setCreateWsOpen] = useState(false);
  const canConfigure = useOptionalHomeContext()?.capabilities.configureAgents ?? true;
  const [lens, setLens] = usePhoneChatLens();
  const work = useAgentsTabWork();

  const createModal = canConfigure && <WorkspaceCreateModal open={createWsOpen} onOpenChange={setCreateWsOpen} />;

  // No agents, nothing to sort: just the way to add one.
  if (!isLoading && (workspaces?.length ?? 0) === 0) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <EmptyWorkspaces onCreate={canConfigure ? () => setCreateWsOpen(true) : undefined} />
        {createModal}
      </div>
    );
  }

  return (
    <ChatLenses value={lens} onChange={setLens} className="flex h-full min-h-0 flex-col">
      <div className="flex-shrink-0 px-3 pb-2">
        <ChatLensBar<PhoneChatLens>
          size="touch"
          label="Show chats"
          options={[
            { value: 'unread', label: 'Unread', count: work.counts.unread, tone: 'attention', pulse: work.counts.blocked > 0 },
            { value: 'working', label: 'Working', count: work.counts.working, tone: 'working' },
            { value: 'agents', label: 'Agents' },
          ]}
        />
      </div>
      <ChatLensPanel value="unread" className="flex-1 min-h-0 overflow-y-auto">
        <UnreadLens work={work} />
      </ChatLensPanel>
      <ChatLensPanel value="working" className="flex-1 min-h-0 overflow-y-auto">
        <WorkingLens work={work} />
      </ChatLensPanel>
      <ChatLensPanel value="agents" className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-3 pb-24 space-y-1">
          {isLoading && (
            <div className="px-3 py-3 text-[12px] italic text-muted-foreground/60">
              Loading…
            </div>
          )}
          {workspaces?.map((ws) => <WorkspaceBlock key={ws.id} workspace={ws} />)}
          {/* Adding an agent is rare, so it waits at the end of the list. */}
          {canConfigure && workspaces && (
            <MenuAction
              type="button"
              onClick={() => setCreateWsOpen(true)}
              className="w-full flex items-center gap-2.5 text-left"
            >
              <span className="w-8 h-8 flex items-center justify-center flex-shrink-0 rounded-lg bg-primary/10">
                <Plus size={16} />
              </span>
              New agent
            </MenuAction>
          )}
        </div>
      </ChatLensPanel>
      {createModal}
    </ChatLenses>
  );
}

// ─── Unread ───────────────────────────────────────────────────────

function UnreadLens({ work }: { work: AgentsTabWork }) {
  const agentName = useAgentNames();
  const { agents, blocked, unread, unreadInactive, reviewsWaiting } = work;
  const empty = agents.length + blocked.length + unread.length + reviewsWaiting.length === 0;
  return (
    <div className="px-3 pb-24">
      {empty && (
        <LensEmpty
          title="Nothing unread"
          detail={unreadInactive.length > 0 ? 'Older unread chats are under the fold below.' : 'New replies, and anything waiting on you, show here.'}
        />
      )}
      <div className="space-y-0.5">
        {agents.map((item) => <MobileAgentAttentionRow key={item.workspace.id} item={item} />)}
        {blocked.map((s) => (
          <MobileChatRow key={s.id} session={s} agentName={s.workspaceName ?? undefined} waitingOn={s.waitingOn} />
        ))}
        {reviewsWaiting.map((review) => <MobileReviewRow key={review.reviewId} review={review} />)}
        {unread.map((s) => (
          <MobileChatRow key={s.id} session={s} agentName={agentName(s.workspaceId)} />
        ))}
      </div>
      <InactiveFold sectionId="unread" count={unreadInactive.length} touch className="pl-8">
        {unreadInactive.map((s) => (
          <MobileChatRow key={s.id} session={s} agentName={agentName(s.workspaceId)} inactive />
        ))}
      </InactiveFold>
    </div>
  );
}

// ─── Working ──────────────────────────────────────────────────────

function WorkingLens({ work }: { work: AgentsTabWork }) {
  const { working, reviewsWorking } = work;
  return (
    <div className="px-3 pb-24">
      {working.length + reviewsWorking.length === 0 && (
        <LensEmpty title="Nothing running right now" detail="A chat shows here while its agent is working." />
      )}
      <div className="space-y-0.5">
        {working.map((s) => (
          <MobileChatRow key={s.id} session={s} agentName={s.workspaceName ?? undefined} />
        ))}
        {reviewsWorking.map((review) => <MobileReviewRow key={review.reviewId} review={review} />)}
      </div>
    </div>
  );
}

function LensEmpty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-6 pt-10 pb-6 text-center">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">{detail}</p>
    </div>
  );
}

/** Each agent's name by id, for rows that list several agents' chats. */
function useAgentNames() {
  const { data: workspaces } = useWorkspaces({ status: 'active' });
  return (id: string | null) => (id && workspaces?.find((w) => w.id === id)?.name) || undefined;
}

// ─── Agent rows ───────────────────────────────────────────────────

const VOICE_TONE: Record<VoiceTone, string> = {
  attention: 'text-amber-600 dark:text-amber-400',
  working: 'text-emerald-600 dark:text-emerald-400',
  strong: 'text-foreground/85',
  muted: 'text-muted-foreground/70',
};

const PRESENCE: Record<Exclude<AgentActivity, null>, { dot: string; label: string }> = {
  waiting: { dot: 'bg-amber-500 animate-pulse', label: 'Waiting on you' },
  thinking: { dot: 'bg-emerald-500 animate-pulse', label: 'Thinking' },
  replied: { dot: 'bg-amber-500', label: 'New reply' },
};

/** The agent's icon with a dot for what its own chat is doing, as in the rail. */
function AgentPresenceIcon({ workspace, activity }: { workspace: WorkspaceWithCounts; activity: AgentActivity }) {
  return (
    <span className="relative w-8 h-8 flex items-center justify-center flex-shrink-0">
      <AgentIcon workspace={workspace} size="md" />
      {activity && (
        <span
          aria-hidden
          className={cn('absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-background', PRESENCE[activity].dot)}
        />
      )}
    </span>
  );
}

/** An agent whose own chat wants you, in Unread: what it's asking or said. Opens the agent. */
function MobileAgentAttentionRow({ item }: { item: AgentAttentionItem }) {
  const { openAgent } = useWorkNavigation();
  const { workspace, chat, activity } = item;
  const voice = agentVoice({ activity, waitingOn: chat.waitingOn, preview: chat.preview, purpose: workspace.purpose });
  const at = latestActivityAt(chat);
  return (
    <MenuAction
      type="button"
      onClick={() => openAgent(workspace.id)}
      aria-label={`${workspace.name}: ${PRESENCE[activity].label}`}
      className="w-full flex items-start gap-2.5 text-left"
    >
      <AgentPresenceIcon workspace={workspace} activity={activity} />
      <span className="flex-1 min-w-0">
        <span className="flex items-baseline gap-2">
          <span className="flex-1 min-w-0 truncate text-[14px] font-semibold text-foreground">{workspace.name}</span>
          {at && <span className="flex-shrink-0 text-[11px] text-muted-foreground/70">{formatCompactRelative(at)}</span>}
        </span>
        <span className={cn('mt-0.5 block line-clamp-2 text-[12px] leading-snug', VOICE_TONE[voice.tone])}>{voice.text}</span>
      </span>
    </MenuAction>
  );
}

// ─── Agents ───────────────────────────────────────────────────────

/**
 * One agent: its own state (the dot on its icon, its name in bold when it
 * wants you, and a line in its voice), how many of its chats need you and are
 * working, its menu, + for a new chat, and the chevron that shows its chats.
 * The same row as the agents-only rail (docs/rail-agents-first.md), sized
 * for a finger. Folded until opened on this phone, so the tab starts as one
 * row per agent.
 */
function WorkspaceBlock({ workspace }: { workspace: WorkspaceWithCounts }) {
  const { streamingSessionIds, pendingInputSessionIds, activeSessionId, activeExecutionId } = useWorkActivity();
  const { openExecution, openAgent } = useWorkNavigation();
  const { personalControls } = useExecutionRuntimeScope();
  const defaultSelection = useDefaultSelection();
  const { opensView } = useAgentViewMode();
  const { isInactive } = useInactivity();
  const { data: rail } = useRailSessions();
  const [openAgents, toggleOpen] = usePhoneOpenAgents();
  // Guards double-fire only — see WorkspaceNav.handleCreateExecution.
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();
  // Folded until you open it on this phone (`usePhoneOpenAgents`).
  const expanded = openAgents.has(workspace.id);

  // Mirror the desktop rail's WorkspaceNav.handleCreateExecution: navigate
  // into the new ExecutionView immediately and let the create land behind it.
  // The label is null until the first message derives one server-side; the
  // header renders "Untitled" in the meantime.
  const handleCreateExecution = (deviceId?: string) => {
    if (creating) return;
    if (!personalControls && !defaultSelection?.model) { openLauncher(workspace.id); return; }
    setCreating(true);
    const { sessionId, done } = startExecution(qc, { workspaceId: workspace.id, deviceId, ...(defaultSelection ? { harness: defaultSelection.harness, model: defaultSelection.model, modelVariant: defaultSelection.variant, effort: defaultSelection.effort } : {}) });
    openExecution(sessionId);
    void done.finally(() => setCreating(false));
  };
  // + starts where the agent usually runs. Another device, for this one
  // execution, is in the agent's ⋯ menu (spec §3.3).
  const [pickingDevice, setPickingDevice] = useState(false);
  const openAgentTab = (tab: AgentTab) => {
    openAgent(workspace.id, tab);
  };

  const chat = rail?.mainChats?.find((c) => c.workspaceId === workspace.id) ?? null;
  const activity = mainChatActivity(chat, pendingInputSessionIds, streamingSessionIds);
  const wantsYou = activity === 'waiting' || activity === 'replied';
  const voice = agentVoice({
    activity,
    waitingOn: chat?.waitingOn ?? null,
    preview: chat?.preview ?? null,
    purpose: workspace.purpose,
  });

  // Its chats from the rail's one list, newest first, as the rail shows them.
  // Inactive ones fold, except the one open right now. The counts are the
  // rail's: blocked and unread need you, running is working.
  const { sessions, inactive, counts } = useMemo(() => {
    const all = sortSessionsHotnessDesc(
      (rail?.sessions ?? []).filter((s) => s.workspaceId === workspace.id && s.status === 'active'),
    );
    const isOpen = (s: (typeof all)[number]) =>
      activeSessionId === s.id || (!!s.executionId && activeExecutionId === s.executionId);
    const kept: typeof all = [];
    const folded: typeof all = [];
    for (const s of all) (isInactive(s) && !isOpen(s) ? folded : kept).push(s);
    let needsYou = 0;
    let working = 0;
    let blocked = 0;
    for (const s of kept) {
      if (isInactive(s)) continue;
      if (pendingInputSessionIds.has(s.id)) {
        needsYou++;
        blocked++;
      } else if (streamingSessionIds.has(s.id)) working++;
      else if (isSessionUnread(s)) needsYou++;
    }
    return { sessions: kept, inactive: folded, counts: { needsYou, working, blocked } };
  }, [rail?.sessions, workspace.id, activeSessionId, activeExecutionId, isInactive, pendingInputSessionIds, streamingSessionIds]);

  const toggle = () => toggleOpen(workspace.id);

  return (
    <div className="rounded-xl">
      {/* Header row: the label area opens the agent's view (or folds, per
          the trial preference), the chevron folds, and the trailing +
          creates a new execution. Sibling buttons, not nested, so a tap on
          one never also fires another. */}
      <div className="w-full flex items-center gap-1.5 px-1 py-2 rounded-lg active:bg-muted/40 transition-colors">
        <InlineAction
          type="button"
          onClick={() => {
            if (!opensView) return toggle();
            openAgent(workspace.id);
          }}
          aria-label={activity ? `${workspace.name}: ${PRESENCE[activity].label}` : `Open ${workspace.name}`}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
        >
          <AgentPresenceIcon workspace={workspace} activity={activity} />
          <span className="flex-1 min-w-0">
            <span
              className={cn(
                'block text-[14px] truncate',
                wantsYou ? 'font-semibold text-foreground' : 'font-medium text-foreground/90',
              )}
            >
              {workspace.name}
            </span>
            {voice && (
              <span className={cn('block truncate text-[11.5px] leading-tight mt-0.5', VOICE_TONE[voice.tone])}>
                {voice.text}
              </span>
            )}
          </span>
        </InlineAction>
        <ChatCounts {...counts} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              type="button"
              label={`More for ${workspace.name}`}
              variant="ghost"
              size="touch"
              className="flex items-center justify-center flex-shrink-0"
            >
              <MoreHorizontal size={18} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <MenuAction kind="menu" onSelect={() => setPickingDevice(true)} className="gap-2">
              <Laptop size={15} /> New chat on…
            </MenuAction>
            <DropdownMenuSeparator />
            <MenuAction kind="menu" onSelect={() => openAgentTab('files')} className="gap-2">
              <FileText size={15} /> Files
            </MenuAction>
            <MenuAction kind="menu" onSelect={() => openAgentTab('setup')} className="gap-2">
              <Settings size={15} /> Setup
            </MenuAction>
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton
          type="button"
          onClick={() => handleCreateExecution()}
          disabled={creating}
          label="New chat"
          variant="ghost"
          size="touch"
          className="flex items-center justify-center flex-shrink-0"
        >
          <Plus size={18} />
        </IconButton>
        <IconButton
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          label={expanded ? `Hide chats in ${workspace.name}` : `Show chats in ${workspace.name}`}
          variant="ghost"
          size="touch"
          className="flex items-center justify-center flex-shrink-0"
        >
          <ChevronRight
            size={16}
            className={cn(
              'text-muted-foreground/60 transition-transform',
              expanded && 'rotate-90',
            )}
          />
        </IconButton>
      </div>

      <RunOnSheet
        workspace={workspace}
        open={pickingDevice}
        onOpenChange={setPickingDevice}
        onPick={(deviceId) => {
          setPickingDevice(false);
          handleCreateExecution(deviceId);
        }}
      />
      {expanded && (
        <div className="pl-5 pr-1 pb-2 space-y-0.5">
          {sessions.length + inactive.length === 0 ? (
            <Button
              type="button"
              onClick={() => handleCreateExecution()}
              disabled={creating}
              variant="ghost"
              size="touch"
              className="ml-5 flex items-center gap-1.5"
            >
              <Plus size={13} /> New chat
            </Button>
          ) : (
            <>
              {sessions.map((s) => <MobileChatRow key={s.id} session={s} inactive={isInactive(s)} />)}
              <InactiveFold sectionId={`agent:${workspace.id}`} count={inactive.length} touch className="pl-8">
                {inactive.map((s) => <MobileChatRow key={s.id} session={s} inactive />)}
              </InactiveFold>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * How many of the agent's chats need you (amber, pulsing while one is
 * blocked on you) and how many are working (green). Nothing when neither.
 */
function ChatCounts({ needsYou, working, blocked }: { needsYou: number; working: number; blocked: number }) {
  if (needsYou === 0 && working === 0) return null;
  const said = [
    needsYou > 0 && `${needsYou} chat${needsYou === 1 ? '' : 's'} need${needsYou === 1 ? 's' : ''} you`,
    working > 0 && `${working} working`,
  ].filter(Boolean).join(', ');
  return (
    <span className="flex flex-shrink-0 items-center gap-1">
      <span className="sr-only">{said}</span>
      {needsYou > 0 && (
        <span
          aria-hidden
          data-count="needs-you"
          className={cn(COUNT, 'bg-amber-500/15 text-amber-600 dark:text-amber-400', blocked > 0 && 'animate-pulse')}
        >
          {needsYou}
        </span>
      )}
      {working > 0 && (
        <span aria-hidden data-count="working" className={cn(COUNT, 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400')}>
          {working}
        </span>
      )}
    </span>
  );
}

const COUNT = 'min-w-[20px] h-[18px] rounded-full px-1.5 text-center text-[11px] font-semibold leading-[18px] tabular-nums';

// ─── Chat row (phone sized) ───────────────────────────────────────

interface MobileChatRowProps {
  session: ChatSessionWithExecution;
  /** Its agent, in lists that hold several agents' chats. */
  agentName?: string;
  /** What it's blocked on, when it's waiting on you. */
  waitingOn?: string | null;
  /** Idle past the inactive threshold: dimmed, with a moon before its age. */
  inactive?: boolean;
}

/**
 * One chat. A dot for its state (amber: wants you, pulsing while blocked;
 * green: working; a sky ring: background work), its title, bold while
 * unread, then what it's blocked on or what its agent said at the end of its
 * turn (docs/chat-status-lines.md), then its agent and where it runs. Its
 * age at the end, or "needs input" / "working" while those hold.
 */
function MobileChatRow({ session, agentName, waitingOn, inactive = false }: MobileChatRowProps) {
  const { activeSessionId, activeExecutionId, streamingSessionIds, backgroundSessionIds, pendingInputSessionIds } = useWorkActivity();
  const { openExecution } = useWorkNavigation();
  const isPending = pendingInputSessionIds.has(session.id);
  // Pending wins over streaming: when the agent is blocked on user input
  // the process is still "running," but a green "working" pip would
  // mislead — nothing is happening until the user responds.
  const isStreaming = !isPending && streamingSessionIds.has(session.id);
  const unread = !isStreaming && !isPending && isSessionUnread(session);
  // The turn is over but something it started is still running. Not working.
  const isBackground = !isPending && !isStreaming && backgroundSessionIds.has(session.id);
  const timestamp = session.lastActivityAt ?? session.lastOutcomeEventAt ?? session.startedAt;
  // One row per execution: active when the open view is its primary chat
  // or any sibling chat of the same execution.
  const isActive =
    activeSessionId === session.id ||
    (!!session.executionId && activeExecutionId === session.executionId);

  // Title by the execution (stable across its chats); fall back to the
  // primary chat's label for legacy executions that were never named.
  const label = session.execution?.label ?? session.label ?? 'Untitled';
  const labelIsPlaceholder = !(session.execution?.label ?? session.label);
  // Work away from the home says where (P3.1). The home's own stays quiet.
  const place = session.location && !session.location.isHome ? session.location.name : null;
  const meta = [agentName, place].filter(Boolean).join(' · ');
  const status = isPending ? null : session.turnStatus;

  let end: ReactNode;
  if (isPending) end = <span className="text-amber-600 dark:text-amber-400 font-medium">needs input</span>;
  else if (isStreaming) end = <span className="text-emerald-600 dark:text-emerald-400 font-medium">working</span>;
  else if (isBackground) end = <Tip label={BACKGROUND_LABEL}><span className="text-sky-500/90 font-medium">background</span></Tip>;
  else end = (
    <span className="inline-flex items-center gap-1 text-muted-foreground/70">
      {inactive && <Moon size={10} aria-label="Inactive" />}
      {formatCompactRelative(timestamp)}
    </span>
  );

  return (
    <MenuAction selected={!!((isActive))}
      type="button"
      onClick={() => openExecution(session.id)}
      data-chat-row={session.id}
      className={cn("w-full flex items-start gap-2 text-left", isActive ? "" : "", inactive && !isActive && "opacity-60")}
    >
      <span className="flex h-[18px] w-4 flex-shrink-0 items-center justify-center">
        {(isPending || unread) && <span className="sr-only">{isPending ? 'Waiting on you: ' : 'Unread: '}</span>}
        <span
          aria-hidden
          className={cn(
            'w-2 h-2 rounded-full',
            isPending && 'bg-amber-500 animate-pulse',
            isStreaming && 'bg-emerald-500 animate-pulse',
            unread && (isBackground ? 'bg-amber-500 ring-[1.5px] ring-sky-500 ring-offset-1 ring-offset-background' : 'bg-amber-500'),
            !isPending && !isStreaming && !unread && isBackground && BACKGROUND_DOT,
          )}
        />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              'flex-1 min-w-0 truncate text-[14px] leading-[18px]',
              labelIsPlaceholder
                ? 'italic text-muted-foreground/70'
                : unread || isPending
                  ? 'font-semibold text-foreground'
                  : 'font-medium text-foreground/90',
            )}
          >
            {label}
          </span>
          <span className="flex-shrink-0 text-[11px]">{end}</span>
        </span>
        {isPending && waitingOn && (
          <span className="mt-0.5 block truncate text-[12px] leading-snug text-amber-600 dark:text-amber-400">{waitingOn}</span>
        )}
        {status && (
          <span className="mt-0.5 flex items-center gap-2">
            <ChatStatusLine status={status} className="flex-1 text-[12px] leading-snug" />
            <ChatAskSize status={status} />
          </span>
        )}
        {meta && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/70">{meta}</span>}
      </span>
    </MenuAction>
  );
}

// ─── Empty state ──────────────────────────────────────────────────

function EmptyWorkspaces({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="px-6 py-10 text-center text-muted-foreground">
      <Bot className="w-8 h-8 mx-auto opacity-30 mb-3" />
      <p className="text-[13px] font-medium text-foreground">No agents yet</p>
      <p className="text-[11px] text-muted-foreground/70 mt-1 leading-relaxed">
        {onCreate ? 'Add one to get started.' : 'No agents have been set up here yet.'}
      </p>
      {onCreate && <Button
        type="button"
        onClick={onCreate}
        variant="ghost"
        size="touch"
        className="mt-3 inline-flex items-center gap-1.5"
      >
        <Plus size={13} />
        New agent
      </Button>}
    </div>
  );
}
