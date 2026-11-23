'use client';

import { useDeferredValue, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HOTKEYS, matchesHotkey, PALETTE_COMMANDS, SEARCH_FILTERS, type PaletteCommand, type SearchFilter } from '@/constants/commands';
import { CommandSearchItems } from '@/components/shared/command-search-items';
import { useRecents } from '@/hooks/use-recents';
import { keepsRecord, searchNarrowing, usePaletteQuery } from '@/lib/client/search-query';
import { RecentSearchItems } from '@/components/shared/recent-search-items';
import { SearchPalette } from '@/components/shared/search-palette';
import { useSearch } from '@/hooks/use-search';
import { trpc } from '@/lib/trpc/client';
import { apiErrorText } from '@/lib/api/client';
import { useTeamCreateRecord } from './use-team-create-record';
import { useTeamNav } from './team-context';
import { openFeedback } from '@/components/feedback/feedback-store';

/** Everything a team's palette can search: no private stream, and the team's shared chats. */
const TEAM_FILTERS: readonly SearchFilter[] = ['all', 'task', 'note', 'decision', 'chat', 'command'];

/** Team context supplies destinations and its shared chat search to the common palette. */
export function TeamSearch() {
  const nav = useTeamNav();
  const open = nav.panel === 'search';
  const palette = usePaletteQuery(TEAM_FILTERS);
  const { filter, query, reset } = palette;
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    // cmdk selects the field on open. Leave supplied words intact for typing.
    const frame = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (input) input.setSelectionRange(input.value.length, input.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);
  useEffect(() => {
    // "task: " opens on Tasks with an empty box.
    const show = (initialQuery = '') => { reset(initialQuery); nav.openPanel('search'); };
    const onOpen = (event: Event) => show((event as CustomEvent<{ initialQuery?: string }>).detail?.initialQuery);
    const onKey = (event: KeyboardEvent) => { if (matchesHotkey(event, HOTKEYS.search)) { event.preventDefault(); show(); } };
    document.addEventListener('open-search', onOpen);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('open-search', onOpen); document.removeEventListener('keydown', onKey); };
  }, [nav, reset]);
  const searchQuery = query.trim();
  const isCommand = filter === 'command';
  // Tasks and notes come from the team's search, chats from its chat search.
  const searchesRecords = filter !== 'command' && filter !== 'chat';
  const searchesChats = filter === 'all' || filter === 'chat';
  const recent = useRecents(25, open);
  const deferred = useDeferredValue(open && !isCommand ? searchQuery : '');
  const narrowing = searchNarrowing(filter);
  const results = useSearch(searchesRecords ? deferred : '', 'keyword', narrowing.kind, narrowing.type);
  const chats = useQuery({ ...trpc.team.ai.searchChats.queryOptions({ query: deferred }), enabled: open && deferred.length > 0 && searchesChats });
  const recentItems = searchesRecords ? (recent.data ?? []).filter(item => keepsRecord(filter, item)) : [];
  const create = useTeamCreateRecord();
  const close = () => { reset(); nav.openPanel(null); };
  const execute = (command: PaletteCommand) => {
    close();
    switch (command.id) {
      case 'create-task': void create.task(); break;
      case 'create-note': void create.note(); break;
      case 'go-tasks': case 'open-board': nav.show('board'); break;
      case 'go-notes': nav.show('notes'); break;
      case 'go-chat': nav.show('chat'); break;
      case 'open-settings': nav.openPanel('settings'); break;
      case 'send-feedback': openFeedback(); break;
    }
  };
  const commands = PALETTE_COMMANDS.filter(command => ['create-task', 'create-note', 'go-tasks', 'open-board', 'go-notes', 'go-chat', 'open-settings', 'send-feedback'].includes(command.id));
  const fetching = (searchesRecords && results.isFetching) || (searchesChats && chats.isFetching);
  const hint = filter === 'all' ? 'Type to search across tasks, notes, and chats' : SEARCH_FILTERS[filter].hint;
  return <SearchPalette inputRef={inputRef} open={open} onOpenChange={next => { if (!next) close(); }} query={query} onQueryChange={palette.type}
    filters={TEAM_FILTERS} filter={filter} onFilterChange={palette.setFilter}
    searchQuery={isCommand ? '' : searchQuery} results={searchesRecords ? (results.data ?? []).filter(result => keepsRecord(filter, result)) : []} chats={searchesChats ? chats.data ?? [] : []}
    beforeResults={isCommand ? <CommandSearchItems commands={commands} query={searchQuery} onSelect={execute}/> : !searchQuery && (recentItems.length ? <RecentSearchItems items={recentItems} onSelect={(type, id) => { close(); if (type === 'task') nav.openTask(id); else nav.openNote(id); }} /> : <p className="p-8 text-center text-[11px] text-muted-foreground">{hint}</p>)}
    searching={!isCommand && (deferred !== searchQuery || fetching)} fetching={fetching}
    error={results.error || chats.error ? apiErrorText(results.error ?? chats.error) : null}
    onRetry={() => { void results.refetch(); void chats.refetch(); }}
    onSelect={(type, id) => { close(); if (type === 'task') nav.openTask(id); else if (type === 'note') nav.openNote(id); }}
    onChat={id => { reset(); nav.openChat(id); }}/>;
}
