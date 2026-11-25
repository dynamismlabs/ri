'use client';
import { HoverCardPrimitive as HoverCardPrimitive } from '@/components/system/hover-preview';
import { InlineAction } from '@/components/system/inline-action';


import { useMemo } from 'react';
import { FileIcon } from '@/components/file-icon';
import { cn } from '@/lib/utils';
import { basename } from '@/lib/executions/tool-display';
import { dispatchOpenFile } from '@/lib/entity-refs/open-file-event';
import type { DiffLine, EditDiff } from '@/lib/executions/edit-diff';
import type { TurnFileEdit } from '@/components/chat-ui/activity/transcript-grouping';
import { useArtifactPreview } from './artifact-preview-provider';
import { listedArtifactPreview } from './artifact-list';

/**
 * Render a per-edit hunk as colored lines (add/del/ctx). Shared by the
 * chip hover card and the tool row's inline expansion.
 */
export function DiffLines({ lines, className }: { lines: DiffLine[]; className?: string }) {
  if (!lines.length) return null;
  return (
    <pre className={cn('overflow-x-auto rounded font-mono text-[10.5px] leading-[1.45]', className)}>
      {lines.map((l, i) => (
        <div
          key={i}
          className={cn(
            'whitespace-pre-wrap wrap-anywhere px-2',
            l.kind === 'add' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
            l.kind === 'del' && 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
            l.kind === 'ctx' && 'text-muted-foreground/70',
          )}
        >
          <span className="select-none opacity-50">{l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '} </span>
          {l.text || ' '}
        </div>
      ))}
    </pre>
  );
}

/** Compact "+N −M" counts. */
function DiffCounts({ additions, deletions }: { additions: number; deletions: number }) {
  if (!additions && !deletions) return null;
  return (
    <span className="flex-shrink-0 tabular-nums text-[10.5px] font-medium">
      {additions > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>}
      {additions > 0 && deletions > 0 && <span> </span>}
      {deletions > 0 && <span className="text-rose-600 dark:text-rose-400">−{deletions}</span>}
    </span>
  );
}

interface FileChipProps {
  /** Absolute or worktree-relative path. Drives the icon + open action. */
  path: string;
  /** Per-edit diff for counts + hover preview. Omit for reads. */
  diff?: EditDiff | null;
  /** Override the displayed label (defaults to the path basename). */
  label?: string;
  /** The chat whose tool named the file. With it, a file only read opens in the shared preview. */
  sessionId?: string;
  className?: string;
}

/**
 * Conductor-style file chip: an outline button (background = surface, a
 * border) with the file-type icon, name, and +N/−M counts. Hover shows a
 * diff preview.
 *
 * Click opens what the chip is about. A file the agent changed opens at its
 * change in Files. A file it only read opens like a file in a message: in
 * the shared preview, beside the chat or large, with the switch between
 * them. It isn't one of the chat's cards, so Previous and Next don't walk
 * every file the agent read, only from this one through the shared files.
 */
export function FileChip({ path, diff, label, sessionId, className }: FileChipProps) {
  const name = label ?? basename(path);
  const hasDiff = !!diff && diff.lines.length > 0;
  const open = useArtifactPreview();
  const preview = useMemo(() => !diff && sessionId ? listedArtifactPreview({ source: { kind: 'session', sessionId, path }, name, mimeType: null }) : null, [diff, sessionId, path, name]);

  const chip = (
    <InlineAction appearance="chip"
      type="button"
      data-artifact-card={preview ? '' : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (preview) open(preview, e.currentTarget);
        else dispatchOpenFile(path, e.currentTarget);
      }}
      className={cn("inline-flex max-w-full items-center gap-1.5", "", "", className)}
    >
      <FileIcon name={name} size={13} />
      <span className="truncate font-medium">{name}</span>
      {diff && <DiffCounts additions={diff.additions} deletions={diff.deletions} />}
    </InlineAction>
  );

  if (!hasDiff) return chip;

  return (
    <HoverCardPrimitive.Root openDelay={120} closeDelay={60}>
      <HoverCardPrimitive.Trigger asChild>{chip}</HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content padding="none"
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[min(40rem,calc(100vw-2rem))] outline-none"
        >
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5 text-[11px]">
            <FileIcon name={name} size={13} />
            <span className="truncate font-medium text-foreground">{name}</span>
            <span className="ml-auto"><DiffCounts additions={diff!.additions} deletions={diff!.deletions} /></span>
          </div>
          <div className="max-h-[18rem] overflow-auto py-1">
            <DiffLines lines={diff!.lines} />
          </div>
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
}

const FOOTER_MAX_CHIPS = 8;

/**
 * Per-turn "files changed" footer: every file written/edited in the turn
 * as a clickable chip with cumulative +/− counts. Overflow collapses to
 * a "+N more" tally. Counts come from the tool inputs; clicking a chip
 * opens the file (where the viewer shows the full git diff vs base).
 */
export function TurnFilesFooter({ files }: { files: TurnFileEdit[] }) {
  if (!files.length) return null;
  const shown = files.slice(0, FOOTER_MAX_CHIPS);
  const rest = files.slice(FOOTER_MAX_CHIPS);
  const restAdd = rest.reduce((s, f) => s + f.additions, 0);
  const restDel = rest.reduce((s, f) => s + f.deletions, 0);
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10.5px] text-muted-foreground/70">
      <span className="font-medium">
        {files.length} file{files.length !== 1 ? 's' : ''} changed
      </span>
      {shown.map((f) => (
        <FileChip
          key={f.path}
          path={f.path}
          diff={{ path: f.path, kind: 'edit', additions: f.additions, deletions: f.deletions, lines: [] }}
        />
      ))}
      {rest.length > 0 && (
        <span className="tabular-nums">
          +{rest.length} more{' '}
          {restAdd > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{restAdd}</span>}{' '}
          {restDel > 0 && <span className="text-rose-600 dark:text-rose-400">−{restDel}</span>}
        </span>
      )}
    </div>
  );
}
