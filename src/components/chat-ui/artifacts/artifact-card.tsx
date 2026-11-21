'use client';
import { MenuAction } from '@/components/system/menu-action';

import { useCallback, useState, type ComponentProps, type ReactNode } from 'react';
import { Expand, PanelLeft, PanelRight } from 'lucide-react';
import { Tip } from '@/components/ui/tip';
import { usePreviewVisibility } from '@/hooks/use-preview-visibility';
import { cn } from '@/lib/utils';
import { useArtifactCardMode, useArtifactPreview, useArtifactPreviewCard, type ArtifactPreview } from './artifact-preview-provider';

/** A chat artifact's card. Clicking opens `preview` beside the chat, as a
 * tab in the panel next to it, or in the large dialog, whichever the person
 * last chose (`preview-place.ts`). Either way Previous and Next move through
 * the other cards in the same chat. The corner icon says which, and the
 * card whose file is beside the chat is marked. `children` is the
 * thumbnail, mounted only near the viewport. */
export function ArtifactCard({ name, icon, details, preview, children, ...props }: Omit<ComponentProps<'button'>, 'onClick' | 'ref'> & { name: string; icon: ReactNode; details?: ReactNode; preview: ArtifactPreview }) {
  const [overTitle, setOverTitle] = useState(false);
  const [card, setCard] = useState<HTMLButtonElement | null>(null);
  const open = useArtifactPreview();
  const mode = useArtifactCardMode(card);
  const { ref: visibilityRef, visible } = usePreviewVisibility();
  const cardRef = useArtifactPreviewCard(preview);
  const ref = useCallback((node: HTMLButtonElement | null) => {
    setCard(node);
    const observed = visibilityRef(node);
    const registered = cardRef(node);
    return () => { observed?.(); registered?.(); };
  }, [visibilityRef, cardRef]);
  const shown = mode === 'shown';
  const Opens = mode === 'large' ? Expand : mode === 'left' ? PanelLeft : PanelRight;
  return (
    // Opaque, so a card reads the same in a person's message bubble, whose
    // colors invert, as in the transcript.
    <span className={cn(
      'relative my-1 mx-0.5 inline-flex w-60 max-w-full flex-col overflow-hidden rounded-lg border bg-background align-middle text-foreground transition-colors focus-within:ring-2 focus-within:ring-ring',
      shown ? 'border-primary/70' : 'border-border hover:border-foreground/30',
    )}>
      <span className="relative block aspect-[3/2] w-full overflow-hidden bg-muted/40">{visible && children}</span>
      <Tip
        label={overTitle ? details ?? name : undefined}
        side="bottom"
        onlyWhenTextHidden={details == null}
        onFocus={() => setOverTitle(true)}
        onBlur={() => setOverTitle(false)}
        onPointerLeave={() => setOverTitle(false)}
        onPointerMove={event => {
          // The button's stretched click target covers the image, but hover
          // details belong to its visible filename footer only.
          const bounds = event.currentTarget.getBoundingClientRect();
          setOverTitle(event.clientY >= bounds.top && event.clientY <= bounds.bottom && event.clientX >= bounds.left && event.clientX <= bounds.right);
        }}
      >
        <MenuAction
          ref={ref}
          type="button"
          {...props}
          data-artifact-card=""
          aria-current={shown || undefined}
          onClick={event => open(preview, event.currentTarget)}
          className="flex w-full items-center gap-1.5 text-left after:absolute after:inset-0 after:content-['']"
        >
          {icon}<span className="min-w-0 flex-1 truncate">{name}</span><Opens size={12} aria-hidden className={cn('shrink-0', shown ? 'text-primary' : 'text-muted-foreground')} />
        </MenuAction>
      </Tip>
    </span>
  );
}
