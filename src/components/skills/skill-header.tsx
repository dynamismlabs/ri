'use client';
import { MenuAction } from '@/components/system/menu-action';

import { SegmentedList } from '@/components/system/segmented-control';

import { IconButton } from '@/components/system/icon-button';
import { Button } from '@/components/system/button';
import { PluginSetupHelpButton } from '@/components/plugins/setup-help-button';
import { documentSaves } from '@/lib/client/document-saves';
import { Archive, ChevronLeft, Copy, GitCommitHorizontal, Loader2, MoreHorizontal, ScrollText } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorText } from '@/lib/api/client';
import type { SkillView } from '@/lib/api/skills';
import { useArchiveSkill, useCommitSkill } from '@/hooks/use-skills';
import { useSkillNavigation } from '@/components/skills/skill-navigation';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { SkillLocationControl } from './skill-location-control';
import { Tip } from '@/components/ui/tip';

export type SkillPane = 'chat' | 'skill';

/**
 * The skill builder's header, one row: the skill's name (its slash command,
 * renamed in the editor's Name field), setup help, where it's installed
 * (Install, for a draft), and for a project skill with changes the repo
 * hasn't committed, committing them. The location menu says who uses it, so
 * the header doesn't repeat it.
 */
export function SkillHeader({
  skill,
  onBack,
  pane,
}: {
  skill: SkillView;
  onBack?: () => void;
  pane?: { value: SkillPane; onChange: (pane: SkillPane) => void };
}) {
  const { goHome, canManage, showSetupHelp } = useSkillNavigation();
  const confirm = useConfirm();
  const commit = useCommitSkill(skill.ref);
  const archive = useArchiveSkill();
  const showCommit = skill.location.kind === 'project' && skill.git !== null && skill.uncommitted;

  const onArchive = async () => {
    const ok = await confirm({
      title: `Archive ${skill.name}?`,
      description:
        skill.location.kind === 'project'
          ? "It leaves the repo, and its chats are archived with it. The folder moves to the archive in your Ri folder, so nothing is deleted. Commit the removal to take it away from your team too."
          : skill.location.kind === 'draft'
            ? 'Its chats are archived with it. The folder moves to the archive in your Ri folder, so nothing is deleted.'
            : 'No agent will use it anymore, and its chats are archived with it. The folder moves to the archive in your Ri folder, so nothing is deleted.',
      confirmLabel: 'Archive',
      tone: 'destructive',
    });
    if (!ok) return;
    // Its edits are saved first, and a save that fails keeps the person on
    // them. Then it leaves before the archive request, not when it returns:
    // by then the person may be somewhere else. A failure is a toast
    // wherever they are. The toasts hang off the promise because leaving
    // unmounts this header, and a mutate() callback doesn't run after its
    // component unmounts.
    try { await documentSaves.flushAll(); } catch (error) { toast.error(apiErrorText(error)); return; }
    const name = skill.name;
    goHome();
    archive.mutateAsync(skill.ref).then(
      () => toast.success(`${name} archived`),
      (err: unknown) => toast.error(`Couldn't archive ${name}`, { description: apiErrorText(err) }),
    );
  };

  return (
    <header className="@container flex-shrink-0 min-w-0 border-b border-border">
      <div className="flex min-w-0 items-center gap-3 px-4 py-2">
        {onBack && (
          <IconButton onClick={onBack} label="Back" variant="ghost" size="sm" className="-ml-2">
            <ChevronLeft size={20} />
          </IconButton>
        )}
        <span className="flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ScrollText size={16} />
        </span>
        <h1 className="min-w-0 truncate font-mono text-[13px] font-semibold text-foreground">{skill.name}</h1>

        {showCommit && (
          <Tip label="Commit only this skill's files. Other changes in the repo are left alone.">
            <Button
              onClick={() =>
                commit.mutate(undefined, {
                  onSuccess: ({ commit: done }) =>
                    toast.success(
                      `Committed to ${done.branch ?? 'the repo'} (${done.sha}). Push it to share it with your team.`,
                    ),
                  onError: (err) => toast.error(apiErrorText(err)),
                })
              }
              disabled={commit.isPending}
              variant="primary"
              size="sm"
              className="flex flex-shrink-0 items-center gap-1.5"
            >
              {commit.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <GitCommitHorizontal size={12} strokeWidth={2.5} />
              )}
              {skill.git?.branch ? `Commit to ${skill.git.branch}` : 'Commit'}
            </Button>
          </Tip>
        )}

        <div className="flex-1" />

        {showSetupHelp && <PluginSetupHelpButton compact target={{ kind: 'skill', skill }} />}
        {canManage && <SkillLocationControl skill={skill} />}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="More" variant="ghost" size="sm" className="flex-shrink-0">
              <MoreHorizontal size={15} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <MenuAction kind="menu"
              onSelect={() => {
                void navigator.clipboard.writeText(skill.dir).then(() => toast.success('Folder path copied'));
              }}
            >
              <Copy size={13} /> Copy folder path
            </MenuAction>
            {skill.editable && (
              <>
                <DropdownMenuSeparator />
                <MenuAction tone="error" kind="menu"
                  onSelect={() => void onArchive()}

                >
                  <Archive size={13} /> Archive
                </MenuAction>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {pane && (
        <div className="flex gap-1 px-4 pb-2">
          <SegmentedList
            ariaLabel="Chat or skill"
            size="touch"
            stretch
            options={[
              { value: 'chat', label: 'Chat' },
              { value: 'skill', label: 'Skill' },
            ]}
          />
        </div>
      )}
    </header>
  );
}
