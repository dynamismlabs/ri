'use client';
/**
 * The messages waiting in a chat's queue (docs/message-queue.md), as a panel
 * on top of the message box. Each one can be sent now, taken back into the
 * message box to edit, or deleted. The home sends them in order once each
 * turn finishes, so the panel only shows them and asks for changes.
 */
import { useEffect, useState } from 'react';
import { ArrowUp, ListEnd, Loader2, Pencil, Trash2 } from 'lucide-react';
import type { Attachment } from '@/db/types';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/system/icon-button';
import { Tip } from '@/components/ui/tip';
import { parseEntitySegments } from '@/lib/entity-refs/parse-markers';
import { messagePreview } from '@/lib/utils/message-preview';
import { useTouchFirst } from '@/hooks/use-touch-first';

export interface QueueStripMessage {
  id: string;
  content: string;
  attachments: Attachment[];
}

/**
 * A queued message as one line: its files by name and its references by
 * kind, the way the message box showed them as chips.
 */
export function queuedMessagePreview(content: string, attachments: readonly Attachment[] = []): string {
  const names = new Map(attachments.map((attachment) => [attachment.fileName, attachment.originalName]));
  const flat = parseEntitySegments(content).map((segment) => {
    if (segment.kind === 'text') return segment.text;
    const { marker } = segment;
    if (marker.kind === 'file') return names.get(marker.fileName) || 'a file';
    if (marker.kind === 'remote') return `@${marker.recordKind}`;
    return `@${marker.kind}`;
  }).join('');
  return messagePreview(flat, 240) ?? '';
}

/** What Send now does, for its tooltip: where the message lands depends on the chat and its harness. */
export function sendNowHint(working: boolean, stopsTurn: boolean): string {
  if (!working) return 'Sends it now. The rest follow once its turn finishes';
  return stopsTurn
    ? 'Stops the current turn and sends this one'
    : 'The agent reads it at its next step in this turn';
}

/**
 * Paused only once the chat has stayed idle a moment: between one turn
 * finishing and the home sending the next queued message, the chat is idle
 * for a few milliseconds, and the note shouldn't flash.
 */
export const PAUSED_AFTER_MS = 1500;

function usePaused(working: boolean): boolean {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    // Cleared at once when the chat works again, so the next idle moment starts the wait afresh.
    const timer = setTimeout(() => setPaused(!working), working ? 0 : PAUSED_AFTER_MS);
    return () => clearTimeout(timer);
  }, [working]);
  return paused && !working;
}

export function MessageQueueStrip({
  messages,
  working,
  sendNowStopsTurn,
  busyId,
  onSendNow,
  onEdit,
  onDelete,
}: {
  messages: readonly QueueStripMessage[];
  /** The chat is working now. Otherwise the queue is holding for the person. */
  working: boolean;
  /** The chat's harness can't take a message mid-turn, so Send now stops the turn first. */
  sendNowStopsTurn: boolean;
  /** A message whose change is on its way to the home. */
  busyId?: string | null;
  onSendNow: (message: QueueStripMessage) => void;
  onEdit: (message: QueueStripMessage) => void;
  onDelete: (message: QueueStripMessage) => void;
}) {
  const paused = usePaused(working);
  // Room for a finger on a phone, as the composer's own buttons have.
  const size = useTouchFirst() ? 'touch' : 'xs';
  if (messages.length === 0) return null;
  return (
    <div className="mx-auto max-w-3xl px-5">
      <section aria-label="Queued messages" data-slot="message-queue" className="ri-message-queue @container/queue mx-3">
        {paused && (
          <p role="status" className="ri-message-queue-note">
            Paused. Send one now, and the rest follow.
          </p>
        )}
        <ol className="ri-message-queue-list">
          {messages.map((message) => {
            const preview = queuedMessagePreview(message.content, message.attachments) || 'Message';
            const busy = busyId === message.id;
            return (
              <li key={message.id} className="ri-message-queue-row" data-busy={busy || undefined}>
                <ListEnd aria-hidden className="size-3.5 shrink-0 text-(--t3)" />
                <Tip label={preview} onlyWhenTextHidden>
                  <span className="min-w-0 flex-1 truncate">{preview}</span>
                </Tip>
                <span className="flex shrink-0 items-center gap-0.5">
                  <Tip label={sendNowHint(working, sendNowStopsTurn)}>
                    <Button
                      type="button"
                      variant="ghost"
                      size={size}
                      disabled={busy}
                      onClick={() => onSendNow(message)}
                      aria-label="Send now"
                      className="gap-1"
                    >
                      {busy ? <Loader2 className="size-3 animate-spin" /> : <ArrowUp className="size-3" />}
                      {/* A narrow strip (a phone, a slim panel) keeps its room for the message. */}
                      <span className="hidden @md/queue:inline">Send now</span>
                    </Button>
                  </Tip>
                  <IconButton
                    type="button"
                    size={size}
                    label="Edit queued message"
                    tooltip="Edit in the message box"
                    disabled={busy}
                    onClick={() => onEdit(message)}
                  >
                    <Pencil className="size-3" />
                  </IconButton>
                  <IconButton
                    type="button"
                    size={size}
                    label="Delete queued message"
                    tooltip="Remove from the queue"
                    disabled={busy}
                    onClick={() => onDelete(message)}
                  >
                    <Trash2 className="size-3" />
                  </IconButton>
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
