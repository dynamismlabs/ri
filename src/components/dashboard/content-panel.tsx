"use client";
import { Popover, PopoverTrigger, PopoverContent } from '@/components/system/popover';
import { MenuAction } from '@/components/system/menu-action';

import { ChipButton } from "@/components/system/chip-button";

import { SegmentedRoot, SegmentedList, SegmentedPanel } from "@/components/system/segmented-control";

import { Button } from '@/components/system/button';
import {
  Layers, ChevronDown, Users, SquareTerminal, Maximize2, Minimize2,
} from 'lucide-react';
import { useState } from 'react';
import { useDashboard } from '@/contexts/dashboard-context';
import { cn } from '@/lib/utils';
import type { PanelId, PanelTab, MorePanelTab } from '@/types/dashboard';
import { TaskSurface } from '@/components/tasks/task-surface';
import { NoteList } from '@/components/notes/note-list';
import { StreamList } from '@/components/stream/stream-list';
import { DeckContainer } from '@/components/deck/deck-container';
import { useNeedsYourCall } from '@/hooks/use-stream';
import { PersonalMainChatContent } from '@/components/chat/main-chat-content';
import { Tip } from '@/components/ui/tip';
import { TeamOrchestratorChat } from '@/components/team/team-orchestrator-chat';
import { TeamBoard } from '@/components/team/team-board';
import { TeamNotes } from '@/components/team/team-notes';
import { HomeTerminal } from '@/components/dashboard/home-terminal';
import { useHomeContext } from '@/components/home/home-context';
import { openTaskBoard } from '@/lib/client/task-board';
import { TASK_VIEW_KEY } from '@/components/tasks/task-view';
import { useElementWidth } from '@/hooks/use-element-width';
import { useBesidePreview, useBesideRegion } from '@/components/chat-ui/artifacts/artifact-preview-provider';
import { PREVIEW_HOST_ATTRIBUTE } from '@/components/chat-ui/artifacts/artifact-preview-store';
import { BesideFileTab, BesideFileView } from '@/components/chat-ui/artifacts/artifact-beside';

// ─── Tab definitions ───────────────────────────────────────────

// Chat leads: it's the orchestrator, the front door to everything else. The
// home opens with it on the left and the deck on the right (dashboard-context
// DEFAULT_PANEL_*_TAB).
const CORE_TABS: { id: PanelTab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'deck', label: 'Deck' },
  { id: 'stream', label: 'Stream' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'notes', label: 'Notes' },
];

const MORE_TABS: { id: MorePanelTab; label: string; icon: typeof Users }[] = [
  { id: 'areas', label: 'Areas', icon: Layers },
  { id: 'people', label: 'Contacts', icon: Users },
  // Shells on the box the home runs on, opening in its home folder.
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
];

const MORE_TAB_IDS = new Set<string>(MORE_TABS.map(t => t.id));

// ─── Chat header ───────────────────────────────────────────────
//
// Who you're talking to, past chats, and New. The main chat acts through
// MCP only: the Skills / MCP switch that sat here was retired on 2026-10-05.

function MoreTabContent({ tab }: { tab: MorePanelTab }) {
  if (tab === 'terminal') return <HomeTerminal />;
  const tabInfo = MORE_TABS.find(t => t.id === tab);
  if (!tabInfo) return null;
  const Icon = tabInfo.icon;

  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
      <Icon size={24} className="opacity-30" />
      <p className="text-[11px]">{tabInfo.label}</p>
      <p className="text-[9px] text-muted-foreground/60">Coming soon</p>
    </div>
  );
}

// ─── Main panel component ──────────────────────────────────────

interface ContentPanelProps {
  panelId: PanelId;
  /** When set, skip the tab bar and render only this content (used by mobile layout) */
  mobileTab?: 'chat' | 'deck' | 'tasks' | 'notes' | 'stream';
  /** The other panel beside this one (Home's two-panel layout). Files opened
   *  from its chat show here as a tab, and this one's files show there. */
  besideOf?: PanelId;
}

