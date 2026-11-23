import { trpcClient } from '@/lib/trpc/client';
import { rpcQuery } from '@/lib/trpc/request-options';

export type SearchMode = 'hybrid' | 'keyword' | 'vector';

/** The types of record a search can be narrowed to. */
export type SearchType = 'task' | 'note' | 'stream';

export type SearchResult = import('@/lib/trpc/router').RouterOutputs['search']['list'][number];

export const searchApi = {
  /**
   * `type` keeps one type of record. `kind` keeps notes of that kind only, and
   * leaves out tasks and stream.
   */
  query(q: string, opts?: { mode?: SearchMode; limit?: number; kind?: 'note' | 'decision'; type?: SearchType }) {
    return trpcClient.search.list.query({query: rpcQuery({ q, ...opts })});
  },
};
