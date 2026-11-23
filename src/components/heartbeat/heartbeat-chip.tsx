'use client';

import { ChipButton } from '@/components/system/chip-button';
/**
 * The heartbeat on the deck. It appears only when the heartbeat needs the
 * user (never set up, paused by the app, failed, or left an unread report),
 * as a chip in the deck's status row next to "in progress" and "to triage".
 * A healthy heartbeat is silent on the deck; its home is Settings > Heartbeat.
 * Tapping the chip opens those same settings in a sheet. The rule for when it
 * shows is `heartbeatDeckSignal` (src/lib/heartbeat/status.ts).
 */

import { useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/system/sheet';
import { useHeartbeat } from '@/hooks/use-heartbeat';
import { useCoordinatorName } from '@/hooks/use-user-state';
import { describeHeartbeat, heartbeatDeckSignal, type HeartbeatDeckSignal } from '@/lib/heartbeat/status';

import { HeartbeatSettings } from './heartbeat-settings';
import { Tip } from '@/components/ui/tip';



/** The deck signal for the current heartbeat, or null when it should stay quiet. */
export function useHeartbeatDeckSignal(): HeartbeatDeckSignal | null {
  const { data: config } = useHeartbeat();
  return config ? heartbeatDeckSignal(config) : null;
}

export function HeartbeatChip() {
  const { data: config } = useHeartbeat();
  const assistant = useCoordinatorName();
  const [open, setOpen] = useState(false);
  if (!config) return null;

  const signal = heartbeatDeckSignal(config);
  if (!signal) return null;

  const { detail } = describeHeartbeat(config, new Date(), assistant);
  return (
    <>
      <Tip label={detail}>
        <ChipButton
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${signal.label}. ${detail}`}
          variant="secondary"
          size="compact"
          tone="status"
          status={signal.kind === "failed" ? "danger" : signal.kind === "paused" ? "warning" : "neutral"}
        >
          <span className="relative flex shrink-0">
            <HeartPulse size={12} />
          </span>
          {signal.label}
        </ChipButton>
      </Tip>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Heartbeat</SheetTitle>
            <SheetDescription>A regular check-in on your work, following your instructions.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <HeartbeatSettings compact onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
