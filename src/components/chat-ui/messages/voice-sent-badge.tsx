'use client';

import { Popover, PopoverTrigger, PopoverContent } from '@/components/system/popover';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/system/button';
import { useState } from 'react';
import { AudioLines, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserState, useUpdateUserState } from '@/hooks/use-user-state';

/**
 * "Sent with voice" badge — anchors to the bottom-right of a user
 * message and reveals an auto-send toggle popover. Same shape used by
 * the orchestrator chat (content-panel.tsx VoiceSentBadge), pulled
 * into a shared module so both surfaces render identically.
 *
 * Toggle writes through `useUpdateUserState({ voiceAutoSend })`.
 * That setting is global, but it's the same setting all our voice
 * surfaces share — touching it here flips the orchestrator chat too.
 */
export function VoiceSentBadge() {
  const { data: userState } = useUserState();
  const updateUserState = useUpdateUserState();
  const voiceAutoSend = userState?.voiceAutoSend ?? true;
  const [open, setOpen] = useState(false);



  const toggle = () => updateUserState.mutate({ voiceAutoSend: !voiceAutoSend });

  return (
    <Popover open={open} onOpenChange={setOpen}><div className="flex justify-end relative">
      <PopoverTrigger asChild><Button
        type="button"
        variant="ghost"
        size="xs"
        className="flex items-center gap-1.5"
      >
        <AudioLines size={10} />
        <span>Sent with voice</span>
        <ChevronDown size={8} className={cn('transition-transform', open && 'rotate-180')} />
      </Button></PopoverTrigger>

      {open && (
        <PopoverContent padding="md" align="end" className="w-56 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-foreground">Auto-send voice</span>
            <Switch checked={voiceAutoSend} onCheckedChange={toggle} aria-label="Auto-send voice" />
          </div>
          <p className="text-[9px] text-muted-foreground leading-relaxed">
            {voiceAutoSend
              ? 'Voice input sends immediately.'
              : 'Voice input goes to the text box for editing.'}
            {' '}Also in profile settings.
          </p>
        </PopoverContent>
      )}
    </div></Popover>
  );
}
