'use client';

import { Loader2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/system/button';
import { Tip } from '@/components/ui/tip';
import { usePluginSetupHelp } from '@/hooks/use-plugin-setup-help';
import type { PluginSetupHelpTarget } from '@/lib/plugins/setup-help';

const TIP = 'Sends setup details to your main chat so your agent can investigate.';

/**
 * Available before connecting, after a failure, and for already-installed plugins.
 * `compact` sits in a header row (inside an `@container`): its label folds away
 * on a narrow one, and a failure shows as a toast like the row's other actions.
 */
export function PluginSetupHelpButton({ target, disabled = false, compact = false }: {
  target: PluginSetupHelpTarget;
  disabled?: boolean;
  compact?: boolean;
}) {
  const help = usePluginSetupHelp();
  const label = help.isPending ? 'Asking your main agent…' : 'Get setup help';
  const off = disabled || help.isPending || !help.available;
  if (compact) {
    return (
      <Tip label={TIP}>
        <Button
          type="button"
          aria-label={label}
          disabled={off}
          onClick={() => void help.ask(target).then((error) => { if (error) toast.error(error); })}
          variant="secondary"
          size="md"
          className="flex flex-shrink-0 items-center gap-1.5"
        >
          {help.isPending ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
          <span className="hidden @lg:inline">{label}</span>
        </Button>
      </Tip>
    );
  }
  return <div className="space-y-2">
    <Tip label={TIP}>
      <Button
        type="button"
        disabled={off}
        onClick={() => void help.ask(target)}
        variant="secondary"
        size="md"
      >
        {help.isPending ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
        {label}
      </Button>
    </Tip>
    {help.error && <p role="alert" className="text-xs text-destructive">{help.error}</p>}
  </div>;
}
