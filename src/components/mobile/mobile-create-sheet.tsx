"use client";
import { ChoiceRow } from '@/components/system/choice-row';
import { Card } from '@/components/system/card';

import { Button } from '@/components/system/button';
import { useCallback, useState } from 'react';
import { CheckSquare, FileText, Layers, MessageSquarePlus, Plus, Zap } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/system/sheet';
import { AreaCreateModal } from '@/components/dashboard/area-create-modal';
import { useCreateNote } from '@/hooks/use-notes';
import { useCreateTask } from '@/hooks/use-tasks';
import { useStartSkill } from '@/hooks/use-start-skill';
import { openSettings } from '@/components/settings/settings-store';
import { openLauncher } from '@/components/workspaces/launcher/launcher-store';
import { PLUGIN_CREATE_ANCHORS } from '@/components/settings/sections/plugins/navigation';
import { useOptionalTeam, useTeamNav } from '@/components/team/team-context';
import { useDashboard } from '@/contexts/dashboard-context';

/**
 * The phone's Create sheet: the desktop CREATE menu at touch size, plus New
 * chat. One neutral surface for every choice. The filled + that opened it was
 * the call to action, so nothing in here competes with it, and color stays
 * free to mean what it means elsewhere (amber needs you, green is working).
 * Order carries priority instead: start work, capture, make a thing, set up.
 */
export function MobileCreateSheet() {
  const team = useOptionalTeam();
  const nav = useTeamNav();
  const defaults = team ? { ...(nav.areaId ? { areaId: nav.areaId } : {}), ...(nav.mine ? { assigneeMemberId: team.member.id } : {}) } : {};
  const noteDefaults = team ? { ...(nav.areaId ? { areaId: nav.areaId } : {}), ...(nav.decisions ? { kind: 'decision' as const } : {}) } : {};
  const { mobileCreateOpen, setMobileCreateOpen, openNote, openTask, setQuickCaptureOpen } = useDashboard();
  const [areaOpen, setAreaOpen] = useState(false);
  const createNote = useCreateNote();
  const createTask = useCreateTask();
  const newSkill = useStartSkill();

  const close = useCallback(() => setMobileCreateOpen(false), [setMobileCreateOpen]);

  // The same launcher as the desktop rail's New chat: no agent picked, the
  // prompt first, then where it runs and on what.
  const newChat = () => { close(); openLauncher({ workspaceId: null }); };
  const quickCapture = () => { close(); setQuickCaptureOpen(true); };
  const newTask = () => {
    close();
    createTask.mutate({ title: ' ', rawInput: ' ', ...defaults }, { onSuccess: (task) => openTask(task.id) });
  };
  const newNote = () => {
    close();
    createNote.mutate({ body: ' ', ...noteDefaults }, { onSuccess: (note) => openNote(note.id) });
  };
  const newArea = () => { close(); setAreaOpen(true); };

  return (
    <>
      <Sheet open={mobileCreateOpen} onOpenChange={setMobileCreateOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="gap-0 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
          <SheetTitle className="sr-only">Create</SheetTitle>
          <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-muted-foreground/30" />

          <div className="grid gap-1">
            <VerbRow icon={MessageSquarePlus} label="New chat" hint="Put an agent to work" onClick={newChat} />
            {!team && <VerbRow icon={Zap} label="Quick capture" hint="Type or speak. Sort later" onClick={quickCapture} />}
          </div>

          <div className="my-3 h-px bg-border" />

          <div className="grid grid-cols-3 gap-2">
            <ThingTile icon={CheckSquare} label="Task" onClick={newTask} />
            <ThingTile icon={FileText} label="Note" onClick={newNote} />
            <ThingTile icon={Layers} label="Area" onClick={newArea} />
          </div>

          <div className="my-3 h-px bg-border" />

          {!team && <div className="grid">
            <SetupRow label="Connect a service" onClick={() => { close(); openSettings('plugins', { anchor: PLUGIN_CREATE_ANCHORS.connectService }); }} />
            <SetupRow label="New skill" disabled={newSkill.isPending} onClick={() => { close(); newSkill.start(); }} />
            <SetupRow label="Add MCP server" onClick={() => { close(); openSettings('plugins', { anchor: PLUGIN_CREATE_ANCHORS.mcpServer }); }} />
          </div>}
        </SheetContent>
      </Sheet>

      <AreaCreateModal open={areaOpen} onOpenChange={setAreaOpen} />
    </>
  );
}

function VerbRow({ icon: Icon, label, hint, onClick }: { icon: typeof Zap; label: string; hint: string; onClick: () => void }) {
  return (
    <ChoiceRow surface="plain" density="comfortable" size="touch"   type="button" onClick={onClick} className="flex items-center gap-3 text-left">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
        <Icon size={19} />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </ChoiceRow>
  );
}

function ThingTile({ icon: Icon, label, onClick }: { icon: typeof Zap; label: string; onClick: () => void }) {
  return (
    <Card as="button" padding="md"  type="button" onClick={onClick} className="flex flex-col items-center gap-1.5">
      <Icon size={20} className="text-foreground" />
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </Card>
  );
}

function SetupRow({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      variant="ghost"
      size="touch"
      className="flex items-center gap-3 justify-start"
    >
      <Plus size={17} className="shrink-0 text-muted-foreground" /> {label}
    </Button>
  );
}
