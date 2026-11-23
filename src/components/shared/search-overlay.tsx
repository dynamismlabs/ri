'use client';


import { RecentSearchItems } from './recent-search-items';
import { keepsRecord, searchNarrowing, usePaletteQuery } from '@/lib/client/search-query';

import { SearchPalette } from './search-palette';
import { CommandSearchItems } from './command-search-items';
import { openSettings } from '@/components/settings/settings-store';
import { openFeedback } from '@/components/feedback/feedback-store';
import { PLUGIN_CREATE_ANCHORS } from '@/components/settings/sections/plugins/navigation';



import { openChatSearch } from '@/components/workspaces/chat-search-store';
import {
	HOTKEYS, matchesHotkey,
	PALETTE_COMMANDS,
	SEARCH_FILTERS,
	type PaletteCommand,
	type SearchFilter,
} from '@/constants/commands';
import { useDashboard } from '@/contexts/dashboard-context';
import { useCreateNote } from '@/hooks/use-notes';
import { useRecents } from '@/hooks/use-recents';
import { useSearch } from '@/hooks/use-search';
import { useCreateTask } from '@/hooks/use-tasks';
import { useStartSkill } from '@/hooks/use-start-skill';
import { closeTaskBoard, openBoard } from '@/lib/client/task-board';
import { openScratchpad, showDeckBeside, useScratchpadAvailable } from '@/components/scratchpad/scratchpad-host';
import { useViewportTier } from '@/hooks/use-viewport-tier';
import { closeCalendarModal, openCalendarModal } from '@/lib/client/calendar-modal';
import { appPlaces } from '@/components/apps/app-places';
import { connectedAppsQuery } from '@/components/mcp-apps/catalog';
import type { AnyPanelTab } from '@/types/dashboard';


import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useResultCapabilities } from '@/hooks/use-results';


// ── Main component ───────────────────────────────────────────

