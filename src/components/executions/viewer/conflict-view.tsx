'use client';
import { MenuAction } from '@/components/system/menu-action';

import { SegmentedControl } from '@/components/system/segmented-control';

import { Button } from '@/components/system/button';
import { useCallback, useMemo, useState } from 'react';
import {
  Loader2,
  FileX,
  Lock,
  FileWarning,
  Check,
  TriangleAlert,
  Undo2,
  GitMerge,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorText } from '@/lib/api/client';
import { useFolderFile, useResolveFileConflict } from '@/hooks/use-folder';
import type { FolderSource } from '@/lib/folders/source';
import { FileSkeleton } from '../skeletons';
import {
  parseConflicts,
  serializeResolution,
  resolvedLines,
  type ConflictBlock,
  type ConflictResolution,
} from '@/lib/conflicts/parse';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/tip';

interface ConflictViewProps {
  /** An execution's worktree, or an agent's own folder after a merge in the checkout. */
  source: FolderSource;
  path: string;
}

/**
 * Merge-conflict resolver for a single file. Parses the working-tree
 * file's conflict markers and lets the user resolve each block with the
 * three standard choices — Accept current change / Accept incoming change
 * / Accept both — then writes the resolved file and `git add`s it (via
 * `useResolveFileConflict`) so the file drops out of the tree's
 * "Conflicts" section.
 *
 * "Current" is the ours/HEAD side; "Incoming" is the theirs side being
 * merged in. Resolutions are held locally until the user commits them
 * with the toolbar's Resolve button — nothing is written per-click.
 */
