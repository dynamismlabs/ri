'use client';
import { Card } from '@/components/system/card';

import { Button } from '@/components/system/button';
import { CircleDashed, FileText, Loader2, RefreshCw, MessageSquarePlus } from 'lucide-react';
import { MessageResponse } from '@/components/ai-elements/message';
import { apiErrorText } from '@/lib/api/client';
import type { EntityBriefHandle } from '@/hooks/use-entity-brief';
import type { BriefEntityType } from '@/lib/briefs/types';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/tip';

/**
 * The brief: the agent's rendering of this document for the person who owns
 * it. Sits above the conversation in the agent-first view. Short documents
 * are shown as themselves (no model call); long ones get a summary, the
 * points worth knowing, what is still open, and suggested next asks that
 * send straight into the conversation.
 */
export function EntityBriefCard({
  entityType,
  body,
  brief,
  onSuggestion,
  onOpenDocument,
  canSend,
}: {
  entityType: BriefEntityType;
  /** The current body, for the inline (short document) case. */
  body: string;
  brief: EntityBriefHandle;
  /** Send a suggested ask into the conversation. */
  onSuggestion: (text: string) => void;
  onOpenDocument: () => void;
  /** False while the chat session is not ready; chips render disabled. */
  canSend: boolean;
}) {
  const { state, isLoading, isGenerating, generateError, refresh } = brief;
  const noun = entityType;
  const trimmed = body.trim();

  if (isLoading || !state) {
    return (
      <Frame>
        <Row muted>
          <Loader2 size={12} className="animate-spin" /> Loading…
        </Row>
      </Frame>
    );
  }

  // Short document: it is its own brief.
  if (state.status === 'inline') {
    if (!trimmed) {
      return (
        <Frame>
          <p className="text-[13px] text-foreground/90">Nothing here yet.</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Tell me what this {noun} is about, paste anything in, or just talk. I&apos;ll write it up and keep it
            organized. You can open the document any time to see or edit the words yourself.
          </p>
        </Frame>
      );
    }
    return (
      <Frame>
        <div className="text-[13px] leading-relaxed [&_p]:text-[13px] [&_li]:text-[13px]">
          <MessageResponse>{trimmed}</MessageResponse>
        </div>
        <Chips
          items={INLINE_SUGGESTIONS[entityType]}
          onPick={onSuggestion}
          disabled={!canSend}
        />
        <Footer onOpenDocument={onOpenDocument} label={`This is the whole ${noun}.`} />
      </Frame>
    );
  }

  const b = state.brief;

  // Nothing cached yet and the generation is running (or about to).
  if (!b) {
    if (generateError) {
      return (
        <Frame>
          <p className="text-[12.5px] font-medium text-foreground">Couldn&apos;t brief this {noun}.</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{apiErrorText(generateError)}</p>
          <div className="mt-2 flex items-center gap-2">
            <SmallButton onClick={refresh} disabled={isGenerating}>
              <RefreshCw size={11} /> Try again
            </SmallButton>
            <SmallButton onClick={onOpenDocument} subtle>
              <FileText size={11} /> Open document
            </SmallButton>
          </div>
        </Frame>
      );
    }
    return (
      <Frame>
        <Row muted>
          <Loader2 size={12} className="animate-spin text-primary" /> Reading this {noun}…
        </Row>
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          First open takes a moment. After that it is instant until the {noun} changes.
        </p>
      </Frame>
    );
  }

  return (
    <Frame>
      <p className="text-[13.5px] leading-relaxed text-foreground">{b.summary}</p>

      {b.points.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {b.points.map((p, i) => (
            <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-foreground/85">
              <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-foreground/40" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}

      {b.open.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] font-semibold text-muted-foreground/70">Still open</div>
          <ul className="mt-1 space-y-1">
            {b.open.map((o, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-foreground/85">
                <CircleDashed size={12} className="mt-[3px] flex-shrink-0 text-amber-500/80" />
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Chips items={b.suggestions} onPick={onSuggestion} disabled={!canSend} />

      <Footer
        onOpenDocument={onOpenDocument}
        label={
          state.status === 'stale'
            ? isGenerating
              ? 'Updating the brief…'
              : `Changed since this brief.`
            : `Brief from ${b.model ?? b.provider}, ${timeAgo(b.generatedAt)}.`
        }
        action={
          state.status === 'stale' && !isGenerating ? (
            <Button
              type="button"
              onClick={refresh}
              variant="link"
              size="sm"
              className="inline-flex items-center gap-1"
            >
              <RefreshCw size={10} /> Refresh
            </Button>
          ) : generateError ? (
            <Tip label={apiErrorText(generateError)}>
              <Button
                type="button"
                onClick={refresh}
                variant="link"
                size="sm"
                tone="danger"
                className="inline-flex items-center gap-1"
              >
                <RefreshCw size={10} /> Refresh failed, retry
              </Button>
            </Tip>
          ) : null
        }
      />
    </Frame>
  );
}

const INLINE_SUGGESTIONS: Record<BriefEntityType, string[]> = {
  task: ['Draft the outcome and what done looks like', 'Turn this into a checklist', 'Break this into subtasks'],
  note: ['Expand this into a fuller note', 'Pull out any tasks hiding in here', 'Tidy this into sections'],
};

// ─── Bits ─────────────────────────────────────────────────────────

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <Card padding="lg" density="comfortable" shadow >
      {children}
    </Card>
  );
}

function Row({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2 text-[12.5px]', muted ? 'text-muted-foreground' : 'text-foreground')}>
      {children}
    </div>
  );
}

function SmallButton({
  children,
  onClick,
  disabled,
  subtle,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  subtle?: boolean;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      variant={subtle ? "secondary" : "primary"}
      size="xs"
    >
      {children}
    </Button>
  );
}

function Chips({
  items,
  onPick,
  disabled,
}: {
  items: string[];
  onPick: (text: string) => void;
  disabled: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {items.map((s) => (
        <Tip key={s} label="Send this to the agent">
          <Button
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            variant="secondary"
            size="md"
            className="inline-flex max-w-full items-center gap-1"
          >
            <MessageSquarePlus size={10} className="flex-shrink-0" />
            <span className="truncate">{s}</span>
          </Button>
        </Tip>
      ))}
    </div>
  );
}

function Footer({
  label,
  action,
  onOpenDocument,
}: {
  label: string;
  action?: React.ReactNode;
  onOpenDocument: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground/80">
      <span>{label}</span>
      {action}
      <Button
        type="button"
        onClick={onOpenDocument}
        variant="ghost"
        size="sm"
        className="ml-auto inline-flex items-center gap-1"
      >
        <FileText size={11} /> Open document
      </Button>
    </div>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
