'use client';
import { Button } from '@/components/system/button';

import { useWorkNavigation } from '@/contexts/work-context';
import { trpc } from '@/lib/trpc/client';

import { useQuery } from '@tanstack/react-query';
import { ListTodo } from 'lucide-react';
import { Tip } from '@/components/ui/tip';

/**
 * "Working on" — the tasks an execution is associated with, shown in the header
 * so the link is obvious the moment the workstream opens. An execution can work
 * SEVERAL tasks (the many-to-many model), so this lists each non-terminal one as
 * a clickable chip. Taskless quick work, or an execution whose tasks are all
 * finished, shows nothing.
 */
export function ExecutionTaskChips({ executionId }: { executionId: string }) {
  const { openTask } = useWorkNavigation();
  const { data } = useQuery({
    ...trpc.executions.tasksGet.queryOptions({ params: { id: executionId } }),
    staleTime: 10_000,
    refetchInterval: 20_000,
  });

  const active = (data ?? []).filter((t) => t.status !== 'done' && t.status !== 'archived');
  if (active.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 px-2 pb-1.5 pt-0.5">
      <span data-slot="task-chip-label" className="inline-flex flex-shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        <ListTodo size={11} aria-hidden />
        {active.length > 1 ? 'Working on' : 'Task'}
      </span>
      {active.map((t) => (
        <Tip key={t.id} label={t.title || 'Untitled'} onlyWhenTextHidden>
          <Button variant="secondary" size="xs"
            onClick={() => openTask(t.id)}

            data-status={t.status}
            className="inline-flex max-w-[16rem] items-center gap-1"
          >
              {t.status === 'in_progress' && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-working" />}
            <span className="truncate">{t.title || 'Untitled'}</span>
          </Button>
        </Tip>
      ))}
    </div>
  );
}
