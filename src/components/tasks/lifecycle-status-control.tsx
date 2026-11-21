'use client';
import { MenuAction } from '@/components/system/menu-action';

import { MetaItem } from '@/components/system/meta';
import type { ContentTone } from '@/components/system/callout';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from '@/components/ui/dropdown-menu';
import { useTaskLifecycle } from '@/hooks/use-task-lifecycle';
import {
  availableCommands,
  TASK_STATUS_LABELS,
  transitionLabel,
  type LifecycleCommand,
  type TaskStatus,
} from '@/lib/tasks/lifecycle';

/** Consistent status color across every surface. */
export const STATUS_COLOR: Record<TaskStatus, string> = {
  consider: 'text-status-consider', todo: 'text-status-todo', in_progress: 'text-status-progress', done: 'text-status-done', archived: 'text-t3',
};
const STATUS_TONE: Record<TaskStatus, ContentTone> = {
  consider: 'status-consider', todo: 'status-todo', in_progress: 'status-progress', done: 'status-done', archived: 'neutral',
};

/**
 * The one editable lifecycle status control, shared by list rows, task detail,
 * the slideout, linked-task context, and the Kanban card. It shows the current
 * status and offers ONLY the valid destinations from here, each invoking a
 * semantic lifecycle command (never a raw status write). Keyboard and screen
 * reader come free from the Radix dropdown.
 */
export function LifecycleStatusControl({
  taskId,
  status,
  className,
}: {
  taskId: string;
  status: TaskStatus;
  className?: string;
  size?: 'sm' | 'xs';
}) {
  const lc = useTaskLifecycle();

  const dispatch = (cmd: LifecycleCommand) => {
    switch (cmd) {
      case 'complete': return lc.complete(taskId);
      case 'start': return lc.start(taskId);
      case 'move_to_todo': return lc.moveToTodo(taskId);
      case 'move_to_consider': return lc.moveToConsider(taskId);
      case 'return_to_todo': return lc.returnToTodo(taskId);
      case 'archive': return lc.archive(taskId);
      case 'reopen': return lc.reopen(taskId);
      case 'restore': return lc.restore(taskId);
    }
  };

  const commands = availableCommands(status);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MetaItem as="button" type="button" kind="status" tone={STATUS_TONE[status]} className={className}
          aria-label={`Task status: ${TASK_STATUS_LABELS[status]}. Change status.`}>
          {TASK_STATUS_LABELS[status]}<ChevronDown aria-hidden />
        </MetaItem>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        {commands.length === 0 ? (
          <MenuAction kind="menu" disabled >No actions available</MenuAction>
        ) : (
          commands.map((cmd) => (
            <MenuAction kind="menu" key={cmd}  onSelect={() => dispatch(cmd)}>
              {transitionLabel(cmd)}
            </MenuAction>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
