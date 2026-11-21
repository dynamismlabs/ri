'use client';

import { Button } from '@/components/system/button';
import { useState } from 'react';
import type { ApprovalDetail } from '@/lib/integrations/approval-describe';
import { cn } from '@/lib/utils';

/** A value this long, or with this many lines, starts as a preview the person can open in full. */
const PREVIEW_CHARS = 280;
const PREVIEW_LINES = 4;

/**
 * The arguments that decide what a paused account action does, as the chat's approval card and an
 * app's hub panel both show them: every recipient, the subject, and the whole body behind Show all.
 */
export function ApprovalDetails({ details, className }: { details: readonly ApprovalDetail[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[10.5px]', className)}>
      {details.map((detail) => (
        <div key={detail.label} className="contents">
          <dt className="text-muted-foreground/70">{detail.label}</dt>
          <dd className="min-w-0 break-words font-mono text-muted-foreground"><DetailValue value={detail.value} /></dd>
        </div>
      ))}
    </dl>
  );
}

function DetailValue({ value }: { value: string }) {
  const [open, setOpen] = useState(false);
  const long = value.length > PREVIEW_CHARS || value.split('\n').length > PREVIEW_LINES;
  if (!long) return <span className="whitespace-pre-wrap">{value}</span>;
  return (
    <>
      <span className={cn('whitespace-pre-wrap', !open && 'line-clamp-4')}>{value}</span>
      <Button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        variant="link"
        size="xs"
        className="mt-0.5 block"
      >
        {open ? 'Show less' : 'Show all'}
      </Button>
    </>
  );
}
