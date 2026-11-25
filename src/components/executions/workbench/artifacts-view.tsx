'use client';

import { Field } from '@/components/system/field';

import { IconButton } from '@/components/system/icon-button';
import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { useExecutionArtifacts, type ArtifactScope } from '@/hooks/use-execution-artifacts';
import { useExecutionChats } from '@/hooks/use-execution';
import { ArtifactList } from '@/components/chat-ui/artifacts/artifact-list';
import { Button } from '@/components/system/button';
import { SegmentedControl } from '@/components/system/segmented-control';

import type { ArtifactListItem } from '@/components/chat-ui/artifacts/artifact-list';
import { PREVIEW_HOST_ATTRIBUTE } from '@/components/chat-ui/artifacts/artifact-preview-store';

const SCOPES: { value: ArtifactScope; label: string }[] = [{ value: 'chat', label: 'This chat' }, { value: 'all', label: 'All chats' }];

/**
 * Files shared in this chat, or in every chat on its execution when it has
 * more than one (its tabs, closed ones included). Older files load as the
 * list scrolls to its end, and keep loading while the end stays in view, so
 * a filter searches the whole history without a button to press.
 */
export function ArtifactsView({ sessionId, executionId, active, previewHost }: { sessionId: string; executionId: string | null; active: boolean; previewHost: string }) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<ArtifactScope>('all');
  // The tab strip's own list, from the same cache.
  const { data: chats } = useExecutionChats(executionId, sessionId);
  const several = (chats?.sessions.length ?? 0) > 1;
  // With one chat both scopes are the same files, so the query stays on the
  // execution's while the tab list loads rather than fetching twice.
  const effective: ArtifactScope = several ? scope : 'all';
  const artifacts = useExecutionArtifacts(sessionId, executionId, active, effective);
  const showChat = several && effective === 'all';
  const unique = new Map<string, ArtifactListItem>();
  for (const page of artifacts.data?.pages ?? []) for (const item of page.items) if (!unique.has(item.key)) unique.set(item.key, item);
  const items = [...unique.values()];

  const scroller = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [endInView, setEndInView] = useState(false);
  useEffect(() => {
    const node = end.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setEndInView(entry.isIntersecting), { root: scroller.current, rootMargin: '240px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [artifacts.isPending]);
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = artifacts;
  useEffect(() => {
    // cancelRefetch false: a call while a page is loading joins it rather than asking again.
    if (active && endInView && hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage({ cancelRefetch: false });
  }, [active, endInView, hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  return <section aria-label="Artifacts" {...{ [PREVIEW_HOST_ATTRIBUTE]: previewHost }} className="flex h-full min-h-0 flex-col">
    <div className="shrink-0 space-y-2 border-b border-border p-3">
      <div className="flex items-center justify-between gap-2">
        {several
          ? <SegmentedControl mode="choice" ariaLabel="Show files from" size="compact" value={scope} onChange={setScope} options={SCOPES} />
          : <p className="text-xs text-muted-foreground">Files shared in this chat</p>}
        <IconButton
          disabled={artifacts.isFetching}
          onClick={() => void artifacts.refetch()}
          label="Refresh artifacts"
          tooltip="Check for shared files"
          variant="ghost"
          size="sm"
        ><RefreshCw className={artifacts.isFetching ? 'animate-spin' : undefined} /></IconButton>
      </div>
      <Field
        aria-label="Filter artifacts"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={showChat ? 'Filter by filename, path or chat' : 'Filter by filename or path'}
        className={'min-w-0 w-full'}
        leading={<Search aria-hidden />}
      />
    </div>
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto p-1.5">
      {artifacts.isPending ? <div role="status" className="flex items-center justify-center gap-2 p-8 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />Loading artifacts…</div>
        : <>
          {artifacts.error && <div role="status" className="p-4 text-sm text-muted-foreground"><p>Couldn&apos;t load artifacts. {artifacts.error.message}</p><Button
            onClick={() => void artifacts.refetch()}
            variant="ghost"
            size="sm"
          >Try again</Button></div>}
          {(!artifacts.error || items.length > 0) && <ArtifactList items={items} query={query} showChat={showChat} searching={!!hasNextPage && !isError} />}
          {hasNextPage && !isError && <div role="status" className="flex items-center justify-center gap-2 p-4 text-[11px] text-muted-foreground"><Loader2 size={12} className="animate-spin" />Looking through older messages…</div>}
        </>}
      <div ref={end} aria-hidden className="h-px" />
    </div>
  </section>;
}
