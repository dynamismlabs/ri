'use client';

import { OverlaySurface, OverlayScrim } from '@/components/system/overlay';
import { DialogPrimitive } from '@/components/system/dialog';
import { IconButton } from '@/components/system/icon-button';
import { Button } from '@/components/system/button';
import { SegmentedControl } from '@/components/system/segmented-control';
import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Command } from 'cmdk';
import { VisuallyHidden } from 'radix-ui';
import { Search, Loader2, X, MessageSquare, Target } from 'lucide-react';
import { NoteIcon } from './note-icon';
import { DecisionLabel } from '@/components/notes/note-kind';
import { Skeleton } from '@/components/ui/skeleton';
import { TeamLabel } from '@/components/spaces/team-label';
import type { SearchResult } from '@/lib/api/search';
import { SEARCH_FILTERS, type SearchFilter } from '@/constants/commands';
import { stepFilter } from '@/lib/client/search-query';
import { useViewportTier } from '@/hooks/use-viewport-tier';

export function EntityIcon({ type, hasBody, className }: { type: string; hasBody?: boolean; className?: string }) {
  switch (type) {
    case 'task': return <Target size={14} className={className} />;
    case 'note': return <NoteIcon body={hasBody ? 'x' : ''} size={14} className={className} />;
    case 'stream': return <MessageSquare size={14} className={className} />;
    default: return null;
  }
}


/**
 * One search input, keyboard model, result layout and loading/error behavior.
 * The row of filters under the input lists what this Home's palette can
 * search. Tab and Shift+Tab move along it from the input, and Backspace at
 * the start of the input goes back to All.
 */
