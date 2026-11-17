'use client';
import { Command } from 'cmdk';
import { Calendar, FileText, FileCheck2, LayoutDashboard, Layers3, ListTodo, MessageSquarePlus, MessagesSquare, Mic, Moon, NotebookPen, Plus, Radio, Settings, SquareKanban, StickyNote, Sun, TextSearch, LayoutGrid, type LucideIcon } from 'lucide-react';
import type { PaletteCommand } from '@/constants/commands';
const icons: Record<string, LucideIcon> = { Calendar, FileText, FileCheck2, LayoutDashboard, Layers3, ListTodo, MessageSquarePlus, MessagesSquare, Mic, Moon, NotebookPen, Plus, Radio, Settings, SquareKanban, StickyNote, Sun, TextSearch, LayoutGrid };

/** The commands a query finds, by their label and keywords. */
export function matchCommands(commands: readonly PaletteCommand[], query: string, label: (command: PaletteCommand) => string = command => command.label): PaletteCommand[] {
  const wanted = query.trim().toLowerCase();
  return commands.filter(command => `${label(command)} ${command.keywords}`.toLowerCase().includes(wanted));
}

/**
 * One command matching and keyboard row implementation. Homes supply available actions. With no
 * `empty`, a query that finds nothing shows nothing, for a group beside other results.
 */
export function CommandSearchItems({ commands, query, onSelect, icon = command => command.icon, label = command => command.label, heading = 'Actions', empty = 'No matching commands' }: {
  commands: PaletteCommand[]; query: string; onSelect: (command: PaletteCommand) => void;
  icon?: (command: PaletteCommand) => string; label?: (command: PaletteCommand) => string;
  heading?: string; empty?: string | null;
}) {
  const found = matchCommands(commands, query, label);
  if (!found.length && empty === null) return null;
  return <>
    {!found.length && <p className="p-8 text-center text-[11px] text-muted-foreground">{empty}</p>}
    <Command.Group heading={heading} className="px-2 pb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground/60">
      {found.map(command => {
        const Icon = icons[icon(command)];
        return <Command.Item key={command.id} value={command.id} onSelect={() => onSelect(command)} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left data-[selected=true]:bg-muted/50">
          <span className="shrink-0 text-muted-foreground">{Icon && <Icon size={14}/>}</span><span className="flex-1 text-[12px] font-medium">{label(command)}</span>
          {command.shortcut && <kbd className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground/60">{command.shortcut}</kbd>}
        </Command.Item>;
      })}
    </Command.Group>
  </>;
}
