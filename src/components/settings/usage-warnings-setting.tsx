'use client';

import { useId } from 'react';
import { Button } from '@/components/system/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { useUserState, useUpdateUserState } from '@/hooks/use-user-state';
import { USAGE_WARNING_THRESHOLDS } from '@/lib/harness/rate-limit-display';

export function UsageWarningsSetting({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const preference = useUserState();
  const update = useUpdateUserState();
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p id={`${id}-label`} className={compact ? 'text-[11px]' : 'text-[12px] font-medium'}>Show at</p>
        {!compact && <p id={`${id}-description`} className="mt-0.5 text-[11px] text-muted-foreground">Choose when subscription usage appears in the top bar.</p>}
      </div>
      {/* Every button keeps its left border, so two neighbors that are both on still read as two. */}
      <ButtonGroup
        aria-labelledby={`${id}-label`}
        aria-describedby={compact ? undefined : `${id}-description`}
        className="shrink-0 [&>*:not(:first-child)]:border-l [&>*:not(:last-child)]:border-r-0"
      >
        {USAGE_WARNING_THRESHOLDS.map((threshold) => {
          const on = preference.data?.[threshold.field] ?? threshold.defaultOn;
          const aboveZero = threshold.percent === 0;
          return (
            <Button
              key={threshold.percent}
              type="button"
              disabled={!preference.isSuccess}
              aria-label={aboveZero ? 'Above 0%' : undefined}
              aria-pressed={on}
              onClick={() => update.mutate({ [threshold.field]: !on })}
              variant="secondary"
              size="xs"
            >
              {aboveZero ? '>0%' : `${threshold.percent}%`}
            </Button>
          );
        })}
      </ButtonGroup>
    </div>
  );
}
