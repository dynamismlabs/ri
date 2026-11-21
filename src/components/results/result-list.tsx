'use client';
import { Card } from '@/components/system/card';

import { useViewportTier } from '@/hooks/use-viewport-tier';

import { Field } from '@/components/system/field';

import { useDeferredValue, useState } from 'react';
import { HomeLink as Link } from '@/components/home/home-link';
import { FileCheck2, History, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/system/button';
import { Tip } from '@/components/ui/tip';

import { useInfiniteResults } from '@/hooks/use-results';
import { apiErrorText } from '@/lib/api/client';
import type { WorkResultRecord } from '@/db/types';
import { formatCompactRelative } from '@/lib/utils/relative-time';
import { resultListTitle, uniqueResultPages } from './result-list-presentation';
import { ResultRenderer } from '@/components/chat-ui/handoffs/result-renderer';

export function ResultList({ taskId, executionId, compact = false, initialHistory = false }: {
  taskId?: string;
  executionId?: string;
  compact?: boolean;
  initialHistory?: boolean;
}) {
  const compactFieldSize = useViewportTier() === 'phone' ? 'touch' : 'sm';

  const [search, setSearch] = useState('');
  const query = useDeferredValue(search.trim());
  const [history, setHistory] = useState(initialHistory);
  const results = useInfiniteResults({ taskId, executionId, query: query || undefined, includeSuperseded: history });
  const rows = uniqueResultPages(results.data?.pages ?? []);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <Field
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Filter titles and content"
        aria-label="Filter saved results"
        leading={<Search />}
        className="relative min-w-0 flex-1 basis-48"
        size={compactFieldSize}
      />
      <Button
        aria-pressed={history}
        onClick={() => setHistory(!history)}
        variant="secondary"
        size="sm"
      ><History size={14} />Include history</Button>
    </div>
    <p className="text-xs text-muted-foreground">{history ? 'Saved snapshots, including earlier versions.' : 'Current saved snapshots.'}</p>
    {results.isPending && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />Loading saved results</p>}
    {results.error && <div role="alert" className="space-y-2 text-xs text-destructive"><p>{apiErrorText(results.error)}</p><Button
      onClick={() => void results.refetch()}
      variant="secondary"
      size="sm"
    >Retry loading</Button></div>}
    {!results.isPending && !results.error && !rows.length && <p className="py-6 text-sm text-muted-foreground">{query ? 'No saved results match this filter.' : history ? 'No saved results yet.' : 'No current saved results.'}</p>}
    <ul className="space-y-3" aria-label={history ? 'Saved result history' : 'Current saved results'}>{rows.map((result) => <li key={result.id}><ResultListItem result={result} compact={compact} /></li>)}</ul>
    {results.hasNextPage && <Button
      disabled={results.isFetchingNextPage}
      onClick={() => void results.fetchNextPage()}
      variant="secondary"
      size="sm"
    >{results.isFetchingNextPage && <Loader2 size={14} className="animate-spin" />}Load more results</Button>}
  </div>;
}

export function ResultListItem({ result, compact = false }: { result: WorkResultRecord; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return <Card padding="md" density="comfortable" shadow className="min-w-0">
    <div className="flex items-start gap-2">
      <FileCheck2 size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <Link href={`/results/${result.id}`} className="block break-words text-sm font-medium hover:underline">{resultListTitle(result)}</Link>
        <p className="text-[11px] text-muted-foreground">Saved <Tip label={result.createdAt}><time dateTime={result.createdAt}>{formatCompactRelative(result.createdAt)}</time></Tip>{!!result.attachments?.length && ` · ${result.attachments.length} files`}</p>
        {result.supersedesId && <Link href={`/results/${result.supersedesId}`} className="text-[11px] text-muted-foreground hover:underline">View earlier handoff</Link>}
      </div>
    </div>
    {!compact && <div className="mt-2 flex flex-wrap items-center gap-3 pl-6 text-xs">
      <Link href={`/results/${result.id}`} className="text-primary hover:underline">View handoff</Link>
      <Button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        variant="ghost"
        size="sm"
      >{expanded ? 'Hide handoff' : 'Inspect here'}</Button>
    </div>}
    {expanded && <div className="mt-4"><ResultRenderer resultId={result.id} /></div>}
  </Card>;
}
