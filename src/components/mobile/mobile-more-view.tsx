"use client";
import { MenuAction } from '@/components/system/menu-action';

import { IconButton } from '@/components/system/icon-button';
import { useState } from 'react';
import {
  CheckSquare, FileText, Activity, Layers, LayoutGrid, Calendar, Moon, Settings, Sun, SunMoon, ChevronLeft, FileCheck2, MessageSquarePlus,
} from 'lucide-react';
import { useDashboard } from '@/contexts/dashboard-context';
import { TaskList } from '@/components/tasks/task-list';
import { NoteList } from '@/components/notes/note-list';
import { StreamList } from '@/components/stream/stream-list';
import { CalendarPanel } from '@/components/calendar/calendar-panel';
import { openSettings } from '@/components/settings/settings-store';
import { openFeedback } from '@/components/feedback/feedback-store';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useResultCapabilities } from '@/hooks/use-results';
import { SAVED_RESULTS_COMMAND } from '@/constants/commands';
import { SegmentedControl } from '@/components/system/segmented-control';
import { THEME_OPTIONS } from '@/components/settings/sections/theme-settings';

type MoreSubView = 'menu' | 'tasks' | 'notes' | 'stream' | 'calendar';

export function MobileMoreView() {
  const router = useRouter();
  const capabilities = useResultCapabilities();
  const { theme, themePreference, setThemePreference, openAreasList, setActiveView, openTask, openNote } = useDashboard();
  const isDark = theme === 'dark';
  const ThemeIcon = themePreference === 'system' ? SunMoon : themePreference === 'dark' ? Moon : Sun;
  const [subView, setSubView] = useState<MoreSubView>('menu');

  // Sub-view rendering
  if (subView !== 'menu') {
    const labels: Record<MoreSubView, string> = { menu: '', tasks: 'Tasks', notes: 'Notes', stream: 'Stream', calendar: 'Calendar' };
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <IconButton
            onClick={() => setSubView('menu')}
            label="Back"
            variant="ghost"
            size="touch"
            className="-ml-1"
          >
            <ChevronLeft size={18} className="text-muted-foreground" />
          </IconButton>
          <span className="text-sm font-bold">{labels[subView]}</span>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {subView === 'tasks' && <TaskList onOpenTask={openTask} />}
          {subView === 'notes' && <NoteList onOpenNote={openNote} />}
          {subView === 'stream' && <StreamList />}
          {subView === 'calendar' && <CalendarPanel />}
        </div>
      </div>
    );
  }

  const items = [
    { id: 'tasks' as const, label: 'Tasks', icon: CheckSquare, action: () => setSubView('tasks') },
    { id: 'notes' as const, label: 'Notes', icon: FileText, action: () => setSubView('notes') },
    { id: 'stream' as const, label: 'Stream', icon: Activity, action: () => setSubView('stream') },
    { id: 'calendar' as const, label: 'Calendar', icon: Calendar, action: () => setSubView('calendar') },
    { id: 'areas' as const, label: 'Areas', icon: Layers, action: () => openAreasList() },
    ...(capabilities.data?.handoffsEnabled ? [{ id: 'results' as const, label: SAVED_RESULTS_COMMAND.label, icon: FileCheck2, action: () => router.push(SAVED_RESULTS_COMMAND.href) }] : []),
    { id: 'apps' as const, label: 'Apps', icon: LayoutGrid, action: () => setActiveView({ kind: 'apps', route: '' }) },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-bold text-foreground">More</h2>
      </div>

      {/* Navigation items */}
      <div className="px-4 space-y-1">
        {items.map((item) => (
          <MenuAction
            key={item.id}
            onClick={item.action}
            className="w-full flex items-center gap-3 text-left"
          >
            <div className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center',
              isDark ? 'bg-secondary' : 'bg-muted'
            )}>
              <item.icon size={18} className="text-muted-foreground" />
            </div>
            <span className="text-sm font-medium text-foreground">{item.label}</span>
          </MenuAction>
        ))}
      </div>

      {/* Divider */}
      <div className="mx-4 my-3 h-px bg-border" />

      {/* Settings-like items */}
      <div className="px-4 space-y-1">
        <div className="space-y-2 px-3 py-2">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center',
              isDark ? 'bg-secondary' : 'bg-muted'
            )}>
              <ThemeIcon size={18} className="text-muted-foreground" />
            </div>
            <span className="text-sm font-medium text-foreground">Theme</span>
          </div>
          <SegmentedControl mode="choice" selection="radio" size="touch" stretch distribution="natural" ariaLabel="Theme" value={themePreference} onChange={setThemePreference} options={THEME_OPTIONS} />
        </div>

        <MenuAction
          onClick={() => openSettings()}
          className="w-full flex items-center gap-3 text-left"
        >
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center',
            isDark ? 'bg-secondary' : 'bg-muted'
          )}>
            <Settings size={18} className="text-muted-foreground" />
          </div>
          <span className="text-sm font-medium text-foreground">Settings</span>
        </MenuAction>

        <MenuAction
          onClick={() => openFeedback()}
          className="w-full flex items-center gap-3 text-left"
        >
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center',
            isDark ? 'bg-secondary' : 'bg-muted'
          )}>
            <MessageSquarePlus size={18} className="text-muted-foreground" />
          </div>
          <span className="text-sm font-medium text-foreground">Feedback & bugs</span>
        </MenuAction>
      </div>
    </div>
  );
}
