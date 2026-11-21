"use client";
import { Callout } from '@/components/system/callout';

import { Button } from '@/components/system/button';
import { Dialog } from '@base-ui/react/dialog';
import { Target } from 'lucide-react';
import { useDashboard } from '@/contexts/dashboard-context';
import { cn } from '@/lib/utils';

export function FocusView() {
  const { theme, isFocusMode, exitFocusMode, focusTask } = useDashboard();
  const isDark = theme === 'dark';

  if (!focusTask) return null;

  return (
    <Dialog.Root open={isFocusMode} onOpenChange={(open) => { if (!open) exitFocusMode(); }}>
      <Dialog.Portal>
        <div className={isDark ? 'dark' : ''}>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm" />
        <Dialog.Popup className="fixed inset-0 z-50 flex items-center justify-center p-8 outline-none">
          <div className="max-w-2xl w-full">
            <Dialog.Title className="sr-only">Focus Mode</Dialog.Title>
            <Callout padding="xl" shadow tone={"warning"} >
              <div className="flex items-start gap-4">
                <div className="w-2.5 h-2.5 rounded-full bg-orange-500 mt-2 shadow-[0_0_10px_rgba(249,115,22,0.4)]" />
                <div className="flex-1">
                  <h2 className="text-3xl font-medium tracking-tight text-foreground mb-1.5">
                    {focusTask.title}
                  </h2>
                  <div className="flex items-center gap-3 text-[10.5px] font-bold text-muted-foreground">
                    <span className="uppercase tracking-[0.1em]">{focusTask.project}</span>
                  </div>
                  {focusTask.context && (
                    <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
                      {focusTask.context}
                    </p>
                  )}
                </div>
              </div>
              <div className={cn(
                'mt-6 flex items-center gap-2 pt-5 border-t',
                isDark ? 'border-secondary' : 'border-muted'
              )}>
                <Button
                  variant="ghost"
                  size="sm"
                >
                  Complete
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                >
                  Defer
                </Button>
                <div className="flex-1" />
                <Dialog.Close
                  className="px-4 py-2 flex items-center gap-2 text-[11px] font-bold rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-500 transition-all cursor-pointer"
                >
                  <Target size={14} /> Exit Focus
                </Dialog.Close>
              </div>
            </Callout>
          </div>
        </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