export function SearchOverlay() {
  const router = useRouter();
  const capabilities = useResultCapabilities();
  const scratchpadAvailable = useScratchpadAvailable();
  const tier = useViewportTier();
  const [open, setOpen] = useState(false);
  const { openTask, openNote, toggleTheme, theme, showPanelTab, triggerVoiceChat, setActiveView } = useDashboard();
  // One Open <app> per app the rail's Apps flyout lists: connections whose
  // MCP server declares a standalone screen.
  const connectedApps = useQuery({ ...connectedAppsQuery(), enabled: open });
  const appList = useMemo(() => appPlaces(connectedApps.data ?? []), [connectedApps.data]);
  const appCommands: PaletteCommand[] = appList.map((app) => ({
    id: `open-app:${app.key}`,
    label: `Open ${app.displayName}`,
    keywords: `app ${app.keywords}`,
    icon: 'LayoutGrid',
    group: 'navigate',
  }));

  // Everything this palette can search, across the top. Apps once one is connected.
  const filters: SearchFilter[] = ['all', 'task', 'note', 'decision', 'stream', ...(appList.length ? ['app' as const] : []), 'command'];
  const palette = usePaletteQuery(filters);
  const { filter, query } = palette;
  // Every open starts from All with an empty box.
  if (!open && (query !== '' || filter !== 'all')) palette.reset();
  const searchQuery = query.trim();
  const isCommand = filter === 'command';
  // Tasks, notes and the stream come from the server. Apps and commands match here.
  const searchesRecords = filter !== 'command' && filter !== 'app';

  // Defer the query so we fire one request per settle, not one per keystroke.
  // Commands and apps are purely local and never touch the network.
  const deferredQuery = useDeferredValue(searchesRecords ? searchQuery : '');

  // One debounced request per settle. `useSearch` defaults to hybrid (semantic +
  // keyword) and keeps the previous hits visible while refining, so the list
  // updates in place rather than reflowing. The skeleton below covers the wait.
  // A filter narrows on the server, so Tasks fills its list with tasks.
  const narrowing = searchNarrowing(filter);
  const { data, isFetching } = useSearch(deferredQuery, undefined, narrowing.kind, narrowing.type);
  const results = data ?? [];

  const createTask = useCreateTask();
  const createNote = useCreateNote();
  const newSkill = useStartSkill();
  const { data: recents } = useRecents(25, open);
  const inputRef = useRef<HTMLInputElement>(null);

  // The previous filter's hits stay on screen while the new ones load, so keep
  // only the ones this filter wants.
  const filteredResults = searchesRecords ? results.filter((r) => keepsRecord(filter, r)) : [];
  const recentItems = (recents ?? []).filter((item) => keepsRecord(filter, item));

  const hasQuery = searchesRecords && searchQuery.length > 0;
  // The deferred query trails the input while React catches up; treat that lag
  // (and any in-flight fetch) as "still searching" so we show the skeleton
  // rather than a premature "no results".
  const isSearching = hasQuery && (deferredQuery !== searchQuery || isFetching);

  const handleSelect = useCallback((entityType: string, id: string) => {
    if (entityType === 'task') openTask(id);
    else if (entityType === 'note') openNote(id);
    setOpen(false);
  }, [openTask, openNote]);

  const handleNavigate = useCallback((tab: AnyPanelTab) => {
    showPanelTab(tab);
    // The tab opens under the board or the calendar, so going to it leaves them.
    closeTaskBoard();
    closeCalendarModal();
    setOpen(false);
  }, [showPanelTab]);

  // Command handlers keyed by command id
  const executeCommand = useCallback((cmd: PaletteCommand) => {
    if (cmd.href) {
      setOpen(false);
      router.push(cmd.href);
      return;
    }
    switch (cmd.id) {
      case 'create-task':
        setOpen(false);
        createTask.mutate(
          { title: ' ', rawInput: ' ' },
          { onSuccess: (task) => openTask(task.id) },
        );
        break;
      case 'create-note':
        setOpen(false);
        createNote.mutate(
          { body: ' ' },
          { onSuccess: (note) => openNote(note.id) },
        );
        break;
      case 'open-settings':
        setOpen(false);
        openSettings();
        break;
      case 'send-feedback':
        setOpen(false);
        openFeedback();
        break;
      case 'create-skill':
        if (!newSkill.isPending) { setOpen(false); newSkill.start(); }
        break;
      case 'connect-mcp':
        setOpen(false);
        openSettings('plugins', { anchor: PLUGIN_CREATE_ANCHORS.mcpServer });
        break;
      case 'connect-service':
        setOpen(false);
        openSettings('plugins', { anchor: PLUGIN_CREATE_ANCHORS.connectService });
        break;
      case 'toggle-theme':
        toggleTheme();
        setOpen(false);
        break;
      case 'voice-chat':
        setOpen(false);
        triggerVoiceChat();
        break;
      case 'open-scratchpad':
        setOpen(false);
        openScratchpad(tier === 'desktop');
        break;
      case 'deck-beside':
        // Only a wide window has the column. Elsewhere the deck is its own tab.
        if (tier === 'desktop') { setOpen(false); showDeckBeside(); }
        else handleNavigate('deck');
        break;
      case 'search-chats':
        setOpen(false);
        openChatSearch();
        break;
      case 'open-board':
        setOpen(false);
        openBoard();
        break;
      case 'open-calendar':
        setOpen(false);
        openCalendarModal();
        break;
      case 'open-apps':
        setOpen(false);
        setActiveView({ kind: 'apps', route: '' });
        break;
      default:
        if (cmd.id.startsWith('open-app:')) {
          setOpen(false);
          // A connected app with a standalone screen opens that screen, as its flyout row does.
          const app = appList.find((place) => `open-app:${place.key}` === cmd.id);
          if (app) setActiveView({ kind: 'apps', route: app.route, ...(app.query ? { query: app.query } : {}) });
          break;
        }
        // go-* navigation commands
        if (cmd.id.startsWith('go-')) {
          handleNavigate(cmd.id.replace('go-', '') as AnyPanelTab);
        }
        break;
    }
  }, [createTask, createNote, newSkill, openTask, openNote, toggleTheme, handleNavigate, triggerVoiceChat, router, setActiveView, appList, tier]);

  // Hotkey + custom event listeners
  const { reset } = palette;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesHotkey(e, HOTKEYS.search)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.initialQuery) {
        // "task: " opens on Tasks with an empty box.
        reset(detail.initialQuery);
        // Collapse selection to end after cmdk focuses and selects the input
        requestAnimationFrame(() => {
          const el = inputRef.current;
          if (el) el.setSelectionRange(el.value.length, el.value.length);
        });
      }
      setOpen(true);
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('open-search', handleOpen);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('open-search', handleOpen);
    };
  }, [reset]);

  // Resolve theme-aware icon name for toggle-theme command
  const getCommandIcon = (cmd: PaletteCommand) => {
    if (cmd.id === 'toggle-theme') return theme === 'dark' ? 'Sun' : 'Moon';
    return cmd.icon;
  };

  const getCommandLabel = (cmd: PaletteCommand) => {
    if (cmd.id === 'toggle-theme') return `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;
    return cmd.label;
  };

  return <SearchPalette open={open} onOpenChange={setOpen} query={query} onQueryChange={palette.type}
    filters={filters} filter={filter} onFilterChange={palette.setFilter}
    searchQuery={searchesRecords ? searchQuery : ''} results={filteredResults} searching={isSearching} fetching={isFetching}
    onSelect={handleSelect} inputRef={inputRef}
    beforeResults={<>          {isCommand && <CommandSearchItems commands={[...PALETTE_COMMANDS, ...appCommands].filter(command => (command.capability !== 'handoffs' || capabilities.data?.handoffsEnabled) && (command.capability !== 'privatePlanning' || scratchpadAvailable))} query={searchQuery} onSelect={executeCommand} icon={getCommandIcon} label={getCommandLabel}/>}

          {/* ── Apps: every connected app under Apps, or the ones a search names under All ── */}
          {filter === 'app' && <CommandSearchItems commands={appCommands} query={searchQuery} heading="Apps" empty="No matching apps" onSelect={executeCommand} icon={getCommandIcon} label={getCommandLabel}/>}
          {filter === 'all' && hasQuery && <CommandSearchItems commands={appCommands} query={searchQuery} heading="Apps" empty={null} onSelect={executeCommand} icon={getCommandIcon} label={getCommandLabel}/>}

          {/* ── Recent items of this filter (empty query) ── */}
          {searchesRecords && searchQuery.length === 0 && recentItems.length > 0 && (
            <RecentSearchItems items={recentItems} onSelect={handleSelect} />
          )}

          {/* ── Idle hint (empty query, no recents of this filter) ─────── */}
          {searchesRecords && searchQuery.length === 0 && recentItems.length === 0 && (
            <p className="p-8 text-center text-muted-foreground text-[11px]">
              {SEARCH_FILTERS[filter].hint}
            </p>
          )}

</>}
  />;
}
