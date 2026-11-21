'use client';
import { MenuAction } from '@/components/system/menu-action';

import { MetaItem, Meta } from '@/components/system/meta';
import { ChoiceRow } from '@/components/system/choice-row';

import { Field } from '@/components/system/field';

import { IconButton } from '@/components/system/icon-button';
import { Button } from '@/components/system/button';
import { useOptionalHomeContext } from '@/components/home/home-context';
import { useSpace } from '@/components/spaces/space-root';
import { homeResourceHref } from '@/lib/home/resource-href';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { TeamLabel } from '@/components/spaces/team-label';
import {
  Check, Clock, Repeat, Lock,
  MoreHorizontal, Archive, Timer, GripVertical,
  Zap, Flame, ShieldAlert, AlignLeft, ListTree, ArrowUpDown,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { BUCKET_OPTIONS, type Bucket } from '@/lib/utils/bucket-placement';
import { Popover, PopoverTrigger, PopoverContent, PopoverClose } from '@/components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { AreaSelect } from '@/components/shared/area-select';
import { LifecycleStatusControl } from '@/components/tasks/lifecycle-status-control';
import { TaskBadges } from '@/components/tasks/task-badges';
import { cn } from '@/lib/utils';
import { calendarDaysUntil, describeLocalDate, formatLocalDate, isPastDate, toDateOnly } from '@/lib/dates';
import { TaskDatePicker } from './task-date-field';
import { TaskRecurrencePicker } from './task-recurrence-picker';
import { isRestingUntilNext, recurrenceHasDetail, recurrenceLabel } from '@/lib/tasks/recurrence';
import type { Energy, Effort, TaskAttentionSignals } from '@/db/types';
import type { TaskListDTO } from '@/lib/api/dto/entity-list';
import { Tip } from '@/components/ui/tip';

const ENERGY_ICONS: Record<string, typeof Flame> = {
  deep: Flame,
  light: Zap,
};

const EFFORT_LABELS: Record<string, string> = {
  trivial: 'XS',
  small: 'S',
  medium: 'M',
  large: 'L',
  epic: 'XL',
};

const ENERGY_CYCLE: (Energy | null)[] = ['deep', 'light', null];
const EFFORT_CYCLE: (Effort | null)[] = ['trivial', 'small', 'medium', 'large', 'epic', null];

function formatDate(iso: string | null): string | null {
  const days = calendarDaysUntil(iso);
  if (days === null) return null;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 0 && days <= 7) return `In ${days}d`;
  if (days < 0 && days >= -7) return `${Math.abs(days)}d ago`;
  // Another year's date says so: a yearly task's "Nov 16" next year would read as today.
  const sameYear = toDateOnly(iso)?.startsWith(String(new Date().getFullYear()));
  return formatLocalDate(iso, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

interface TaskRowProps {
  privatePlanning?: boolean;
  contextMeta?: ReactNode;
  task: TaskListDTO;
  onComplete: (id: string) => void;
  onUpdate: (id: string, field: string, value: unknown) => void;
  onSnooze: (id: string, days: number) => void;
  onArchive: (id: string) => void;
  onOpen?: (id: string) => void;
  dragEnabled?: boolean;
  isHighlighted?: boolean;
  onDragIntercept?: (id: string) => void;
  onPickBucket?: (id: string, bucket: Bucket) => void;
  /** Derived attention badges, supplied for In-progress rows. */
  signals?: TaskAttentionSignals | null;
}

export function TaskRow({
  task, onComplete, onUpdate, onSnooze, onArchive, onOpen,
  dragEnabled = true, isHighlighted = false, onDragIntercept, onPickBucket, signals, privatePlanning = true, contextMeta,
}: TaskRowProps) {
  const home = useOptionalHomeContext();
  const space = useSpace();
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [editingRecurrence, setEditingRecurrence] = useState(false);
  const [blockPopoverOpen, setBlockPopoverOpen] = useState(false);
  const afterMenu = useRef<(() => void) | null>(null);
  const blockInputRef = useRef<HTMLInputElement>(null);
  const isDone = task.status === 'done';

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  // Mobile: long-press on the row drags. Desktop: drag from the handle only.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const deadline = formatDate(task.hardDeadline);
  const boomerang = formatDate(task.resurfaceAfter);
  // A repeat is private planning on personal work: a team's task carries none.
  const canRepeat = privatePlanning && !task.sourceTeamId && task.status !== 'consider';
  const repeat = recurrenceLabel(task.recurrence);
  const resting = isRestingUntilNext(task);
  const nextOne = resting ? `Next one ${describeLocalDate(task.nextRecurrenceAt)}` : null;
  const repeatTip = [
    // Resting means done for now or not started yet: the date is true of both.
    nextOne,
    recurrenceHasDetail(task.recurrence) ? `Saved as “${task.recurrence}”` : null,
  ].filter(Boolean).join('. ');
  const repeatChip = (
    <MetaItem as="button"
      onClick={(e) => e.stopPropagation()}
      aria-label={repeat ? `Repeats ${repeat.toLowerCase()}${nextOne ? `. ${nextOne}` : ''}` : 'Repeat'}

      kind="repeat"
      className="inline-flex items-center gap-0.5"
    >
      <Repeat size={8} /> {repeat ?? 'Repeat'}{resting && <> · {formatDate(task.nextRecurrenceAt)}</>}
    </MetaItem>
  );

  const cycleEnergy = () => {
    const idx = ENERGY_CYCLE.indexOf(task.energy);
    const next = ENERGY_CYCLE[(idx + 1) % ENERGY_CYCLE.length];
    onUpdate(task.id, 'energy', next);
  };

  const cycleEffort = () => {
    const idx = EFFORT_CYCLE.indexOf(task.effort);
    const next = EFFORT_CYCLE[(idx + 1) % EFFORT_CYCLE.length];
    onUpdate(task.id, 'effort', next);
  };

  const EnergyIcon = task.energy ? ENERGY_ICONS[task.energy] : null;

  return (
    <ChoiceRow asChild density="list" surface="plain" selected={isHighlighted}><div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(isMobile && dragEnabled ? listeners : {})}
      className={cn("group flex items-start gap-1.5 cursor-pointer", isDragging && "opacity-50", isDone && "opacity-50")}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) {
          window.open(homeResourceHref('task', task.id, { kind: home?.home.kind ?? 'personal', spaceId: space?.id }), '_blank')
        } else {
          onOpen?.(task.id)
        }
      }}
    >
      {/* Drag handle — desktop only. When drag is disabled (non-AI sort), pointerdown
          intercepts and asks the list to switch sort instead of starting a drag. */}
      <button
        {...(!isMobile && dragEnabled ? listeners : {})}
        className={cn(
          'hidden md:block mt-1 p-0.5 opacity-0 group-hover:opacity-40 hover:!opacity-100 text-muted-foreground transition-opacity',
          dragEnabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        )}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={dragEnabled ? undefined : (e) => {
          e.stopPropagation();
          onDragIntercept?.(task.id);
        }}
      >
        <GripVertical size={12} />
      </button>

      {/* Completion control — only where completing/reopening is the real
          action. Consider is not committed work (commit it via the status
          control), and Archived is history, so neither shows a checkbox that
          would silently do nothing or quietly restore. */}
      {task.status === 'consider' || task.status === 'archived' ? (
        <Tip label={task.status === 'consider' ? 'Consider, commit it with the status control' : 'Archived'}>
          <span
            className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border border-dashed border-muted-foreground/30"
            aria-hidden
          />
        </Tip>
      ) : (
        <Tip label={isDone ? 'Reopen' : 'Complete'}>
          <button data-slot="completion-control"
            onClick={(e) => { e.stopPropagation(); onComplete(task.id); }}
            aria-label={isDone ? 'Reopen task' : 'Complete task'}
            className={cn(
              'mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-all',
              isDone
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-muted-foreground/40 hover:border-primary hover:bg-primary/10',
            )}
          >
            {isDone && <Check size={10} strokeWidth={3} />}
          </button>
        </Tip>
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className={cn(
          'text-[12px] font-medium leading-tight line-clamp-2',
          isDone && 'line-through text-muted-foreground',
        )}>
          {task.title}
        </p>

        {/* Metadata row */}
        <Meta className="mt-1 flex items-center gap-1.5 flex-wrap">
          {/* Editable lifecycle status */}
          <MetaItem kind="status" onClick={(e) => e.stopPropagation()}>
            <LifecycleStatusControl taskId={task.id} status={task.status} size="xs" />
          </MetaItem>
          <TeamLabel teamId={task.sourceTeamId} sourceArea={task.source?.area} />

          {/* Derived attention badges (In progress) */}
          <TaskBadges signals={signals} size="xs" />

          {/* Area */}
          <AreaSelect
            value={task.areaId}
            onChange={(areaId) => onUpdate(task.id, 'areaId', areaId)}
          />

          {contextMeta}
          {privatePlanning && <>
          {/* Energy pill */}
          <Tip label={`Energy: ${task.energy ?? 'unset'} (click to cycle)`}>
            <MetaItem as="button"
              onClick={(e) => { e.stopPropagation(); cycleEnergy(); }}

              kind="energy" energy={task.energy ?? undefined}
              className="inline-flex items-center gap-0.5"
            >
              {EnergyIcon && <EnergyIcon size={8} />}
              {task.energy ?? '~'}
            </MetaItem>
          </Tip>

          {/* Effort pill */}
          {(task.effort || false) && (
            <Tip label={`Effort: ${task.effort} (click to cycle)`}>
              <MetaItem as="button"
                onClick={(e) => { e.stopPropagation(); cycleEffort(); }}

                kind="effort"
                className="inline-flex items-center"
              >
                {EFFORT_LABELS[task.effort!] ?? task.effort}
              </MetaItem>
            </Tip>
          )}

          </>}
          {/* Deadline */}
          {(deadline || editingDeadline) && (
            <TaskDatePicker
              label="Deadline"
              value={task.hardDeadline}
              open={editingDeadline}
              onOpenChange={setEditingDeadline}
              onChange={(date) => onUpdate(task.id, 'hardDeadline', date)}
            >
              <MetaItem as="button"
                onClick={(e) => e.stopPropagation()}

                kind="deadline"
                urgency={isPastDate(task.hardDeadline) ? 'late' : undefined}
                className="inline-flex items-center gap-0.5"
              >
                <Clock size={8} /> {deadline ?? 'Deadline'}
              </MetaItem>
            </TaskDatePicker>
          )}

          {/* Boomerang */}
          {boomerang && (
            <TaskDatePicker
              label="Snooze until"
              value={task.resurfaceAfter}
              onChange={(date) => onUpdate(task.id, 'resurfaceAfter', date)}
            >
              <Tip label="Click to edit resurface date">
                <MetaItem as="button"
                  onClick={(e) => e.stopPropagation()}

                  kind="snooze"
                  className="inline-flex items-center gap-0.5"
                >
                  <Timer size={8} /> {boomerang}
                </MetaItem>
              </Tip>
            </TaskDatePicker>
          )}

          {/* Recurrence. Waiting for its next occurrence, it says when. */}
          {(task.recurrence || editingRecurrence) && (canRepeat ? (
            <TaskRecurrencePicker
              value={task.recurrence}
              open={editingRecurrence}
              onOpenChange={setEditingRecurrence}
              onChange={(recurrence) => onUpdate(task.id, 'recurrence', recurrence)}
            >
              {repeatTip ? <Tip label={repeatTip}>{repeatChip}</Tip> : repeatChip}
            </TaskRecurrencePicker>
          ) : (
            <MetaItem kind="repeat" className="inline-flex items-center gap-0.5">
              <Repeat size={8} /> {repeat}{resting && <> · {formatDate(task.nextRecurrenceAt)}</>}
            </MetaItem>
          ))}

          {/* Blocked */}
          {task.blockedOn && (
            <MetaItem tone="warning"  kind="blocked" className="inline-flex items-center gap-0.5">
              <Lock size={8} /> Blocked
            </MetaItem>
          )}

          {/* Has body */}
          {task.bodyLen > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <MetaItem kind="body" className="inline-flex items-center">
                  <AlignLeft size={8} />
                </MetaItem>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[300px] whitespace-pre-wrap text-xs leading-relaxed line-clamp-5">
                {task.bodyExcerpt}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Has subtasks */}
          {task.subtaskCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <MetaItem kind="subtasks" className="inline-flex items-center gap-0.5">
                  <ListTree size={8} /> {task.subtaskCount}
                </MetaItem>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="block max-w-[280px] text-xs">
                <p className="font-semibold mb-1">{task.subtaskCount} subtask{task.subtaskCount === 1 ? '' : 's'}</p>
                <ul className="space-y-0.5">
                  {task.subtaskPreview?.split('|||').map((title, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="mt-1.5 w-1 h-1 rounded-full bg-current flex-shrink-0" />
                      <span className="line-clamp-1">{title}</span>
                    </li>
                  ))}
                </ul>
                {task.subtaskCount > 4 && (
                  <p className="mt-1 text-[10px] opacity-70">+{task.subtaskCount - 4} more</p>
                )}
              </TooltipContent>
            </Tooltip>
          )}
        </Meta>
      </div>

      {/* Hover actions */}
      <div data-slot="row-actions" className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              onClick={(e) => e.stopPropagation()}
              label="More task actions"
              variant="ghost"
              size="xs"
              focus="inside"
            >
              <MoreHorizontal size={14} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40"
            // A choice in the menu reaches the row through React's portal bubbling, and the row opens the task.
            onClick={(e) => e.stopPropagation()}
            // A popover waits for the menu to go. A closing menu moves focus, which the popover would take for leaving.
            onCloseAutoFocus={(e) => {
              if (!afterMenu.current) return;
              e.preventDefault();
              afterMenu.current();
              afterMenu.current = null;
            }}
          >
            {onPickBucket && (
              <>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="text-xs">
                    <ArrowUpDown size={12} className="mr-2" /> Priority
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-32">
                    {BUCKET_OPTIONS.map(opt => (
                      <MenuAction kind="menu"
                        key={opt.value}
                        onClick={(e) => {
                          e.stopPropagation();
                          onPickBucket(task.id, opt.value);
                        }}

                      >
                        {opt.label}
                      </MenuAction>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
              </>
            )}
            {privatePlanning && <>
            <MenuAction kind="menu" onClick={() => onSnooze(task.id, 1)} >
              <Timer size={12} className="mr-2" /> Snooze 1 day
            </MenuAction>
            <MenuAction kind="menu" onClick={() => onSnooze(task.id, 3)} >
              <Timer size={12} className="mr-2" /> Snooze 3 days
            </MenuAction>
            <MenuAction kind="menu" onClick={() => onSnooze(task.id, 7)} >
              <Timer size={12} className="mr-2" /> Snooze 1 week
            </MenuAction>
            <DropdownMenuSeparator />
            {!task.effort && (
              <MenuAction kind="menu" onClick={() => cycleEffort()} >
                Set effort
              </MenuAction>
            )}
            </>}
            {!task.hardDeadline && (
              <MenuAction kind="menu" onClick={() => { afterMenu.current = () => setEditingDeadline(true); }} >
                <Clock size={12} className="mr-2" /> Set deadline
              </MenuAction>
            )}
            {canRepeat && !task.recurrence && task.status !== 'done' && task.status !== 'archived' && (
              <MenuAction kind="menu" onClick={() => { afterMenu.current = () => setEditingRecurrence(true); }} >
                <Repeat size={12} className="mr-2" /> Repeat
              </MenuAction>
            )}
            {privatePlanning && !task.blockedOn && (
              <MenuAction kind="menu"
                onClick={() => { afterMenu.current = () => setBlockPopoverOpen(true); }}

              >
                <Lock size={12} className="mr-2" /> Block
              </MenuAction>
            )}
            {privatePlanning && task.blockedOn && (
              <MenuAction kind="menu"
                onClick={() => {
                  onUpdate(task.id, 'blockedOn', null);
                  onUpdate(task.id, 'blockedSince', null);
                }}

              >
                <ShieldAlert size={12} className="mr-2" /> Unblock
              </MenuAction>
            )}
            <DropdownMenuSeparator />
            <MenuAction tone="error" kind="menu"
              onClick={() => onArchive(task.id)}

            >
              <Archive size={12} className="mr-2" /> Archive
            </MenuAction>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Block popover */}
        <Popover open={blockPopoverOpen} onOpenChange={setBlockPopoverOpen}>
          <PopoverTrigger asChild>
            <span />
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="end">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Blocked on</p>
            <form onSubmit={(e) => {
              e.preventDefault();
              const val = blockInputRef.current?.value.trim();
              if (val) {
                onUpdate(task.id, 'blockedOn', val);
                onUpdate(task.id, 'blockedSince', new Date().toISOString());
              }
              setBlockPopoverOpen(false);
            }}>
              <Field
                ref={blockInputRef}
                type="text"
                autoFocus
                placeholder="e.g. waiting on design review"
                className="w-full"
                aria-label={'Block reason'}
              />
              <div className="flex justify-end gap-1 mt-1.5">
                <PopoverClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                  >Cancel</Button>
                </PopoverClose>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                >Block</Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
      </div>
    </div></ChoiceRow>
  );
}
