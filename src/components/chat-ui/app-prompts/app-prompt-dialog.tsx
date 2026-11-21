'use client';
import { Field } from '@/components/system/field';

import { useState, type FormEvent } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/system/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import type { ChatAppPrompt } from '@/lib/integrations/app-prompts';
import { promptArgumentLabel } from '@/lib/integrations/prompt-argument-label';

/**
 * The small form an app's prompt opens when it takes arguments (People's "Prepare for a meeting"
 * asks who). What the person fills in goes to the app, and the app's text lands in the draft for
 * them to edit and send (src/lib/integrations/app-prompts.ts). Nothing is sent from here.
 */
export function AppPromptDialog({ prompt, onOpenChange, onFill }: {
  prompt: ChatAppPrompt | null;
  onOpenChange: (open: boolean) => void;
  /** Asks the app and puts its text in the draft. Rejects with what to tell the person. */
  onFill: (args: Record<string, string>) => Promise<void>;
}) {
  return (
    <Dialog open={!!prompt} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Keyed by prompt, so a second prompt never opens with the first one's answers. */}
        {prompt && <PromptForm key={`${prompt.serverId}:${prompt.name}`} prompt={prompt} onCancel={() => onOpenChange(false)} onFill={onFill} />}
      </DialogContent>
    </Dialog>
  );
}

function PromptForm({ prompt, onCancel, onFill }: { prompt: ChatAppPrompt; onCancel: () => void; onFill: (args: Record<string, string>) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try { await onFill(values); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setPending(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{prompt.title ?? prompt.name}</DialogTitle>
        <DialogDescription>
          {prompt.description ? `${prompt.description} ` : ''}{prompt.app} writes the request, and it goes in your draft to edit before you send it.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        {prompt.arguments.map((arg, index) => {
          const id = `app-prompt-${index}`;
          return (
            <Field
              id={id}
              value={values[arg.name] ?? ''}
              required={arg.required}
              autoFocus={index === 0}
              disabled={pending}
              aria-describedby={arg.description ? `${id}-help` : undefined}
              onChange={(event) =>
                setValues((current) => ({ ...current, [arg.name]: event.target.value }))
              }
              label={
                <>
                  {promptArgumentLabel(arg)}
                  {!arg.required && (
                    <span className="font-normal text-muted-foreground"> (optional)</span>
                  )}
                </>
              }
              key={arg.name}
              description={arg.description && arg.description}
            />
          );
        })}
      </div>
      {error && <p role="alert" className="flex items-start gap-2 text-xs text-destructive"><AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden />{error}</p>}
      <DialogFooter>
        <Button
          type="button"
          onClick={onCancel}
          disabled={pending}
          variant="ghost"
          size="md"
        >Cancel</Button>
        <Button
          type="submit"
          disabled={pending}
          variant="primary"
          size="md"
        >
          {pending && <Loader2 size={13} className="animate-spin" aria-hidden />}
          Add to draft
        </Button>
      </DialogFooter>
    </form>
  );
}
