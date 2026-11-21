"use client";

import { SegmentedControl } from '@/components/system/segmented-control';

import { ChipButton } from '@/components/system/chip-button';
import { IconButton } from '@/components/system/icon-button';
import { TeamLabel } from '@/components/spaces/team-label';
import { useState, useMemo } from 'react';
import { Search, Plus, Check, Minus, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/dates';
import { useTasks } from '@/hooks/use-tasks';
import { useAreas } from '@/hooks/use-areas';
import { isClientReadyTodo } from '@/lib/deck/client-ready';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type { TaskListDTO } from '@/lib/api/dto/entity-list';

const EFFORT_SHORT: Record<string, string> = {
  trivial: 'XS',
  small: 'S',
  medium: 'M',
  large: 'L',
  epic: 'XL',
};

interface DeckTaskBrowserProps {
  /** IDs of tasks already on the deck (shown as disabled) */
  deckTaskIds: Set<string>;
  onAddToDeck: (task: TaskListDTO) => void;
  onRemoveFromDeck?: (taskId: string) => void;
  onClose: () => void;
}

export function DeckTaskBrowser({ deckTaskIds, onAddToDeck, onRemoveFromDeck, onClose }: DeckTaskBrowserProps) {
  const [query, setQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [energyFilter, setEnergyFilter] = useState<'deep' | 'light' | null>(null);
  const [sortBy, setSortBy] = useState<'default' | 'newest' | 'deadline'>('default');

  const { data: tasks } = useTasks({ status: 'active', limit: 100 });
  const { data: areas } = useAreas();

  const selectedArea = areas?.find(a => a.id === areaFilter);

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];

    // Only Ready Todo tasks can be added to the Deck (same shared predicate as
    // generation): top-level, Todo, unblocked, not deferred, not future-recurring.
    let result = tasks.filter(t => !t.parentId && isClientReadyTodo(t));

    if (query) {
      const q = query.toLowerCase();
      result = result.filter(t => t.title.toLowerCase().includes(q));
    }

    if (areaFilter) {
      result = result.filter(t => t.areaId === areaFilter);
    }

    if (energyFilter) {
      result = result.filter(t => t.energy === energyFilter);
    }

    if (sortBy === 'newest') {
      result = [...result].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } else if (sortBy === 'deadline') {
      result = [...result].sort((a, b) => {
        if (!a.hardDeadline && !b.hardDeadline) return 0;
        if (!a.hardDeadline) return 1;
        if (!b.hardDeadline) return -1;
        return parseLocalDate(a.hardDeadline)!.getTime() - parseLocalDate(b.hardDeadline)!.getTime();
      });
    }

    return result;
  }, [tasks, query, areaFilter, energyFilter, sortBy]);

  const areaMap = useMemo(() => {
    const m = new Map<string, string>();
    areas?.forEach(a => m.set(a.id, a.name));
    return m;
  }, [areas]);

  return (
    <div className="border-t border-border flex flex-col" style={{ height: '50%' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        {/* Search */}
        <div className="flex items-center gap-1.5 flex-1 bg-muted/50 rounded-md px-2 py-1">
          <Search className="w-3 h-3 text-muted-foreground/50 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tasks..."
            className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 outline-none w-full"
            autoFocus
          />
        </div>

        {/* Energy toggle */}
        <SegmentedControl mode="choice" allowEmpty ariaLabel="Energy" value={energyFilter} onChange={setEnergyFilter} options={[{value:'light',label:'Light'},{value:'deep',label:'Deep'}]} />

        {/* Area filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ChipButton
              variant="secondary"
              size="compact"
              className="flex items-center gap-1 shrink-0"
            >
              {selectedArea ? selectedArea.name : 'All'}
              <ChevronDown size={8} className="text-muted-foreground/50" />
            </ChipButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => setAreaFilter(null)} className={cn('text-xs', !areaFilter && 'font-bold')}>
              All areas
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {areas?.map(area => (
              <DropdownMenuItem
                key={area.id}
                onClick={() => setAreaFilter(area.id)}
                className={cn('text-xs', area.id === areaFilter && 'font-bold')}
              >
                {area.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ChipButton
              variant="secondary"
              size="compact"
              className="flex items-center gap-1 shrink-0"
            >
              {sortBy === 'default' ? 'Priority' : sortBy === 'newest' ? 'Newest' : 'Deadline'}
              <ChevronDown size={8} className="text-muted-foreground/50" />
            </ChipButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-28">
            <DropdownMenuItem onClick={() => setSortBy('default')} className={cn('text-xs', sortBy === 'default' && 'font-bold')}>
              Priority
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('newest')} className={cn('text-xs', sortBy === 'newest' && 'font-bold')}>
              Newest
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('deadline')} className={cn('text-xs', sortBy === 'deadline' && 'font-bold')}>
              Deadline
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Close */}
        <IconButton
          onClick={onClose}
          label="Close task browser"
          variant="ghost"
          size="xs"
          focus="inside"
        >
          <X className="w-3.5 h-3.5" />
        </IconButton>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {filteredTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground/40 px-3 py-4 text-center">No tasks found</p>
        ) : (
          filteredTasks.map(task => {
            const onDeck = deckTaskIds.has(task.id);
            return (
              <div
                key={task.id}
                className={cn(
                  'group/task flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 transition-colors',
                )}
              >
                {onDeck ? (
                  <IconButton
                    onClick={() => onRemoveFromDeck?.(task.id)}
                    label="Remove from deck"
                    variant="ghost"
                    size="xs"
                    focus="inside"
                    className="shrink-0"
                  >
                    {/* Mobile: always show minus. Desktop: check that swaps to minus on hover */}
                    <Check className="w-3.5 h-3.5 hidden md:block md:group-hover/task:hidden" />
                    <Minus className="w-3.5 h-3.5 md:hidden md:group-hover/task:block" />
                  </IconButton>
                ) : (
                  <IconButton
                    onClick={() => onAddToDeck(task)}
                    label="Add to deck"
                    variant="ghost"
                    size="xs"
                    focus="inside"
                    className="shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </IconButton>
                )}
                <span className={cn(
                  'text-xs truncate flex-1',
                  onDeck ? 'text-muted-foreground/50' : 'text-foreground',
                )}>
                  {task.title}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <TeamLabel teamId={task.sourceTeamId} sourceArea={task.source?.area} />
                  {task.areaId && areaMap.get(task.areaId) && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-muted/80 text-muted-foreground/70">
                      {areaMap.get(task.areaId)}
                    </span>
                  )}
                  {task.effort && (
                    <span className="text-[9px] text-muted-foreground/50">
                      {EFFORT_SHORT[task.effort] ?? task.effort}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
