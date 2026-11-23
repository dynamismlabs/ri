import { useCallback, useState } from 'react';
import { SEARCH_FILTERS, type SearchFilter } from '@/constants/commands';
import type { SearchType } from '@/lib/api/search';

const EVERY_FILTER = Object.keys(SEARCH_FILTERS) as SearchFilter[];

/**
 * A typed prefix ("task:", ">") picks its filter when this palette offers it,
 * and what follows stays as the query. Null when the text starts with none.
 */
export function takeFilterPrefix(raw: string, offered: readonly SearchFilter[]): { filter: SearchFilter; query: string } | null {
  const text = raw.trimStart();
  const lower = text.toLowerCase();
  for (const filter of offered) {
    for (const prefix of SEARCH_FILTERS[filter].prefixes) {
      if (lower.startsWith(prefix)) return { filter, query: text.slice(prefix.length).trimStart() };
    }
  }
  return null;
}

/** The filter one step along the row (Tab is 1, Shift+Tab is -1), wrapping at the ends. */
export function stepFilter(offered: readonly SearchFilter[], current: SearchFilter, step: 1 | -1): SearchFilter {
  const at = offered.indexOf(current);
  if (at < 0) return offered[0] ?? 'all';
  return offered[(at + step + offered.length) % offered.length];
}

/** What a record filter asks the server for, so the results fill up with that type. */
export function searchNarrowing(filter: SearchFilter): { type?: SearchType; kind?: 'decision' } {
  switch (filter) {
    case 'task': case 'note': case 'stream': return { type: filter };
    case 'decision': return { kind: 'decision' };
    default: return {};
  }
}

/** Whether a result or recent item belongs under a filter. Filters that aren't records keep nothing. */
export function keepsRecord(filter: SearchFilter, item: { entityType: string; kind?: string | null }): boolean {
  switch (filter) {
    case 'all': return true;
    case 'task': case 'note': case 'stream': return item.entityType === filter;
    case 'decision': return item.entityType === 'note' && item.kind === 'decision';
    default: return false;
  }
}

/**
 * The palette's filter and the words typed after it. Typing a prefix moves it
 * into the filter, so the box holds only what is searched for. A filter the
 * palette stops offering (an app disconnected while open) reads as All.
 */
export function usePaletteQuery(offered: readonly SearchFilter[]) {
  const [filter, setFilter] = useState<SearchFilter>('all');
  const [query, setQuery] = useState('');
  /**
   * Start over, from text a caller opened the palette with ("task: "). Any
   * prefix counts here, since a caller may open it before the offered
   * filters have loaded. One that isn't offered then reads as All.
   */
  const reset = useCallback((initial = '') => {
    const taken = takeFilterPrefix(initial, EVERY_FILTER);
    setFilter(taken?.filter ?? 'all');
    setQuery(taken ? taken.query : initial);
  }, []);
  return {
    filter: offered.includes(filter) ? filter : 'all',
    query,
    setFilter,
    /**
     * The box's text as typed, prefix and all. Leading spaces go, so the space
     * after "task:" doesn't start the search.
     */
    type(raw: string) {
      const taken = takeFilterPrefix(raw, offered);
      if (taken) setFilter(taken.filter);
      setQuery(taken ? taken.query : raw.trimStart());
    },
    reset,
  };
}
