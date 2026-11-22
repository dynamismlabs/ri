'use client';
import { DialogPrimitive } from '@/components/system/dialog';
import { ChoiceRow, ChoiceGroup } from '@/components/system/choice-row';
import { Card } from '@/components/system/card';
import { Callout } from '@/components/system/callout';

import { Button } from '@/components/system/button';
import { useMergePr, useSessionPr, useSetAutoMerge } from '@/hooks/use-execution-actions';
import { apiErrorBody, apiErrorStatus, apiErrorText } from '@/lib/api/client';

import { AlertTriangle, GitMerge } from 'lucide-react';
import { VisuallyHidden } from 'radix-ui';
import { useState } from 'react';
import { ActionButton } from './action-button';

interface MergeButtonProps {
  sessionId: string;
  prNumber: number;
  prUrl: string;
  /** When false, the button renders greyed with a tooltip explaining why. */
  enabled: boolean;
  /** Reason shown in the tooltip + confirm dialog when not enabled. */
  reason?: string;
  variant?: 'primary' | 'secondary';
}

const METHODS: ReadonlyArray<{ value: 'squash' | 'merge' | 'rebase'; label: string }> = [
  { value: 'squash', label: 'Squash and merge' },
  { value: 'merge', label: 'Create a merge commit' },
  { value: 'rebase', label: 'Rebase and merge' },
];

/**
 * Merge button + confirm dialog. Pops a quick "Merge method" prompt so
 * users can pick between squash/merge/rebase; defaults to squash. The
 * dialog also surfaces any blocking reason when `enabled` is false
 * (e.g. PR not mergeable).
 */
export function MergeButton({
  sessionId,
  prNumber,
  prUrl,
  enabled,
  reason,
  variant = 'primary',
}: MergeButtonProps) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<'squash' | 'merge' | 'rebase'>('squash');
  const [error, setError] = useState<string | null>(null);
  const merge = useMergePr(sessionId);

  // CI gate: warn (never block — the user can always override) when the PR
  // has failing or still-running checks. Reads the same cached PR query the
  // action bar already drives, so no extra fetch.
  const { data: prData } = useSessionPr(sessionId);
  const checks = prData?.pr?.checks ?? null;
  const ciWarn = checks && (checks.state === 'failing' || checks.state === 'pending') ? checks : null;

  const autoMerge = useSetAutoMerge(sessionId);
  const autoMergeEnabled = prData?.pr?.autoMergeEnabled ?? false;

  const handleAutoMerge = () => {
    setError(null);
    autoMerge.mutate(autoMergeEnabled ? { enable: false } : { enable: true, method }, {
      // Enabling is "set it and walk away" — close the dialog. Disabling
      // keeps it open so the user can still merge now.
      onSuccess: () => {
        if (!autoMergeEnabled) setOpen(false);
      },
      onError: (err) => {
        if (apiErrorStatus(err) !== undefined) {
          const body = apiErrorBody(err) as { message?: string; error?: string } | null;
          setError(body?.message ?? body?.error ?? `Auto-merge failed (${apiErrorStatus(err)})`);
        } else {
          setError(err instanceof Error ? apiErrorText(err) : String(err));
        }
      },
    });
  };

  const handleMerge = () => {
    setError(null);
    merge.mutate(
      { method, deleteBranch: true },
      {
        onSuccess: () => {
          setOpen(false);
        },
        onError: (err) => {
          if (apiErrorStatus(err) !== undefined) {
            const body = apiErrorBody(err) as { message?: string; error?: string } | null;
            setError(body?.message ?? body?.error ?? `Merge failed (${apiErrorStatus(err)})`);
          } else {
            setError(err instanceof Error ? apiErrorText(err) : String(err));
          }
        },
      },
    );
  };

  return (
    <>
      <ActionButton
        icon={<GitMerge size={11} />}
        label={`Merge #${prNumber}`}
        onClick={() => setOpen(true)}
        disabled={!enabled}
        variant={variant}
        title={enabled ? undefined : reason ?? 'Merge unavailable'}
      />
      <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay data-slot="dialog-overlay" className="fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content placement="custom" padding="none" data-slot="dialog-content" className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <VisuallyHidden.Root>
              <DialogPrimitive.Title>Merge PR #{prNumber}</DialogPrimitive.Title>
              <DialogPrimitive.Description>Confirm merge of pull request</DialogPrimitive.Description>
            </VisuallyHidden.Root>
            <div className="overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <GitMerge size={14} className="text-primary" />
                  <span className="text-[13px] font-semibold text-foreground">
                    Merge PR #{prNumber}
                  </span>
                </div>
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {prUrl}
                </a>
              </div>

              <div className="px-5 py-4 space-y-3">
                {!enabled && reason && (
                  <Callout padding="md" density="row" tone={"warning"} className="flex items-start gap-2">
                    <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                    <span>{reason}</span>
                  </Callout>
                )}

                {ciWarn && (
                  <Callout padding="md" density="row" tone={(ciWarn.state === 'failing' ? "error" : "warning")}
                    className="flex items-start gap-2"
                  >
                    <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                    <span>
                      {ciWarn.state === 'failing'
                        ? `${ciWarn.failed} of ${ciWarn.total} CI ${ciWarn.failed === 1 ? 'check is' : 'checks are'} failing. Merge anyway?`
                        : `${ciWarn.pending} of ${ciWarn.total} CI ${ciWarn.pending === 1 ? 'check is' : 'checks are'} still running. Merge anyway?`}
                    </span>
                  </Callout>
                )}

                <ChoiceGroup asChild name="merge-method" value={method} onValueChange={value => setMethod(value as typeof method)}><fieldset className="space-y-1.5">
                  <legend className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">
                    Merge method
                  </legend>
                  {METHODS.map((m) => (
                    <ChoiceRow key={m.value} selection="radio" value={m.value} density="compact" className="flex items-center gap-2">
                      {m.label}
                    </ChoiceRow>
                  ))}
                </fieldset></ChoiceGroup>

                {error && (
                  <Callout padding="md" density="row" tone={"error"} >
                    {error}
                  </Callout>
                )}

                <Card padding="md" density="row" className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {autoMergeEnabled
                      ? 'Auto-merge is on. GitHub merges when checks pass.'
                      : 'Or let GitHub merge automatically once checks pass.'}
                  </span>
                  <Button
                    type="button"
                    onClick={handleAutoMerge}
                    disabled={autoMerge.isPending}
                    variant="secondary"
                    size="sm"
                  >
                    {autoMerge.isPending ? '…' : autoMergeEnabled ? 'Disable auto-merge' : 'Enable auto-merge'}
                  </Button>
                </Card>
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/20">
                <Button
                  type="button"
                  onClick={() => setOpen(false)}
                  variant="secondary"
                  size="md"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleMerge}
                  disabled={!enabled || merge.isPending}
                  variant="secondary"
                  size="md"
                >
                  {merge.isPending ? 'Merging…' : 'Merge'}
                </Button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
