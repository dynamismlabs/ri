"use client";

import { Button } from '@/components/system/button';
import { IconButton } from '@/components/system/icon-button';
import { useState, useMemo, Fragment } from 'react';
import { GripVertical, Check, SkipForward, ChevronDown, ChevronRight, Crosshair, EyeOff, Eye, Play } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { calendarDaysUntil, formatLocalDate, parseLocalDate } from '@/lib/dates';
import { useDashboard } from '@/contexts/dashboard-context';
import { RowActionsMenu, type RowAction } from '@/components/shared/row-actions-menu';
import type { DeckItem, SubtaskItem } from '@/types/dashboard';
import { TeamLabel } from '@/components/spaces/team-label';
import { Tip } from '@/components/ui/tip';

// ─── Helpers ────────────────────────────────────────────────────

function formatDeadline(deadline?: string): string | null {
  const diffDays = calendarDaysUntil(deadline);
  if (diffDays === null) return null;

  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays <= 7) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `Due ${days[parseLocalDate(deadline)!.getDay()]}`;
  }
  return `Due ${formatLocalDate(deadline, { month: 'short', day: 'numeric' })}`;
}

/** Late or due today, the two a deadline's color calls out. */
function deadlineUrgency(deadline?: string): 'late' | 'today' | undefined {
  const diffDays = calendarDaysUntil(deadline);
  if (diffDays === null) return undefined;
  return diffDays < 0 ? 'late' : diffDays === 0 ? 'today' : undefined;
}

function isDeadlineUrgent(deadline?: string): boolean {
  const diffDays = calendarDaysUntil(deadline);
  return diffDays !== null && diffDays <= 1;
}

// ─── Pill components ────────────────────────────────────────────

function Pill({ kind, children }: { kind: 'area' | 'effort'; children: React.ReactNode }) {
  return (
    <span data-slot="meta-item" data-kind={kind} className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
      {children}
    </span>
  );
}

