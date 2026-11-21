'use client';
import { MenuAction } from '@/components/system/menu-action';

import type { ChatEventRecord } from '@/lib/api/dto/records';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { ExecutionEvent } from './execution-event';
import { formatSpan, summarizeCounts, type TranscriptNode } from './transcript-grouping';

type GroupNode = Extract<TranscriptNode, { kind: 'group' }>;

/**
 * Collapsed summary of one completed turn's intermediate activity. Reads
 * like the Thinking toggle — a single dim row ("6 tool calls · 4
 * thinking") that expands to the full ordered detail. Default collapsed.
 */
export function ActivityGroup({
  node,
  sessionId,
  resultByCallId,
  subagentEventsByCallId,
}: {
  node: GroupNode;
  sessionId?: string;
  resultByCallId?: Map<string, ChatEventRecord>;
  /** Nested subagent transcripts, keyed by the tool call that launched them. */
  subagentEventsByCallId?: Map<string, ChatEventRecord[]>;
}) {
  const [expanded, setExpanded] = useState(false);
  const summary = summarizeCounts(node.counts);
  const span = formatSpan(node.startedAt, node.endedAt);

  return (
    <div className="flex flex-col">
      <MenuAction density="none"
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="group/grp flex w-full items-center gap-1.5 text-left"
      >
        <ChevronRight
          size={11}
          className={cn('flex-shrink-0 transition-transform text-muted-foreground/40', expanded && 'rotate-90')}
        />
        <span className="truncate font-medium">{summary}</span>
        {span && <span className="flex-shrink-0 text-muted-foreground/45 tabular-nums">{span}</span>}
      </MenuAction>

      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          {node.events.map((event) => (
            <ExecutionEvent
              key={event.id}
              event={event}
              sessionId={sessionId}
              resultByCallId={resultByCallId}
              subagentEventsByCallId={subagentEventsByCallId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
