'use client';

import { Button } from '@/components/system/button';
import { useState } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorText } from '@/lib/api/client';
import { useSpace } from './space-root';
import { Tip } from '@/components/ui/tip';

/** Cross the document boundary directly into the ordinary personal launcher. */
export function WorkWithPersonalAgent({ taskId, label = 'Work in My Ri' }: { taskId: string; label?: string }) {
  const space = useSpace();
  const [busy, setBusy] = useState(false);
  if (!space || space.status !== 'active') return null;
  return (
    <Tip label="Choose a personal agent and model. The conversation stays in My Ri." onlyWhenTextHidden>
      <Button
        type="button"
        aria-label={label}
        disabled={busy}
        onClick={async () => {
        setBusy(true);
        try {
          window.location.assign(`/?workTask=${encodeURIComponent(taskId)}&workTeam=${encodeURIComponent(space.id)}`);
        } catch (error) {
          toast.error(apiErrorText(error));
          setBusy(false);
        }
      }}
        variant="secondary"
        size="sm"
        className="inline-flex shrink-0 items-center gap-1.5"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />}
        <span>{label}</span>
      </Button>
    </Tip>
  );
}
