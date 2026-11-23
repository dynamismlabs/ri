'use client';
import { Callout } from '@/components/system/callout';

import { FormLabel, FormDescription } from '@/components/system/form-label';

import { Field } from '@/components/system/field';
import { NativeSelect } from '@/components/system/native-select';
import { TextArea } from '@/components/system/text-area';

import { Button } from '@/components/system/button';
import { SegmentedControl } from '@/components/system/segmented-control';
import { useViewportTier } from '@/hooks/use-viewport-tier';
/**
 * Add or edit one linked folder (docs/reference-folders-spec.md §9,
 * docs/homes-spec.md §4.2).
 *
 * The whole point is that adding one should feel like nothing: pick a folder,
 * confirm the alias we guessed, done. Description is optional, and Read only
 * and the global toggle are off by default, so the common path is two clicks.
 *
 * A folder has a place on each device. Adding one places it on the device
 * it's added from, and editing changes only what it is. Its place on each
 * device is changed from the agent's Folders, one device at a time.
 */

import { useMemo, useState } from 'react';
import { FolderOpen, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import slugify from '@sindresorhus/slugify';
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/system/dialog';
import { Switch } from '@/components/ui/switch';
import { FolderPickerDialog } from './folder-picker-dialog';
import { useWorkspaces } from '@/hooks/use-workspaces';

import type { ReferenceFolderRecord } from '@/db/types';
import { Tip } from '@/components/ui/tip';
import { READ_ONLY_DEFAULT } from '@/lib/reference-folders/read-only';

/** The linked folder being edited: what it is, not where. */
export type LinkedFolderDefinition = Pick<ReferenceFolderRecord, 'id' | 'alias' | 'description' | 'workspaceId' | 'targetWorkspaceId'> & {
  readOnly: boolean;
};

export interface ReferenceFolderDraft {
  alias: string;
  path: string | null;
  targetWorkspaceId: string | null;
  description: string | null;
  workspaceId: string | null;
  /** Agents are told not to change it, and Claude's editing tools are blocked there. */
  readOnly: boolean;
  /**
   * Also create the mirror reference, pointing the target workspace back at
   * this one. References are one-way by design, so this is opt-in — but when
   * two codebases genuinely depend on each other, wanting both is the norm.
   */
  addReverse?: boolean;
}

interface ReferenceFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Workspace the reference is being added from. Null = editing a global row. */
  workspaceId: string | null;
  /** Name of that workspace, used in the "add the reverse too" copy. */
  workspaceName?: string;
  /** Existing row when editing; null when adding. */
  editing?: LinkedFolderDefinition | null;
  /** Aliases already taken in this view, used for the shadow/conflict warning. */
  existing: Array<{ id: string; alias: string; global: boolean }>;
  /** The device a new folder is placed on, and browsed. */
  device?: { id: string; name: string };
  /** Whether that device's folders can be browsed now. */
  browsable?: boolean;
  /** Offered beside Save when editing: removes it, after asking. */
  onRemove?: () => void;
  saving: boolean;
  error: string | null;
  onSubmit: (draft: ReferenceFolderDraft) => void;
}

type Mode = 'folder' | 'workspace';

/** Alias suggestion from a folder name or workspace name. Never overrides typing. */
function aliasFromPath(p: string): string {
  const leaf = p.replace(/\/+$/, '').split('/').pop() ?? '';
  return slugify(leaf, { separator: '-' });
}

