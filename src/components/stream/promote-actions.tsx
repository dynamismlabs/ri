"use client";
import { MenuAction } from '@/components/system/menu-action';


import { Field } from '@/components/system/field';

import { IconButton } from '@/components/system/icon-button';

import { useState, useRef, useCallback } from 'react';
import {
  Target, FileText, Search, Plus, GitMerge,
} from 'lucide-react';

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/system/popover';
import { useTasks } from '@/hooks/use-tasks';
import { useNotes } from '@/hooks/use-notes';

// ─── Task promote/merge ─────────────────────────────────────

interface TaskActionsProps {
  onPromote: (status: 'consider' | 'todo') => void;
  onMerge: (taskId: string) => void;
}

export function TaskActions({ onPromote, onMerge }: TaskActionsProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'menu' | 'search'>('menu');
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Merge targets are open tasks (Consider / Todo / In progress).
  const { data: tasks } = useTasks({ status: ['consider', 'todo', 'in_progress'] });

  const filtered = (tasks ?? []).filter(t =>
    t.title.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setMode('menu');
      setQuery('');
    }
  }, []);

  const handleMerge = useCallback((taskId: string) => {
    onMerge(taskId);
    handleOpenChange(false);
  }, [onMerge, handleOpenChange]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <IconButton
          label="Create task"
          variant="ghost"
          size="xs"
          disclosure
        >
          <Target size={12} />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent padding="none" align="end" className="w-56" sideOffset={4}>
        {mode === 'menu' && (
          <div className="py-1">
            <MenuAction
              onClick={() => { onPromote('todo'); handleOpenChange(false); }}
              className="w-full flex items-center gap-2.5"
            >
              <Plus size={12} className="text-blue-500" />
              <span className="font-medium">Add to Todo</span>
            </MenuAction>
            <MenuAction
              onClick={() => { onPromote('consider'); handleOpenChange(false); }}
              className="w-full flex items-center gap-2.5"
            >
              <Plus size={12} className="text-amber-500" />
              <span className="font-medium">Save to Consider</span>
            </MenuAction>
            <MenuAction
              onClick={() => { setMode('search'); setTimeout(() => inputRef.current?.focus(), 0); }}
              className="w-full flex items-center gap-2.5"
            >
              <GitMerge size={12} className="text-muted-foreground" />
              <span className="font-medium">Merge into task...</span>
            </MenuAction>
          </div>
        )}

        {mode === 'search' && (
          <div>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border"><Field
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks..."
              className={'flex-1'}
              purpose="embedded"
              leading={<Search />}
              aria-label={'Search tasks'}
            /></div>
            <div className="max-h-48 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-[10px] text-muted-foreground">No tasks found</p>
              )}
              {filtered.map((task) => (
                <MenuAction density="compact"
                  key={task.id}
                  onClick={() => handleMerge(task.id)}
                  className="w-full flex items-start gap-2 text-left"
                >
                  <Target size={10} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-[10.5px] text-foreground leading-snug line-clamp-2">
                    {task.title}
                  </span>
                </MenuAction>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Note promote/merge ─────────────────────────────────────

interface NoteActionsProps {
  onPromote: () => void;
  onMerge: (noteId: string) => void;
}

export function NoteActions({ onPromote, onMerge }: NoteActionsProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'menu' | 'search'>('menu');
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: notes } = useNotes({ status: 'active' });

  const filtered = (notes ?? []).filter(n => {
    const text = (n.title ?? n.bodyExcerpt ?? '').toLowerCase();
    return text.includes(query.toLowerCase());
  }).slice(0, 8);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setMode('menu');
      setQuery('');
    }
  }, []);

  const handleMerge = useCallback((noteId: string) => {
    onMerge(noteId);
    handleOpenChange(false);
  }, [onMerge, handleOpenChange]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <IconButton
          label="Create note"
          variant="ghost"
          size="xs"
          disclosure
        >
          <FileText size={12} />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent padding="none" align="end" className="w-56" sideOffset={4}>
        {mode === 'menu' && (
          <div className="py-1">
            <MenuAction
              onClick={() => { onPromote(); handleOpenChange(false); }}
              className="w-full flex items-center gap-2.5"
            >
              <Plus size={12} className="text-primary" />
              <span className="font-medium">New note</span>
            </MenuAction>
            <MenuAction
              onClick={() => { setMode('search'); setTimeout(() => inputRef.current?.focus(), 0); }}
              className="w-full flex items-center gap-2.5"
            >
              <GitMerge size={12} className="text-muted-foreground" />
              <span className="font-medium">Append to note...</span>
            </MenuAction>
          </div>
        )}

        {mode === 'search' && (
          <div>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border"><Field
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes..."
              className={'flex-1'}
              purpose="embedded"
              leading={<Search />}
              aria-label={'Search notes'}
            /></div>
            <div className="max-h-48 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-[10px] text-muted-foreground">No notes found</p>
              )}
              {filtered.map((note) => (
                <MenuAction density="compact"
                  key={note.id}
                  onClick={() => handleMerge(note.id)}
                  className="w-full flex items-start gap-2 text-left"
                >
                  <FileText size={10} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-[10.5px] text-foreground leading-snug line-clamp-2">
                    {note.title ?? (note.bodyExcerpt ?? '').slice(0, 80)}
                  </span>
                </MenuAction>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
