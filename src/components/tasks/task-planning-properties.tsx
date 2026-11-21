'use client';

import { SegmentedControl } from '@/components/system/segmented-control';

import type { TaskRecord, UpdateTaskInput } from '@/db/types';
import { ENERGY_OPTIONS, EFFORT_OPTIONS } from './task-options';
import { TaskPriority } from './task-priority';
import { TaskDateField } from './task-date-field';

/** Private planning uses the same controls on personal and referenced work. */
export function TaskPlanningProperties({ task, save }: { task: TaskRecord; save: (patch: UpdateTaskInput) => void }) {
  return <>
    <span className="font-medium text-muted-foreground">Energy</span>
    <SegmentedControl mode="choice" allowEmpty ariaLabel="Energy" value={task.energy} onChange={energy => save({energy})} options={ENERGY_OPTIONS.map(option => ({value:option.value,label:option.label,icon:<option.icon/>}))} />
    <span className="font-medium text-muted-foreground">Effort</span>
    <SegmentedControl mode="choice" allowEmpty ariaLabel="Effort" value={task.effort} onChange={effort => save({effort})} options={EFFORT_OPTIONS} />
    <span className="font-medium text-muted-foreground">Priority</span><TaskPriority taskId={task.id} status={task.status}/>
    <span className="font-medium text-muted-foreground">Snooze until</span><TaskDateField label="Snooze until" value={task.resurfaceAfter} onChange={resurfaceAfter => save({ resurfaceAfter })}/>
  </>;
}