export function ConflictView({ source, path }: ConflictViewProps) {
  const fileQuery = useFolderFile(source, path);
  const resolve = useResolveFileConflict(source);

  const content = fileQuery.data?.content ?? null;
  const parsed = useMemo(
    () => (content != null ? parseConflicts(content) : null),
    [content],
  );
  const blockCount = parsed?.count ?? 0;

  // One resolution slot per conflict block. Reset whenever we switch
  // files or the parsed block count changes (e.g. after a refetch). Reset
  // while rendering, so no hunk ever paints another file's choice.
  const [resolutions, setResolutions] = useState<(ConflictResolution | null)[]>([]);
  const [resolutionsFor, setResolutionsFor] = useState<{ path: string; blockCount: number } | null>(null);
  if (resolutionsFor?.path !== path || resolutionsFor.blockCount !== blockCount) {
    setResolutionsFor({ path, blockCount });
    setResolutions(Array.from({ length: blockCount }, () => null));
  }

  const chooseBlock = useCallback((index: number, choice: ConflictResolution | null) => {
    setResolutions((prev) => {
      const next = [...prev];
      next[index] = choice;
      return next;
    });
  }, []);

  const acceptAll = useCallback(
    (choice: ConflictResolution) => {
      setResolutions((prev) => prev.map(() => choice));
    },
    [],
  );

  const resolvedCount = resolutions.filter(Boolean).length;
  const allResolved = blockCount > 0 && resolvedCount === blockCount;

  const onResolve = useCallback(async () => {
    if (!parsed) return;
    const next = serializeResolution(parsed, resolutions);
    try {
      await resolve.mutateAsync({ path, content: next });
      toast.success('Conflict resolved');
    } catch (err) {
      toast.error(apiErrorText(err));
    }
  }, [parsed, resolutions, resolve, path]);

  // ── Loading / non-text guards, mirroring DiffView ──
  if (fileQuery.isLoading) {
    return <FileSkeleton />;
  }
  if (fileQuery.error) {
    return (
      <EmptyState
        icon={<FileX size={18} className="text-muted-foreground/70" />}
        title="Couldn't load file"
        detail={fileQuery.error instanceof Error ? fileQuery.error.message : 'Unknown error'}
      />
    );
  }
  if (fileQuery.data?.tooLarge) {
    return (
      <EmptyState
        icon={<FileWarning size={18} className="text-amber-500" />}
        title="File too large to resolve here"
        detail="Open it in your editor to resolve the conflict."
      />
    );
  }
  if (fileQuery.data?.isBinary) {
    return (
      <EmptyState
        icon={<Lock size={18} className="text-muted-foreground/70" />}
        title="Binary file"
        detail="Resolve this conflict in your editor, then it'll clear here."
      />
    );
  }

  // No parseable markers. Either the file was resolved out from under us,
  // or it's an unmerged-but-marker-less conflict (delete/modify, rename).
  // Offer to mark it resolved as-is (writes current content + git add).
  if (!parsed || blockCount === 0) {
    if (resolve.isSuccess) {
      return (
        <EmptyState
          icon={<Check size={18} className="text-emerald-500" />}
          title="Conflict resolved"
        />
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <TriangleAlert size={18} className="text-orange-500" />
        <div className="space-y-1">
          <p className="text-[12px] font-medium text-foreground/85">No conflict markers found</p>
          <p className="text-[11px] text-muted-foreground/70">
            Git marked this file unmerged but there are no{' '}
            <code className="font-mono">{'<<<<<<<'}</code> markers to resolve. Keep the current
            contents and mark it resolved, or edit it in Current mode first.
          </p>
        </div>
        <Button
          type="button"
          onClick={onResolve}
          disabled={resolve.isPending}
          variant="primary"
          size="md"
          className="inline-flex items-center gap-1.5"
        >
          {resolve.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Mark resolved
        </Button>
      </div>
    );
  }

  // Each segment's place among the conflicts (-1 for context), so a hunk
  // reads and sets its own resolution.
  const conflictIndexes: number[] = [];
  let conflictsSeen = 0;
  for (const seg of parsed.segments) conflictIndexes.push(seg.type === 'context' ? -1 : conflictsSeen++);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 font-medium text-orange-600 dark:text-orange-400">
            <GitMerge size={12} />
            {blockCount} {blockCount === 1 ? 'conflict' : 'conflicts'}
          </span>
          <span className="tabular-nums text-muted-foreground/70">
            {resolvedCount}/{blockCount} resolved
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            onClick={() => acceptAll('current')}
            variant="secondary"
            size="sm"
          >
            All current
          </Button>
          <Button
            type="button"
            onClick={() => acceptAll('incoming')}
            variant="secondary"
            size="sm"
          >
            All incoming
          </Button>
          <Tip label={allResolved ? 'Save the resolution and mark resolved' : 'Resolve every conflict first'}>
            <Button
              type="button"
              onClick={onResolve}
              disabled={!allResolved || resolve.isPending}
              variant="primary"
              size="md"
              className="inline-flex items-center gap-1.5"
            >
              {resolve.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Resolve file
            </Button>
          </Tip>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-auto py-1 text-[12px] leading-[1.5]">
        {parsed.segments.map((seg, i) => {
          if (seg.type === 'context') {
            return <ContextBlock key={`ctx-${i}`} lines={seg.lines} />;
          }
          const idx = conflictIndexes[i];
          return (
            <ConflictHunk
              key={`conflict-${i}`}
              block={seg.block}
              index={idx}
              total={blockCount}
              resolution={resolutions[idx] ?? null}
              onChoose={(choice) => chooseBlock(idx, choice)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Context (unchanged) lines, with long runs collapsed ──

const COLLAPSE_OVER = 8;
const COLLAPSE_EDGE = 3;

function ContextBlock({ lines }: { lines: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (lines.length <= COLLAPSE_OVER || expanded) {
    return <LineRows lines={lines} tone="context" />;
  }
  const hidden = lines.length - COLLAPSE_EDGE * 2;
  return (
    <>
      <LineRows lines={lines.slice(0, COLLAPSE_EDGE)} tone="context" />
      <MenuAction density="compact"
        type="button"
        onClick={() => setExpanded(true)}
        className="block w-full text-left"
      >
        ⋯ {hidden} unchanged {hidden === 1 ? 'line' : 'lines'}
      </MenuAction>
      <LineRows lines={lines.slice(-COLLAPSE_EDGE)} tone="context" />
    </>
  );
}

// ── A single conflict block ──

function ConflictHunk({
  block,
  index,
  total,
  resolution,
  onChoose,
}: {
  block: ConflictBlock;
  index: number;
  total: number;
  resolution: ConflictResolution | null;
  onChoose: (choice: ConflictResolution | null) => void;
}) {
  return (
    <div className="my-1.5 overflow-hidden rounded-md border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <TriangleAlert size={11} className="text-orange-500" />
          Conflict {index + 1} of {total}
        </span>
        <SegmentedControl
          mode="choice"
          ariaLabel={'Resolve conflict ' + (index + 1)}
          value={resolution}
          onChange={onChoose}
          options={[
            { value: 'current', label: 'Accept current' },
            { value: 'incoming', label: 'Accept incoming' },
            { value: 'both', label: 'Accept both' },
          ]}
        />
      </div>

      {resolution == null ? (
        <>
          <SideHeader tone="current" label="Current change" hint={block.currentLabel} />
          <LineRows lines={block.current} tone="current" />
          <SideHeader tone="incoming" label="Incoming change" hint={block.incomingLabel} />
          <LineRows lines={block.incoming} tone="incoming" />
        </>
      ) : (
        <div>
          <div className="flex items-center justify-between gap-2 border-b border-border bg-emerald-500/5 px-3 py-1">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
              <Check size={11} />
              {resolution === 'current'
                ? 'Using current change'
                : resolution === 'incoming'
                  ? 'Using incoming change'
                  : 'Using both changes'}
            </span>
            <Button
              type="button"
              onClick={() => onChoose(null)}
              variant="secondary"
              size="sm"
              className="inline-flex items-center gap-1"
            >
              <Undo2 size={10} />
              Undo
            </Button>
          </div>
          <LineRows lines={resolvedLines(block, resolution)} tone="resolved" />
        </div>
      )}
    </div>
  );
}

function SideHeader({
  tone,
  label,
  hint,
}: {
  tone: 'current' | 'incoming';
  label: string;
  hint?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        tone === 'current'
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
      )}
    >
      {label}
      {hint ? <span className="font-mono text-[10px] font-normal normal-case opacity-70">{hint}</span> : null}
    </div>
  );
}

function LineRows({
  lines,
  tone,
}: {
  lines: string[];
  tone: 'context' | 'current' | 'incoming' | 'resolved';
}) {
  const bg =
    tone === 'current'
      ? 'bg-emerald-500/5'
      : tone === 'incoming'
        ? 'bg-sky-500/5'
        : tone === 'resolved'
          ? 'bg-emerald-500/[0.03]'
          : '';
  const text = tone === 'context' ? 'text-muted-foreground/80' : 'text-foreground/90';
  if (lines.length === 0) {
    return <div className={cn('px-3 font-mono text-[11px] italic text-muted-foreground/40', bg)}>(empty)</div>;
  }
  return (
    <div className={bg}>
      {lines.map((line, i) => (
        <div key={i} className={cn('whitespace-pre px-3 font-mono text-[12px]', text)}>
          {line.length ? line : '​'}
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center text-[11px] text-muted-foreground/80">
      {icon}
      <span className="text-[12px] font-medium text-foreground/85">{title}</span>
      {detail && <span className="text-muted-foreground/70">{detail}</span>}
    </div>
  );
}
