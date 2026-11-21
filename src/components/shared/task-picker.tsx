"use client";
import { MenuAction } from '@/components/system/menu-action';

import { MetaItem } from '@/components/system/meta';
import { useViewportTier } from '@/hooks/use-viewport-tier';

import { Field } from '@/components/system/field';

import { useState } from 'react';
import { Search, Target, X } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useTasks } from '@/hooks/use-tasks';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/tip';

interface TaskPickerProps {
  value: string | null;
  onChange: (taskId: string | null) => void;
  className?: string;
}

export function TaskPicker({ value, onChange, className }: TaskPickerProps) {
  const compactFieldSize = useViewportTier() === 'phone' ? 'touch' : 'sm';

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: tasks } = useTasks({
    status: 'active',
    q: search || undefined,
    limit: 20,
  });

  const { data: linkedTask } = useTasks(
    value ? { status: ['active', 'done'], limit: 1 } : undefined,
  );

  const linkedTitle = linkedTask?.find(t => t.id === value)?.title;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(''); }}>
      <PopoverTrigger asChild>
        <Tip label={value ? `Linked to: ${linkedTitle ?? 'task'}` : 'Link to task'}>
          <MetaItem as="button" kind="task" type="button" className={className} onClick={(e) => e.stopPropagation()}>
            <Target aria-hidden />{value ? 'Linked' : 'Link'}
          </MetaItem>
        </Tip>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 border-b border-border">
          <Field
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className={'flex-1'}
            onClick={(e) => e.stopPropagation()}
            leading={<Search />}
            aria-label={'Search tasks'}
            size={compactFieldSize}
          />
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {value && (
            <MenuAction density="compact"
              onClick={(e) => { e.stopPropagation(); onChange(null); setOpen(false); }}
              className="w-full text-left flex items-center gap-1.5"
            >
              <X size={10} /> Unlink
            </MenuAction>
          )}
          {tasks?.map(task => (
            <MenuAction selected={!!((task.id === value))} density="compact"
              key={task.id}
              onClick={(e) => { e.stopPropagation(); onChange(task.id); setOpen(false); }}
              className={cn("w-full text-left flex items-center gap-1.5 line-clamp-1", task.id === value && "")}
            >
              <Target size={10} className="flex-shrink-0" />
              <span className="truncate">{task.title}</span>
            </MenuAction>
          ))}
          {tasks && tasks.length === 0 && (
            <p className="px-2 py-3 text-[10px] text-muted-foreground text-center">No tasks found</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
