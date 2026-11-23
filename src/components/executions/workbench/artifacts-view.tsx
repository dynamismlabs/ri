'use client';

import { Field } from '@/components/system/field';

import { IconButton } from '@/components/system/icon-button';
import { useState } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { useExecutionArtifacts } from '@/hooks/use-execution-artifacts';
import { ArtifactList } from '@/components/chat-ui/artifacts/artifact-list';
import { Button } from '@/components/system/button';

import type { ArtifactListItem } from '@/components/chat-ui/artifacts/artifact-list';
import { PREVIEW_HOST_ATTRIBUTE } from '@/components/chat-ui/artifacts/artifact-preview-store';

export function ArtifactsView({ sessionId, executionId, active, previewHost }: { sessionId: string; executionId: string | null; active: boolean; previewHost: string }) {
  const [query, setQuery] = useState('');
  const artifacts = useExecutionArtifacts(sessionId, executionId, active);
  const unique = new Map<string, ArtifactListItem>();
  for (const page of artifacts.data?.pages ?? []) for (const item of page.items) if (!unique.has(item.key)) unique.set(item.key, item);
  const items = [...unique.values()];
  return <section aria-label="Artifacts" {...{ [PREVIEW_HOST_ATTRIBUTE]: previewHost }} className="flex h-full min-h-0 flex-col">
    <div className="shrink-0 space-y-2 border-b border-border p-3">
      <div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Files from every chat</p>
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
        placeholder="Filter by filename, path or chat"
        className={'min-w-0 w-full'}
        leading={<Search aria-hidden />}
      />
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
      {artifacts.isPending ? <div role="status" className="flex items-center justify-center gap-2 p-8 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />Loading artifacts…</div>
        : <>
          {artifacts.error && <div role="status" className="p-4 text-sm text-muted-foreground"><p>Couldn&apos;t load artifacts. {artifacts.error.message}</p><Button
            onClick={() => void artifacts.refetch()}
            variant="ghost"
            size="sm"
          >Try again</Button></div>}
          {(!artifacts.error || items.length > 0) && <ArtifactList items={items} query={query} />}
          {artifacts.hasNextPage && <div className="space-y-1 p-3 text-center"><p className="text-[11px] text-muted-foreground">{query ? 'The filter applies to loaded files. Load older messages to find more.' : 'More files may be in older messages.'}</p><Button
            disabled={artifacts.isFetching}
            onClick={() => void artifacts.fetchNextPage()}
            variant="ghost"
            size="sm"
          >{artifacts.isFetchingNextPage ? 'Loading…' : 'Load older messages'}</Button></div>}
        </>}
    </div>
  </section>;
}