export function ReferenceFolderDialog(props: ReferenceFolderDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-lg">
        {/* Mounted each time it opens, so a previous add doesn't bleed into the next one. */}
        {props.open && <ReferenceFolderForm {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function ReferenceFolderForm({
  onOpenChange,
  workspaceId,
  workspaceName,
  editing,
  existing,
  saving,
  error,
  onSubmit,
  device,
  browsable = true,
  onRemove,
}: ReferenceFolderDialogProps) {
  const phone = useViewportTier() === 'phone';
  const { data: workspaces } = useWorkspaces({ status: 'active' });
  const [mode, setMode] = useState<Mode>(editing?.targetWorkspaceId ? 'workspace' : 'folder');
  const [path, setPath] = useState('');
  const [targetWorkspaceId, setTargetWorkspaceId] = useState(editing?.targetWorkspaceId ?? '');
  // What the person typed. Until they type, the alias follows the target.
  const [typedAlias, setTypedAlias] = useState<string | null>(editing?.alias ?? null);
  const [description, setDescription] = useState(editing?.description ?? '');
  const [global, setGlobal] = useState(editing ? editing.workspaceId === null : false);
  const [readOnly, setReadOnly] = useState(editing?.readOnly ?? READ_ONLY_DEFAULT);
  const [addReverse, setAddReverse] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectableWorkspaces = useMemo(
    // A workspace referencing itself is rejected server-side; don't offer it.
    () => (workspaces ?? []).filter((w) => w.id !== workspaceId),
    [workspaces, workspaceId],
  );

  const guessedAlias =
    mode === 'folder'
      ? path
        ? aliasFromPath(path)
        : ''
      : slugify(selectableWorkspaces.find((w) => w.id === targetWorkspaceId)?.name ?? '', { separator: '-' });
  const alias = typedAlias ?? guessedAlias;

  const normalizedAlias = alias.trim().toLowerCase();
  const aliasValid = /^[a-z0-9][a-z0-9._-]*$/.test(normalizedAlias);
  // Editing changes what it is. Where it is, is chosen per device.
  const hasTarget = mode === 'folder' ? !!editing || path.trim().length > 0 : targetWorkspaceId.length > 0;
  const canSubmit = aliasValid && hasTarget && !saving;

  // Adding a workspace-scoped alias that matches a global one is allowed —
  // the workspace row wins — but it's worth saying out loud.
  const shadowed = existing.find(
    (r) => r.alias === normalizedAlias && r.id !== editing?.id && r.global && !global,
  );
  const duplicate = existing.find(
    (r) => r.alias === normalizedAlias && r.id !== editing?.id && r.global === global,
  );

  // Only meaningful when adding a workspace→workspace reference from a real
  // workspace. A global reference is already visible everywhere, and editing
  // an existing row shouldn't quietly create a second one.
  const canAddReverse =
    !editing && mode === 'workspace' && !global && !!workspaceId && !!targetWorkspaceId;
  const reverseTargetName = selectableWorkspaces.find((w) => w.id === targetWorkspaceId)?.name;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      alias: normalizedAlias,
      path: mode === 'folder' && !editing ? path.trim() : null,
      targetWorkspaceId: mode === 'workspace' ? targetWorkspaceId : null,
      description: description.trim() || null,
      workspaceId: global ? null : workspaceId,
      readOnly,
      addReverse: canAddReverse && addReverse,
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit @${editing.alias}` : 'Add a linked folder'}</DialogTitle>
        <DialogDescription>
          Another folder this agent works with. It can read, search and change it, unless you make it read only.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        {!editing && (
          <SegmentedControl mode="choice" ariaLabel="Linked folder source" value={mode} onChange={setMode} size={phone ? 'touch' : 'compact'} stretch options={[{value:'folder',label:'A folder'},{value:'workspace',label:'Another agent'}]} />
        )}

        {mode === 'folder' ? (
          editing ? null : (
            <Field
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/Users/you/code/api"
              spellCheck={false}
              className="min-w-0 flex-1"
              purpose="code"
              label={device ? `Where it is on ${device.name}` : 'Folder'}
              description={
                <>
                  Anything with a path works: a sibling repo, a docs folder, even an installed
                  dependency under <code className="font-mono">node_modules</code>.
                  {device && ' Your other devices each choose their own place for it.'}
                </>
              }
              trailing={
                <Tip
                  label={
                    browsable
                      ? undefined
                      : `${device?.name ?? 'That device'} isn't running Ri right now. Type the path instead.`
                  }
                >
                  <Button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    disabled={!browsable}
                    variant="secondary"
                    size={phone ? 'touch' : 'sm'}
                    className="flex shrink-0 items-center gap-1.5"
                  >
                    <FolderOpen size={13} />
                    Browse
                  </Button>
                </Tip>
              }
            />
          )
        ) : (
          <NativeSelect
            value={targetWorkspaceId}
            onChange={(e) => setTargetWorkspaceId(e.target.value)}
            className="w-full"
            label="Agent"
            description={
              <>
                Its own folder on each device, so it follows that agent wherever it&apos;s set up.
                This agent reads whatever is checked out there, not any in-progress worktree.
              </>
            }
          >
            <option value="">Choose an agent…</option>
            {selectableWorkspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.emoji ? `${w.emoji} ${w.name}` : w.name}
              </option>
            ))}
          </NativeSelect>
        )}

        <Field
          value={alias}
          onChange={(e) => setTypedAlias(e.target.value)}
          placeholder="backend"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className="min-w-0 flex-1"
          purpose="code"
          label="Alias"
          leading={<span aria-hidden>@</span>}
          error={
            normalizedAlias && !aliasValid ? (
              <>
                Lowercase letters, digits, dot, dash or underscore. Must start with a letter or
                digit.
              </>
            ) : undefined
          }
          description={
            !(normalizedAlias && !aliasValid) ? (
              <>What you type after @ in chat to point the agent here.</>
            ) : undefined
          }
        />

        <TextArea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Go API server this app calls. HTTP routes live in internal/http/."
          className="w-full"
          resize="vertical"
          label="Why you'd look there"
          description={
            <>
              Optional. Worth a line when the name alone doesn&apos;t say why the agent would open
              it.
            </>
          }
        />

        <label className="flex cursor-pointer items-start justify-between gap-3">
          <span>
            <FormLabel>Read only</FormLabel>
            <FormDescription>
              Agents can read and search it, and are told not to change anything there. Claude&apos;s file
              edits there are blocked too.
            </FormDescription>
          </span>
          <Switch checked={readOnly} onCheckedChange={setReadOnly} className="mt-0.5" />
        </label>

        <label className="flex cursor-pointer items-start justify-between gap-3">
          <span>
            <FormLabel>For every agent</FormLabel>
            <FormDescription>
              Use for something shared, like a design system several apps consume. Every agent
              on a device uses the same place for it.
            </FormDescription>
          </span>
          <Switch checked={global} onCheckedChange={setGlobal} className="mt-0.5" />
        </label>

        {canAddReverse && (
          <label className="flex cursor-pointer items-start justify-between gap-3">
            <span>
              <FormLabel>Also link back</FormLabel>
              <FormDescription>
                Adds{' '}
                <span className="font-mono">@{slugify(workspaceName ?? '', { separator: '-' })}</span>{' '}
                inside {reverseTargetName ?? 'that agent'}, read only if this one is, so each can use the
                other&apos;s folder.
              </FormDescription>
            </span>
            <Switch checked={addReverse} onCheckedChange={setAddReverse} className="mt-0.5" />
          </label>
        )}

        {duplicate && (
          <Notice tone="error">
            A linked folder named <code className="font-mono">{normalizedAlias}</code> already
            exists {global ? 'for every agent' : 'in this agent'}.
          </Notice>
        )}
        {!duplicate && shadowed && (
          <Notice tone="warning">
            This shadows <code className="font-mono">{normalizedAlias}</code>, which every agent
            has. In this agent, yours wins.
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </DialogBody>

      <DialogFooter>
        {editing && onRemove && (
          <Button
            type="button"
            onClick={onRemove}
            variant="ghost"
            size="md"
            tone="danger"
            className="mr-auto flex items-center gap-1.5"
          >
            <Trash2 size={12} />
            Remove
          </Button>
        )}
        <Button
          type="button"
          onClick={() => onOpenChange(false)}
          variant="ghost"
          size="md"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          variant="primary"
          size="md"
          className="flex items-center gap-1.5"
        >
          {saving && <Loader2 size={13} className="animate-spin" />}
          {editing ? 'Save' : 'Add'}
        </Button>
      </DialogFooter>

      <FolderPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        device={device}
        initialPath={path || undefined}
        onChoose={(chosen) => {
          setPath(chosen);
          setPickerOpen(false);
        }}
      />
    </>
  );
}

function Notice({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'warning' | 'error';
}) {
  return (
    <Callout padding="sm" tone={(tone === 'error' ? "error" : "warning")}
      className="flex items-start gap-2"
    >
      <AlertTriangle size={13} className="mt-px shrink-0" />
      <span>{children}</span>
    </Callout>
  );
}