/** The surface a Home panel's files open beside (`artifact-preview-store.ts`). */
const homeHost = (panel: PanelId) => `home:${panel}`;

export function ContentPanel({ panelId, mobileTab, besideOf }: ContentPanelProps) {
  const home = useHomeContext();
  const {
    panelATab, panelBTab,
    setPanelTab, setFocusedPanel, theme,
    openAreasList, openTask, openNote,
    filesInFront, setFileInFront,
    expandedPanel, setExpandedPanel,
  } = useDashboard();
  const isDark = theme === 'dark';
  const team = home.home.kind === 'team';
  const coreTabs = team ? CORE_TABS.filter(tab => ['chat', 'tasks', 'notes'].includes(tab.id)) : CORE_TABS;
  const moreTabs = team ? MORE_TABS.filter(tab => tab.id === 'areas') : MORE_TABS;

  const activeTab = mobileTab ?? (panelId === 'a' ? panelATab : panelBTab);

  // A file opened from the chat in the other panel shows here, over this
  // panel's tab, as one more tab. Only while that chat is on screen: move
  // the chat away and its file goes with it, put it back and the file is
  // back. Only while this copy of the layout is on screen (the dashboard
  // keeps hidden ones).
  const fileHost = besideOf ? homeHost(besideOf) : null;
  const file = useBesidePreview(fileHost);
  const fileChatShown = besideOf !== undefined && (besideOf === 'a' ? panelATab : panelBTab) === 'chat';
  const fileHere = !!file && fileChatShown;
  const fileShown = fileHere && filesInFront[panelId];
  const [measureRef, width] = useElementWidth<HTMLDivElement>();
  useBesideRegion(fileHost, {
    available: !!width && fileChatShown,
    side: panelId === 'b' ? 'right' : 'left',
    showing: !!width && fileShown,
    show: () => setFileInFront(panelId, true),
  });
  const expanded = expandedPanel === panelId;
  // Measure the panel, since a wide window can still have a narrow split.
  // File tabs need additional room. Restore always remains reachable.
  const showExpand = expanded || (width ?? 0) >= (team ? 360 : fileHere ? 760 : 640);
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreTab = MORE_TAB_IDS.has(activeTab);
  const needsYourCall = useNeedsYourCall(!team);

  return (
    <SegmentedRoot
      asChild
      mode="tabs"
      value={fileShown ? null : activeTab}
      onChange={(tab) => setPanelTab(panelId, tab)}
    >
      <div
        ref={measureRef}
        {...(besideOf ? { [PREVIEW_HOST_ATTRIBUTE]: homeHost(panelId) } : {})}
        className="flex flex-col h-full min-w-0 bg-background"
        onMouseDown={() => setFocusedPanel(panelId)}
      >
        {/* Tab bar — hidden on mobile when mobileTab is set */}
        {!mobileTab && (
          <div
            data-slot="pane-tabs"
            className={cn(
              "flex items-center border-b border-border shrink-0",
              isDark ? "bg-card/30" : "bg-muted/30",
            )}
          >
            <SegmentedList
              ariaLabel="Pane views"
              options={coreTabs.map((tab) => ({
                value: tab.id,
                label: tab.label,
                dot: tab.id === "stream" && needsYourCall ? "attention" : undefined,
                dotPosition: "trailing" as const,
                ariaLabel:
                  tab.id === "stream" && needsYourCall ? "Stream, something needs your call" : undefined,
              }))}
            />

            {fileHost && fileHere && (
              <BesideFileTab
                host={fileHost}
                active={fileShown}
                onSelect={() => setFileInFront(panelId, true)}
                className={cn(
                  "self-stretch border-b-2 px-3 text-[11px] font-medium transition-all",
                  fileShown
                    ? "text-primary border-primary"
                    : "text-muted-foreground border-transparent hover:text-foreground",
                )}
              />
            )}

            <div className="flex-1" />

            {showExpand && (
              <Tip label={expandedPanel === panelId ? "Show both panels" : "Use the full content width"}>
                <Button
                  type="button"
                  aria-label={expandedPanel === panelId ? "Restore split view" : `Expand ${activeTab}`}
                  aria-pressed={expandedPanel === panelId}
                  onClick={() => setExpandedPanel(expandedPanel === panelId ? null : panelId)}
                  variant="secondary"
                  size="sm"
                  className="flex shrink-0 items-center gap-1"
                >
                  {expandedPanel === panelId ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  {(expanded || (width ?? 0) >= (team ? 420 : 760)) && (
                    <span>{expandedPanel === panelId ? "Restore" : "Expand"}</span>
                  )}
                </Button>
              </Tip>
            )}

            {/* More button */}
            <Popover open={moreOpen} onOpenChange={setMoreOpen}><div className="relative">
              <PopoverTrigger asChild><ChipButton
                variant="ghost"
                pressed={isMoreTab && !fileShown}
                aria-expanded={moreOpen}
              >
                More
                <ChevronDown />
              </ChipButton></PopoverTrigger>

              {moreOpen && (
                <PopoverContent padding="xs" align="end" className="w-52">
                  {moreTabs.map((tab) => (
                    <MenuAction selected={!!((activeTab === tab.id))}
                      key={tab.id}
                      onClick={() => {
                        if (tab.id === "areas") {
                          openAreasList();
                        } else {
                          setPanelTab(panelId, tab.id);
                        }
                        setMoreOpen(false);
                      }}
                      className="w-full flex items-center gap-3"
                    >
                      <tab.icon size={14} />
                      <span className="font-medium">{tab.label}</span>
                    </MenuAction>
                  ))}
                  {!showExpand && (
                    <MenuAction
                      type="button"
                      onClick={() => {
                        setExpandedPanel(panelId);
                        setMoreOpen(false);
                      }}
                      className="flex w-full items-center gap-3"
                    >
                      <Maximize2 size={14} />
                      <span className="font-medium">Expand panel</span>
                    </MenuAction>
                  )}
                </PopoverContent>
              )}
            </div></Popover>
          </div>
        )}

        {/* Tab content. The panel's own tab stays mounted under the file, and
          the file under the panel's tab, so each is as left when the other
          comes forward (a PDF keeps its page, an HTML file its state). */}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <SegmentedPanel
            value={activeTab}
            keepMounted
            preserveLayout
            asChild
            {...(isMoreTab
              ? {
                  role: "region",
                  "aria-labelledby": undefined,
                  "aria-label": moreTabs.find((tab) => tab.id === activeTab)?.label ?? activeTab,
                }
              : {})}
          >
            <div inert={fileShown} aria-hidden={fileShown || undefined} className="h-full">
              {activeTab === "deck" && <DeckContainer />}
              {activeTab === "chat" && (team ? <TeamOrchestratorChat /> : <PersonalMainChatContent />)}
              {activeTab === "tasks" &&
                (team ? (
                  <TeamBoard />
                ) : (
                  <TaskSurface
                    onOpenBoard={openTaskBoard}
                    onOpenTask={openTask}
                    privatePlanning={home.capabilities.privatePlanning}
                    viewKey={`${TASK_VIEW_KEY}:${home.home.id}:${home.viewer.id}`}
                    legacyViewKey={TASK_VIEW_KEY}
                  />
                ))}
              {activeTab === "stream" && <StreamList />}
              {activeTab === "notes" && (team ? <TeamNotes /> : <NoteList onOpenNote={openNote} />)}
              {isMoreTab && <MoreTabContent tab={activeTab as MorePanelTab} />}
            </div>
          </SegmentedPanel>
          {fileHere && fileHost && (
            <div
              inert={!fileShown}
              aria-hidden={!fileShown || undefined}
              className={cn("absolute inset-0 z-10", !fileShown && "pointer-events-none opacity-0")}
            >
              <BesideFileView host={fileHost} />
            </div>
          )}
        </div>
      </div>
    </SegmentedRoot>
  );
}