export function SearchPalette({ open, onOpenChange, query, onQueryChange, searchQuery, results, searching, fetching, onSelect, beforeResults, placeholder, filters, filter = 'all', onFilterChange, inputRef, chats = [], onChat, error, onRetry }: {
  open: boolean; onOpenChange: (open: boolean) => void; query: string; onQueryChange: (query: string) => void;
  searchQuery: string; results: SearchResult[]; searching: boolean; fetching?: boolean;
  onSelect: (type: string, id: string) => void; beforeResults?: ReactNode; placeholder?: string;
  filters?: readonly SearchFilter[]; filter?: SearchFilter; onFilterChange?: (filter: SearchFilter) => void;
  inputRef?: RefObject<HTMLInputElement | null>; chats?: { id: string; label: string | null; snippet?: string | null }[];
  onChat?: (id: string) => void; error?: string | null; onRetry?: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const ownInput = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownInput;
  const tier = useViewportTier();
  useEffect(() => { list.current?.scrollTo(0, 0); }, [results, filter]);
  const hasQuery = searchQuery.trim().length > 0;
  const offered = filters && filters.length > 1 && onFilterChange ? filters : null;
  const choose = (next: SearchFilter) => {
    onFilterChange?.(next);
    // Picking a filter is a step toward typing, so the words go back in the box.
    input.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!offered || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      // The dialog's focus trap would otherwise wrap Shift+Tab from its first field to its last.
      event.stopPropagation();
      onFilterChange?.(stepFilter(offered, filter, event.shiftKey ? -1 : 1));
    } else if (event.key === 'Backspace' && filter !== 'all' && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0) {
      // The filter reads as the word before the text, so deleting at the start removes it.
      event.preventDefault();
      onFilterChange?.('all');
    }
  };
  return <Command.Dialog open={open} onOpenChange={onOpenChange} label="Search" shouldFilter={false} className="fixed inset-0 z-50">
    <VisuallyHidden.Root><DialogPrimitive.Title>Search</DialogPrimitive.Title><DialogPrimitive.Description>Find work in Ri</DialogPrimitive.Description></VisuallyHidden.Root>
    <OverlayScrim className="absolute inset-0" onClick={() => onOpenChange(false)}/>
    <OverlaySurface kind="dialog" padding="none" data-slot="dialog-content" className="relative mx-auto mt-[15vh] w-[min(42rem,calc(100%-16px))] max-w-2xl overflow-hidden">
      <div className="flex items-center gap-3 border-b px-4 py-3"><Search size={16} className="shrink-0 text-muted-foreground"/><Command.Input ref={input} value={query} onValueChange={onQueryChange} onKeyDown={onKeyDown} placeholder={placeholder ?? SEARCH_FILTERS[filter].placeholder} className="min-w-0 flex-1 border-none bg-transparent text-sm outline-none"/>{hasQuery && fetching && <Loader2 size={14} className="animate-spin"/>}<IconButton
        onClick={() => onOpenChange(false)}
        label="Close search"
        variant="ghost"
        size="sm"
      ><X size={14}/></IconButton></div>
      {offered && <div data-slot="search-filters" className="px-4 pt-2">
        <SegmentedControl mode="choice" ariaLabel="Search in" size={tier === 'phone' ? 'touch' : 'compact'} value={filter} onChange={choose}
          options={offered.map(value => ({ value, label: SEARCH_FILTERS[value].label }))}/>
      </div>}
      <Command.List ref={list} className="max-h-[60vh] overflow-y-auto">
        {beforeResults}
        {hasQuery && (results.length || chats.length ? <Command.Group heading="Results" className="p-2 text-xs">{results.map(result => <SearchResultItem key={`${result.entityType}:${result.id}`} result={result} onSelect={onSelect}/>)}{chats.map(chat => <Command.Item key={`chat:${chat.id}`} value={`chat:${chat.id}`} onSelect={() => onChat?.(chat.id)} className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 data-[selected=true]:bg-muted/50"><MessageSquare size={14}/><span className="min-w-0"><span className="block truncate">{chat.label ?? 'Chat'}</span>{chat.snippet && <span className="block truncate text-muted-foreground">{chat.snippet}</span>}</span></Command.Item>)}</Command.Group> : searching ? <SearchResultsSkeleton/> : !error && <p className="p-8 text-center text-xs text-muted-foreground">No results for “{searchQuery}”</p>)}
        {error && <p role="alert" className="p-4 text-xs">{error} <Button
          onClick={onRetry}
          variant="link"
          size="sm"
        >Retry</Button></p>}
      </Command.List>
      <div data-slot="search-footer" className="hidden gap-3 border-t px-4 py-2 text-[9px] text-muted-foreground md:flex"><span>↑↓ navigate</span><span>Enter open</span>{offered && <span>Tab filter</span>}<span>Esc close</span></div>
    </OverlaySurface>
  </Command.Dialog>;
}

function SearchResultItem({
  result, onSelect,
}: {
  result: SearchResult;
  onSelect: (entityType: string, id: string) => void;
}) {
  const body = 'body' in result ? result.body : result.rawText;
  const description = 'description' in result ? result.description : undefined;
  const title = ('title' in result ? result.title : undefined) || body || '(untitled)';

  return (
    <Command.Item
      value={`${result.entityType}-${result.id}`}
      onSelect={() => onSelect(result.entityType, result.id)}
      className="flex items-start gap-3 px-2 py-2 rounded-md text-left cursor-pointer data-[selected=true]:bg-muted/50"
    >
      <div className="mt-0.5 flex-shrink-0">
        <EntityIcon type={result.entityType} hasBody={!!body?.trim()} className="text-primary/60" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium leading-tight line-clamp-1">{title}</p>
        {description && (
          <p className="mt-0.5 text-[10.5px] text-muted-foreground leading-snug line-clamp-2">
            {description}
          </p>
        )}
        <div className="mt-0.5 flex items-center gap-2">
          {result.entityType === 'note' && result.kind === 'decision' ? (
            <DecisionLabel kind="decision" className="py-0 text-[8px]" />
          ) : (
            <span className="text-[8px] font-bold text-muted-foreground/60">
              {result.entityType}
            </span>
          )}
          {'sourceTeamId' in result && <TeamLabel teamId={result.sourceTeamId} sourceArea={result.source?.area} />}
          <span className="text-[8px] text-muted-foreground/60">
            {new Date(result.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          {result.score != null && (
            <span className="text-[8px] text-muted-foreground/40">
              {(result.score * 100).toFixed(0)}%
            </span>
          )}
        </div>
      </div>
    </Command.Item>
  );
}

// ── Loading skeleton ─────────────────────────────────────────
// Shown while a search is in flight and we don't yet have results for the
// current query, so the palette never flashes "no results" mid-keystroke.
// Row shape mirrors SearchResultItem (icon + title + meta line).

const SKELETON_WIDTHS = ['72%', '54%', '81%', '61%', '68%'];

function SearchResultsSkeleton() {
  return (
    <div className="px-2 py-1" aria-hidden>
      {SKELETON_WIDTHS.map((width, i) => (
        <div key={i} className="flex items-start gap-3 px-2 py-2">
          <Skeleton className="mt-0.5 size-3.5 flex-shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 rounded" style={{ width }} />
            <Skeleton className="h-2.5 w-2/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
