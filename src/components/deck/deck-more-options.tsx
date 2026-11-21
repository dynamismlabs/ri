"use client";
import { MenuAction } from '@/components/system/menu-action';

import { StatusBadge } from '@/components/system/status-badge';

import { Button } from '@/components/system/button';
import { TeamLabel } from '@/components/spaces/team-label';
import { ChevronUp, ChevronDown, Plus, RotateCcw } from 'lucide-react';
import type { AlternativeItem, RadarItem, DeckChangeView } from '@/types/dashboard';
import { Tip } from '@/components/ui/tip';

interface DeckMoreOptionsProps {
  alternatives: AlternativeItem[];
  /** Items the AI moved off today's deck (deferred/dropped) — restorable. */
  bumped?: DeckChangeView[];
  onRestore?: (taskId: string) => void;
  radarItems?: RadarItem[];
  onPromote: (id: string, type: 'alternative' | 'radar') => void;
  onViewAllTasks?: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function DeckMoreOptions({
  alternatives,
  bumped = [],
  onRestore,
  radarItems = [],
  onPromote,
  onViewAllTasks,
  collapsed,
  onToggleCollapse,
}: DeckMoreOptionsProps) {
  const totalCount = bumped.length + alternatives.length + radarItems.length;
  if (totalCount === 0) return null;

  return (
    <div className="border-t border-border">
      {/* Thin bar trigger */}
      <MenuAction density="compact"
        onClick={onToggleCollapse}
        className="flex items-center justify-between w-full"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          More options
          <span className="ml-1.5 text-muted-foreground/40 font-normal normal-case tracking-normal">
            {totalCount}
          </span>
        </span>
        {collapsed
          ? <ChevronUp className="w-3 h-3 text-muted-foreground/40" />
          : <ChevronDown className="w-3 h-3 text-muted-foreground/40" />
        }
      </MenuAction>

      {/* Expanded content */}
      {!collapsed && (
        <div className="px-4 pb-3 max-h-64 overflow-y-auto space-y-0.5">
          {/* ─── Bumped today — moved off the deck, nothing lost ─── */}
          {bumped.length > 0 && (
            <>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 pt-1 pb-0.5">
                Bumped today
              </p>
              {bumped.map(item => (
                <Tip key={`bumped-${item.taskId}`} label="Restore to today's deck">
                  <MenuAction density="compact"
                    onClick={() => onRestore?.(item.taskId)}
                    className="group/bump w-full flex items-start gap-2 text-left"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-muted-foreground md:opacity-0 md:group-hover/bump:opacity-100 group-hover/bump:text-foreground mt-0.5 transition-opacity flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground truncate">
                          {item.title}
                        </span>
                        <StatusBadge className="shrink-0">
                          {item.kind === 'dropped' ? 'dropped' : 'later'}
                        </StatusBadge>
                        <TeamLabel teamId={item.sourceTeamId} sourceArea={item.sourceArea} />
                {item.areaName && (
                          <StatusBadge className="shrink-0">
                            {item.areaName}
                          </StatusBadge>
                        )}
                      </div>
                      {item.reason && (
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5 line-clamp-2">
                          {item.reason}
                        </p>
                      )}
                    </div>
                  </MenuAction>
                </Tip>
              ))}
              {alternatives.length > 0 && <div className="h-1.5" />}
            </>
          )}

          {/* Alternative items */}
          {alternatives.map(item => (
            <MenuAction density="compact"
              key={item.id}
              onClick={() => onPromote(item.id, 'alternative')}
              className="group/alt w-full flex items-center gap-2 text-left"
            >
              <Plus className="w-3.5 h-3.5 text-muted-foreground md:opacity-0 md:group-hover/alt:opacity-100 group-hover/alt:text-foreground transition-opacity flex-shrink-0" />
              <span className="text-xs text-muted-foreground flex-1 truncate">
                {item.title}
              </span>
              <div className="flex items-center gap-1.5">
                <TeamLabel teamId={item.sourceTeamId} sourceArea={item.sourceArea} />
                {item.areaName && (
                  <StatusBadge >
                    {item.areaName}
                  </StatusBadge>
                )}
                {item.effort && (
                  <span className="text-[9px] text-muted-foreground/50">
                    {item.effort}
                  </span>
                )}
              </div>
            </MenuAction>
          ))}

          {/* Radar items */}
          {radarItems.map(item => (
            <MenuAction density="compact"
              key={item.id}
              onClick={() => onPromote(item.id, 'radar')}
              className="group/radar w-full flex items-start gap-2 text-left"
            >
              <Plus className="w-3.5 h-3.5 text-muted-foreground md:opacity-0 md:group-hover/radar:opacity-100 group-hover/radar:text-foreground mt-0.5 transition-opacity flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground truncate">
                    {item.title}
                  </span>
                  <StatusBadge className="shrink-0">
                    radar
                  </StatusBadge>
                </div>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                  {item.reason}
                </p>
              </div>
            </MenuAction>
          ))}

          {/* View all tasks */}
          {onViewAllTasks && (
            <div className="pt-2 pb-1">
              <Button
                onClick={onViewAllTasks}
                variant="ghost"
                size="xs"
              >
                View all tasks →
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
