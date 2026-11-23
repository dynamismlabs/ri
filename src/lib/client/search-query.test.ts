import { describe, expect, it } from 'vitest';
import { SEARCH_FILTERS, type SearchFilter } from '@/constants/commands';
import { keepsRecord, searchNarrowing, stepFilter, takeFilterPrefix } from './search-query';

const PERSONAL: SearchFilter[] = ['all', 'task', 'note', 'decision', 'stream', 'command'];

describe('takeFilterPrefix', () => {
  it('moves a typed prefix into its filter and keeps the words after it', () => {
    expect(takeFilterPrefix('task: plan the trip', PERSONAL)).toEqual({ filter: 'task', query: 'plan the trip' });
    expect(takeFilterPrefix('Notes:', PERSONAL)).toEqual({ filter: 'note', query: '' });
    expect(takeFilterPrefix('  decision:pricing', PERSONAL)).toEqual({ filter: 'decision', query: 'pricing' });
    expect(takeFilterPrefix('>create', PERSONAL)).toEqual({ filter: 'command', query: 'create' });
    // A trailing space is still being typed, so it stays.
    expect(takeFilterPrefix('stream: saw a ', PERSONAL)).toEqual({ filter: 'stream', query: 'saw a ' });
  });

  it('leaves text alone when it starts with no prefix this palette offers', () => {
    expect(takeFilterPrefix('plan the trip', PERSONAL)).toBeNull();
    expect(takeFilterPrefix('my task: list', PERSONAL)).toBeNull();
    // Chats are searched in their own window at home, so "chat:" is just words there.
    expect(takeFilterPrefix('chat: release', PERSONAL)).toBeNull();
    expect(takeFilterPrefix('chat: release', ['all', 'chat'])).toEqual({ filter: 'chat', query: 'release' });
  });

  it('knows every prefix the filters list', () => {
    const every = Object.keys(SEARCH_FILTERS) as SearchFilter[];
    for (const filter of every) {
      for (const prefix of SEARCH_FILTERS[filter].prefixes) {
        expect(takeFilterPrefix(`${prefix} words`, every)).toEqual({ filter, query: 'words' });
      }
    }
  });
});

describe('stepFilter', () => {
  it('moves along the row and wraps at both ends', () => {
    expect(stepFilter(PERSONAL, 'all', 1)).toBe('task');
    expect(stepFilter(PERSONAL, 'command', 1)).toBe('all');
    expect(stepFilter(PERSONAL, 'all', -1)).toBe('command');
    expect(stepFilter(PERSONAL, 'note', -1)).toBe('task');
  });

  it('starts from the first filter when the current one is not offered', () => {
    expect(stepFilter(PERSONAL, 'app', 1)).toBe('all');
  });
});

describe('searchNarrowing', () => {
  it('asks the server for one type of record, or decisions by their kind', () => {
    expect(searchNarrowing('all')).toEqual({});
    expect(searchNarrowing('task')).toEqual({ type: 'task' });
    expect(searchNarrowing('note')).toEqual({ type: 'note' });
    expect(searchNarrowing('stream')).toEqual({ type: 'stream' });
    expect(searchNarrowing('decision')).toEqual({ kind: 'decision' });
    expect(searchNarrowing('command')).toEqual({});
  });
});

describe('keepsRecord', () => {
  const task = { entityType: 'task', kind: null };
  const note = { entityType: 'note', kind: 'note' };
  const decision = { entityType: 'note', kind: 'decision' };
  const capture = { entityType: 'stream' };

  it('keeps the records a filter names', () => {
    expect([task, note, decision, capture].filter((item) => keepsRecord('all', item))).toHaveLength(4);
    expect([task, note, decision, capture].filter((item) => keepsRecord('task', item))).toEqual([task]);
    // Decisions are notes, so Notes keeps them too.
    expect([task, note, decision, capture].filter((item) => keepsRecord('note', item))).toEqual([note, decision]);
    expect([task, note, decision, capture].filter((item) => keepsRecord('decision', item))).toEqual([decision]);
    expect([task, note, decision, capture].filter((item) => keepsRecord('stream', item))).toEqual([capture]);
  });

  it('keeps no records under filters that are not records', () => {
    expect(keepsRecord('command', task)).toBe(false);
    expect(keepsRecord('app', note)).toBe(false);
    expect(keepsRecord('chat', note)).toBe(false);
  });
});