function DeadlinePill({ children, urgent, urgency }: { children: React.ReactNode; urgent: boolean; urgency?: 'late' | 'today' }) {
  return (
    <span
      data-slot="meta-item"
      data-kind="deadline"
      data-urgency={urgency}
      className={cn(
        'text-[10px] px-1.5 py-0.5 rounded-md font-medium',
        urgent
          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {children}
    </span>
  );
}

// ─── Subtask list ───────────────────────────────────────────────

interface SubtaskActions {
  onComplete: (subtaskId: string) => void;
  onDefer: (subtaskId: string) => void;
  onFocus?: (subtaskId: string) => void;
}

function Subtasks({ items, onCollapse, actions }: { items: SubtaskItem[]; onCollapse: () => void; actions: SubtaskActions }) {
  const [showCompleted, setShowCompleted] = useState(false);
  const completed = items.filter(s => s.completed).length;
  const visibleItems = showCompleted ? items : items.filter(s => !s.completed);

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-2 mb-1">
        <Button
          onClick={onCollapse}
          variant="ghost"
          size="xs"
          className="flex items-center gap-1"
        >
          <ChevronDown className="w-3 h-3" />
          {completed}/{items.length} subtasks
        </Button>
        {completed > 0 && (
          <Button
            onClick={() => setShowCompleted(!showCompleted)}
            variant="ghost"
            size="xs"
          >
            {showCompleted ? 'hide' : 'show'} completed
          </Button>
        )}
      </div>
      <div className="ml-4 space-y-px">
        {visibleItems.map(s => (
          <div
            key={s.id}
            className={cn(
              'group/subtask relative flex items-center gap-1 py-1 px-2 -mx-2 rounded-md transition-colors',
              s.completed
                ? 'text-muted-foreground/40'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
          >
            <span className="text-xs flex-1 min-w-0 break-words">
              {s.completed && <span className="mr-1 opacity-60">✓</span>}
              {s.title}
            </span>

            {/* Desktop hover actions */}
            {!s.completed && (
              <div data-slot="row-actions" className="hidden md:flex shrink-0 opacity-0 group-hover/subtask:opacity-100 transition-opacity items-center gap-0.5">

                  <IconButton
                    onClick={() => actions.onComplete(s.id)}
                    label="Done"
                    tooltip="Done"
                    tipSide="top"
                    variant="secondary"
                    size="xs"
                  >
                    <Check className="w-3 h-3" />
                  </IconButton>


                  <IconButton
                    onClick={() => actions.onDefer(s.id)}
                    label="Defer"
                    tooltip="Defer"
                    tipSide="top"
                    variant="secondary"
                    size="xs"
                  >
                    <SkipForward className="w-3 h-3" />
                  </IconButton>

                {actions.onFocus && (

                    <IconButton
                      onClick={() => actions.onFocus!(s.id)}
                      label="Focus"
                      tooltip="Focus"
                      tipSide="top"
                      variant="secondary"
                      size="xs"
                    >
                      <Crosshair className="w-3 h-3" />
                    </IconButton>

                )}
              </div>
            )}

            {/* Mobile overflow menu */}
            {!s.completed && (
              <RowActionsMenu
                iconSize={14}
                title="Subtask actions"
                actions={[
                  { id: 'done', label: 'Mark done', icon: Check, onClick: () => actions.onComplete(s.id) },
                  { id: 'defer', label: 'Defer', icon: SkipForward, onClick: () => actions.onDefer(s.id) },
                  ...(actions.onFocus ? [{ id: 'focus', label: 'Focus', icon: Crosshair, onClick: () => actions.onFocus!(s.id) } satisfies RowAction] : []),
                ]}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Single sortable deck item ──────────────────────────────────

function SortableDeckItemCard({
  item,
  index,
  onComplete,
  onStart,
  onNotToday,
  onFocus,
  onSubtaskComplete,
  onSubtaskDefer,
  onSubtaskFocus,
}: {
  item: DeckItem;
  index: number;
  onComplete: (id: string) => void;
  onStart?: (id: string) => void;
  onNotToday: (id: string) => void;
  onFocus?: (id: string) => void;
  onSubtaskComplete: (itemId: string, subtaskId: string) => void;
  onSubtaskDefer: (itemId: string, subtaskId: string) => void;
  onSubtaskFocus?: (itemId: string, subtaskId: string) => void;
}) {
  const { openTask } = useDashboard();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [subtasksExpanded, setSubtasksExpanded] = useState(index === 0);
  const [whyOpen, setWhyOpen] = useState(false);
  const deadline = formatDeadline(item.hardDeadline);
  const urgent = isDeadlineUrgent(item.hardDeadline);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative py-2',
        isDragging && 'z-10 opacity-80 bg-background rounded-lg shadow-lg',
      )}
      {...attributes}
    >
      {/* Drag handle — visible on hover */}
      <div
        ref={setActivatorNodeRef}
        {...listeners}
        className="absolute left-0 top-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground/30" />
      </div>

      {/* Desktop hover actions — top right */}
      <div data-slot="row-actions" className="hidden md:flex absolute right-0 top-2 opacity-0 group-hover:opacity-100 transition-opacity items-center gap-1">

          <IconButton
            onClick={() => onComplete(item.id)}
            label="Done"
            tooltip="Done"
            tipSide="top"
            variant="secondary"
            size="xs"
          >
            <Check className="w-3.5 h-3.5" />
          </IconButton>

        {onStart && (

            <IconButton
              onClick={() => onStart(item.id)}
              label="Start (move to In progress)"
              tooltip="Start (move to In progress)"
              tipSide="top"
              variant="secondary"
              size="xs"
            >
              <Play className="w-3.5 h-3.5" />
            </IconButton>

        )}

          <IconButton
            onClick={() => onNotToday(item.id)}
            label="Not today"
            tooltip="Not today"
            tipSide="top"
            variant="secondary"
            size="xs"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </IconButton>

        {onFocus && (

            <IconButton
              onClick={() => onFocus(item.id)}
              label="Focus"
              tooltip="Focus"
              tipSide="top"
              variant="secondary"
              size="xs"
            >
              <Crosshair className="w-3.5 h-3.5" />
            </IconButton>

        )}
      </div>

      {/* Mobile overflow menu — top right */}
      <div className="absolute right-0 top-2">
        <RowActionsMenu
          title="Task actions"
          actions={[
            { id: 'done', label: 'Mark done', icon: Check, onClick: () => onComplete(item.id) },
            ...(onStart ? [{ id: 'start', label: 'Start', icon: Play, onClick: () => onStart(item.id) } satisfies RowAction] : []),
            { id: 'not-today', label: 'Not today', icon: SkipForward, onClick: () => onNotToday(item.id) },
            ...(onFocus ? [{ id: 'focus', label: 'Focus', icon: Crosshair, onClick: () => onFocus(item.id) } satisfies RowAction] : []),
          ]}
        />
      </div>

      <div className="pl-6 pr-20 min-w-0 overflow-hidden">
        {/* Title */}
        <button
          onClick={() => openTask(item.taskId)}
          className="text-sm font-medium leading-snug text-left hover:text-primary transition-colors max-w-full break-words"
        >
          {item.parentTitle && (
            <span className="text-muted-foreground font-normal">{item.parentTitle} · </span>
          )}
          {item.title}
        </button>

        {/* Pills */}
        <div data-slot="meta" className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {item.manuallyAdded && (
            <span data-slot="meta-item" data-kind="added" className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium">
              You added
            </span>
          )}
          <TeamLabel teamId={item.sourceTeamId} sourceArea={item.sourceArea} />
          {item.areaName && <Pill kind="area">{item.areaName}</Pill>}
          {item.effort && <Pill kind="effort">{item.effort}</Pill>}
          {deadline && <DeadlinePill urgent={urgent} urgency={deadlineUrgency(item.hardDeadline)}>{deadline}</DeadlinePill>}
        </div>

        {/* Reasoning — the "why this, why now" plus any "last session" note.
            One muted line so it's a glimpse, not a wall; click to expand. The
            same treatment on every card: no item gets extra text for being first. */}
        {(item.rationale || item.continuityContext) && (
          <Tip label={whyOpen ? 'Hide reasoning' : 'Show reasoning'}>
            <button
              type="button"
              onClick={() => setWhyOpen((v) => !v)}
              className={cn(
                'mt-2 block max-w-full break-words text-left text-xs leading-relaxed text-muted-foreground/70 transition-colors hover:text-muted-foreground',
                !whyOpen && 'line-clamp-1',
              )}
            >
              {item.rationale || item.continuityContext}
              {whyOpen && item.rationale && item.continuityContext && (
                <span className="mt-1 block">{item.continuityContext}</span>
              )}
            </button>
          </Tip>
        )}

        {/* Subtasks */}
        {item.subtasks && item.subtasks.length > 0 && (
          subtasksExpanded ? (
            <Subtasks
              items={item.subtasks}
              onCollapse={() => setSubtasksExpanded(false)}
              actions={{
                onComplete: (subtaskId) => onSubtaskComplete(item.id, subtaskId),
                onDefer: (subtaskId) => onSubtaskDefer(item.id, subtaskId),
                onFocus: onSubtaskFocus ? (subtaskId) => onSubtaskFocus(item.id, subtaskId) : undefined,
              }}
            />
          ) : (
            <Button
              onClick={() => setSubtasksExpanded(true)}
              variant="ghost"
              size="xs"
              className="flex items-center gap-1 mt-2"
            >
              <ChevronRight className="w-3 h-3" />
              {item.subtasks.filter(s => s.completed).length}/{item.subtasks.length} subtasks
            </Button>
          )
        )}
      </div>
    </div>
  );
}

// ─── Main DeckStack ─────────────────────────────────────────────

interface DeckStackProps {
  items: DeckItem[];
  onComplete: (id: string) => void;
  onStart?: (id: string) => void;
  onNotToday: (id: string) => void;
  onFocus?: (id: string) => void;
  onReorder: (items: DeckItem[]) => void;
  onSubtaskComplete: (itemId: string, subtaskId: string) => void;
  onSubtaskDefer: (itemId: string, subtaskId: string) => void;
  onSubtaskFocus?: (itemId: string, subtaskId: string) => void;
}

export function DeckStack({ items, onComplete, onStart, onNotToday, onFocus, onReorder, onSubtaskComplete, onSubtaskDefer, onSubtaskFocus }: DeckStackProps) {
  const [hideBelowIndex, setHideBelowIndex] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const itemIds = useMemo(() => items.map(i => i.id), [items]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  const isHidden = hideBelowIndex !== null;
  const hiddenCount = isHidden ? items.length - hideBelowIndex - 1 : 0;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div>
          {items.map((item, i) => {
            // If hidden, only show items up to hideBelowIndex
            if (isHidden && i > hideBelowIndex) return null;

            const isFirst = i === 0;
            const isLast = i === items.length - 1;
            // Show divider after this item (not after the last item)
            const showDivider = !isLast;
            // Always visible after item 0, hover-visible for others
            const alwaysVisible = isFirst;
            // This is the active hide point
            const isActiveHidePoint = hideBelowIndex === i;

            return (
              <Fragment key={item.id}>
                <SortableDeckItemCard
                  item={item}
                  index={i}
                  onComplete={onComplete}
                  onStart={onStart}
                  onNotToday={onNotToday}
                  onFocus={onFocus}
                  onSubtaskComplete={onSubtaskComplete}
                  onSubtaskDefer={onSubtaskDefer}
                  onSubtaskFocus={onSubtaskFocus}
                />
                {showDivider && (
                  <button
                    onClick={() => setHideBelowIndex(isActiveHidePoint ? null : i)}
                    className={cn(
                      'w-full flex items-center gap-2 py-1 group/divider transition-opacity',
                      alwaysVisible || isActiveHidePoint
                        ? 'opacity-100'
                        : 'opacity-0 hover:opacity-100',
                    )}
                  >
                    <div className="flex-1 h-px bg-border/50" />
                    <span className="flex items-center gap-1 text-[9px] leading-none text-muted-foreground/40 group-hover/divider:text-muted-foreground/60 transition-colors shrink-0">
                      {isActiveHidePoint ? (
                        <>
                          <Eye className="w-3 h-3" />
                          Show {hiddenCount} more
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3 h-3" />
                          Hide items below
                        </>
                      )}
                    </span>
                    <div className="flex-1 h-px bg-border/50" />
                  </button>
                )}
              </Fragment>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
