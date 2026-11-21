"use client";

import { Button } from '@/components/system/button';
import { INTEGRATION_LABELS } from '@/constants/integrations';
import { Calendar as CalendarIcon } from 'lucide-react';
import { openSettings } from '@/components/settings/settings-store';

/** What the calendar shows until one is connected. */
export function CalendarConnectPrompt({ onConnect }: { onConnect?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
      <CalendarIcon size={24} className="text-muted-foreground/30" />
      <div>
        <p className="text-sm font-medium text-foreground">Connect your calendar</p>
        <p className="text-xs text-muted-foreground mt-1">
          See your day here and let the deck plan around it
        </p>
      </div>
      <Button
        type="button"
        onClick={() => {
          onConnect?.();
          openSettings('plugins');
        }}
        variant="primary"
        size="md"
      >
        Open {INTEGRATION_LABELS.singular.toLowerCase()} settings
      </Button>
    </div>
  );
}
