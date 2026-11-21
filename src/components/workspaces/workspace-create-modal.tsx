'use client';
import { MenuAction } from '@/components/system/menu-action';

import { Card } from '@/components/system/card';
import { Callout } from '@/components/system/callout';

import { Field } from '@/components/system/field';
import { NativeSelect } from '@/components/system/native-select';

import { IconButton } from '@/components/system/icon-button';
import { Button } from '@/components/system/button';
/**
 * New agent (docs/agent-folders.md): a name and the folders it works in, the
 * way ChatGPT creates a project. Folders are optional. The first one is the
 * primary folder, where its chats start and whose instructions they follow,
 * and any other can be made primary instead. With none, Ri makes the agent a
 * folder and says where. The name and icon follow the primary folder until
 * the person sets them, and clicking the icon picks an emoji or an image.
 * Below the folders: connectors (an important part of Ri, so new agents show
 * them up front), the agent browser, and for an agent with a folder, the
 * files copied into each new worktree (what its first run needs, like `.env`)
 * and its worktree scripts. Then its area. All of it is also in Setup.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderPlus, ImagePlus, Loader2, Monitor, SmilePlus, Trash2, X } from 'lucide-react';
import { Dialog as DialogPrimitive, VisuallyHidden } from 'radix-ui';
import { EmojiPicker } from '@/components/shared/emoji-picker';
import { SharedComputerWarning } from '@/components/home/shared-computer-warning';
import { Switch } from '@/components/ui/switch';
import { Tip } from '@/components/ui/tip';
import { INTEGRATION_LABELS } from '@/constants/integrations';
import type { Attachment, WorkspaceIntegrationScope } from '@/db/types';
import { useAreas } from '@/hooks/use-areas';
import { useClientLocation } from '@/hooks/use-client-location';
import { useCreateWorkspace, useNewAgentFolder } from '@/hooks/use-workspaces';
import { apiErrorBody, apiErrorStatus } from '@/lib/api/client';
import { fsApi } from '@/lib/api/fs';
import { uploadAttachment } from '@/lib/attachments/client';
import { coverAttachmentUrl } from '@/lib/attachments/view';
import { agentInitials } from '@/lib/client/agent-initials';
import { folderName } from '@/lib/folders/folder-name';

import { DEFAULT_FILES_TO_COPY } from '@/lib/workspaces/defaults';
import { useAgentConfigurationScope } from './agent-placement-controls';
import { FilesToCopySection } from './files-to-copy-section';
import { FolderPickerDialog } from './folder-picker-dialog';
import { IntegrationScopePicker } from './integration-scope-picker';
import { WorktreeScriptsSection } from './worktree-scripts-section';

interface WorkspaceCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The folder a picker should open in next: beside the last one chosen. */
function parentOf(folder: string | undefined): string {
  if (!folder) return '~';
  const trimmed = folder.replace(/\/+$/, '');
  const cut = trimmed.lastIndexOf('/');
  return cut > 0 ? trimmed.slice(0, cut) : '~';
}

export function WorkspaceCreateModal({ open, onOpenChange }: WorkspaceCreateModalProps) {
  const { personalTools, canConfigure, executionChoices } = useAgentConfigurationScope();
  const location = useClientLocation();
  const [name, setName] = useState('');
  // The first folder is the primary one.
  const [folders, setFolders] = useState<string[]>([]);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [integrationScopes, setIntegrationScopes] = useState<WorkspaceIntegrationScope[]>([]);
  const [browserEnabled, setBrowserEnabled] = useState(true);
  const [filesToCopy, setFilesToCopy] = useState<string[]>(DEFAULT_FILES_TO_COPY);
  const [setupCommand, setSetupCommand] = useState('');
  const [startCommand, setStartCommand] = useState('');
  const [teardownCommand, setTeardownCommand] = useState('');
  const [scriptsOpen, setScriptsOpen] = useState(false);
  const [areaId, setAreaId] = useState('');
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: areas } = useAreas();
  // A name or icon the person set stays when the primary folder changes.
  const nameEditedRef = useRef(false);
  const coverEditedRef = useRef(false);
  // Only the latest favicon look-up may apply, when folders change quickly.
  const faviconRequestRef = useRef(0);
  const createWs = useCreateWorkspace();
  const primary = folders[0] ?? null;
  const trimmedName = name.trim();
  const planned = useNewAgentFolder(trimmedName, open && canConfigure && !primary && trimmedName.length > 0);

  // Where the folders are: the computer this page runs on, when it's the one
  // Ri runs on, otherwise that computer by name.
  const place = location.kind === 'host' ? 'this computer' : (executionChoices[0]?.name ?? 'your Ri computer');

  const reset = useCallback(() => {
    setName('');
    setFolders([]);
    setEmoji(null);
    setAttachment(null);
    setUploading(false);
    setIntegrationScopes([]);
    setBrowserEnabled(true);
    setFilesToCopy(DEFAULT_FILES_TO_COPY);
    setSetupCommand('');
    setStartCommand('');
    setTeardownCommand('');
    setScriptsOpen(false);
    setAreaId('');
    setPicking(false);
    setError(null);
    nameEditedRef.current = false;
    coverEditedRef.current = false;
    faviconRequestRef.current++;
  }, []);

  // The name and icon follow the primary folder until the person sets them.
  const followPrimary = useCallback((next: string | null) => {
    if (!nameEditedRef.current) setName(next ? folderName(next) : '');
    if (!personalTools || coverEditedRef.current) return;
    const requestId = ++faviconRequestRef.current;
    if (!next) {
      setAttachment(null);
      return;
    }
    fsApi
      .detectFavicon(next)
      .then((res) => {
        if (requestId !== faviconRequestRef.current || coverEditedRef.current) return;
        setAttachment(res.kind === 'found' ? res.attachment : null);
      })
      .catch((err) => console.error('[workspace-create] favicon detect failed', err));
  }, [personalTools]);

  const changeFolders = useCallback((next: string[]) => {
    const before = folders[0] ?? null;
    setFolders(next);
    setError(null);
    if ((next[0] ?? null) !== before) followPrimary(next[0] ?? null);
  }, [folders, followPrimary]);

  const addFolder = (folder: string) => {
    const clean = folder.replace(/\/+$/, '') || folder;
    if (folders.includes(clean)) return;
    changeFolders([...folders, clean]);
  };
  const removeFolder = (folder: string) => changeFolders(folders.filter((f) => f !== folder));
  const makePrimary = (folder: string) => changeFolders([folder, ...folders.filter((f) => f !== folder)]);

  useEffect(() => {
    if (!open) return;
    nameEditedRef.current = false;
    coverEditedRef.current = false;
  }, [open]);

  const uploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file?.type.startsWith('image/')) return;
    setUploading(true);
    try {
      setAttachment(await uploadAttachment(file));
      setEmoji(null);
      coverEditedRef.current = true;
    } catch (err) {
      setError(`The image couldn't be uploaded: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = useCallback(() => {
    if (!canConfigure || !trimmedName || createWs.isPending) return;
    setError(null);
    createWs.mutate(
      {
        name: trimmedName,
        cwd: primary,
        folders: folders.slice(1),
        emoji: emoji ?? null,
        attachments: attachment ? [attachment] : [],
        areaId: areaId || null,
        // Worktrees are made from a folder the person chose. One Ri makes is a plain folder.
        ...(primary
          ? {
              filesToCopy,
              setupCommand: setupCommand.trim() || null,
              startCommand: startCommand.trim() || null,
              teardownCommand: teardownCommand.trim() || null,
            }
          : {}),
        integrationScopes: personalTools ? integrationScopes : [],
        browserEnabled: personalTools && browserEnabled,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
        onError: (err) => {
          if (apiErrorStatus(err) !== undefined) {
            const body = apiErrorBody(err) as { error?: string } | null;
            setError(body?.error ?? `Request failed (${apiErrorStatus(err)})`);
          } else {
            setError(String(err));
          }
        },
      },
    );
  }, [canConfigure, trimmedName, createWs, primary, folders, emoji, attachment, areaId, filesToCopy, setupCommand, startCommand, teardownCommand, integrationScopes, personalTools, browserEnabled, reset, onOpenChange]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset],
  );

  const image = coverAttachmentUrl(attachment ? [attachment] : []);
  const initials = trimmedName ? agentInitials(trimmedName) : '';

  return (
    <DialogPrimitive.Root open={open && canConfigure} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay data-slot="dialog-overlay" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content data-slot="dialog-content" data-kind="wrapped"
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[520px] -translate-x-1/2 -translate-y-1/2 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <Card padding="none" shadow className="flex max-h-[88vh] flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-3">
              <DialogPrimitive.Title className="text-lg font-semibold text-foreground">New agent</DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <IconButton
                  label="Close"
                  variant="ghost"
                  size="sm"
                >
                  <X size={16} />
                </IconButton>
              </DialogPrimitive.Close>
            </div>
            <VisuallyHidden.Root>
              <DialogPrimitive.Description>Name the agent and choose the folders it works in.</DialogPrimitive.Description>
            </VisuallyHidden.Root>

            <form
              className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              <Card padding="none" className="flex items-center">
                <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => void uploadImage(e)} className="hidden" />
                <EmojiPicker
                  onSelect={(picked) => {
                    setEmoji(picked);
                    setAttachment(null);
                    coverEditedRef.current = true;
                  }}
                  actions={[
                    { label: 'Upload image', icon: <ImagePlus size={13} />, onSelect: () => fileInputRef.current?.click() },
                    ...(image || emoji
                      ? [{
                          label: 'Remove',
                          icon: <Trash2 size={13} />,
                          tone: 'destructive' as const,
                          onSelect: () => {
                            setEmoji(null);
                            setAttachment(null);
                            coverEditedRef.current = true;
                          },
                        }]
                      : []),
                  ]}
                >
                  <Button
                    type="button"
                    aria-label="Agent icon"
                    disabled={uploading}
                    variant="ghost"
                    size="sm"
                    focus="inside"
                    clip
                  className="ml-1.5 flex w-8 shrink-0 items-center justify-center"
                  >
                    {uploading ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt="" className="h-6 w-6 rounded-md object-cover" />
                    ) : emoji ? (
                      <span className="text-lg leading-none">{emoji}</span>
                    ) : initials ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-foreground/80">{initials}</span>
                    ) : (
                      <SmilePlus size={16} />
                    )}
                  </Button>
                </EmojiPicker>
                <span aria-hidden className="mx-1.5 h-5 w-px bg-border" />
                <Field
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    // A name cleared back to nothing follows the primary folder again.
                    nameEditedRef.current = e.target.value.trim().length > 0;
                  }}
                  placeholder="Agent name"
                  aria-label="Agent name"
                  autoFocus
                  className="min-w-0 flex-1"
                  purpose="title"
                  titleSize="form"
                />
              </Card>

              <SharedComputerWarning />

              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[13px] font-medium text-foreground">Folders</h3>
                  <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <Monitor size={13} className="shrink-0" />
                    {place === 'this computer' ? 'This computer' : place}
                  </span>
                </div>

                {folders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border px-4 py-6 text-center">
                    <p className="text-[13px] text-muted-foreground">
                      Add a folder on <span className="text-foreground">{place}</span>
                    </p>
                    <Button
                      type="button"
                      onClick={() => setPicking(true)}
                      variant="ghost"
                      size="sm"
                      className="flex items-center gap-1.5"
                    >
                      <FolderPlus size={14} />
                      Add
                    </Button>
                  </div>
                ) : (
                  <ul className="overflow-hidden rounded-xl border border-border">
                    {folders.map((folder, i) => (
                      <FolderRow
                        key={folder}
                        folder={folder}
                        primary={i === 0}
                        onMakePrimary={() => makePrimary(folder)}
                        onRemove={() => removeFolder(folder)}
                      />
                    ))}
                    <li>
                      <MenuAction
                        type="button"
                        onClick={() => setPicking(true)}
                        className="flex w-full items-center gap-2.5 text-left"
                      >
                        <FolderPlus size={15} className="shrink-0" />
                        Add folder
                      </MenuAction>
                    </li>
                  </ul>
                )}

                <p className="text-[11.5px] leading-relaxed text-muted-foreground/80">
                  {primary ? (
                    folders.length > 1 ? (
                      <>Chats start in the primary folder and follow its instructions. They can work in every folder here.</>
                    ) : (
                      <>Chats start in this folder and follow its instructions.</>
                    )
                  ) : trimmedName && planned.data ? (
                    <>
                      A folder is optional. Without one, Ri keeps this agent&apos;s files in{' '}
                      <span className="whitespace-nowrap font-mono text-foreground/80">{planned.data.display}</span>.
                    </>
                  ) : (
                    <>A folder is optional. Without one, Ri makes a folder for this agent&apos;s files.</>
                  )}
                </p>
              </section>

              {personalTools && (
                <Section
                  title={INTEGRATION_LABELS.plural}
                  hint={`Accounts this agent's chats can use. Ri's main chat always has every connected account.`}
                >
                  <IntegrationScopePicker scopes={integrationScopes} onChange={setIntegrationScopes} disabled={createWs.isPending} />
                </Section>
              )}

              {personalTools && (
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span>
                    <span className="block text-[13px] font-medium text-foreground">Agent browser</span>
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground/80">
                      Lets its chats read and act on the web, in the agent browser&apos;s own profile.
                    </span>
                  </span>
                  <Switch checked={browserEnabled} onCheckedChange={setBrowserEnabled} disabled={createWs.isPending} aria-label="Agent browser" />
                </label>
              )}

              {primary && (
                <Section
                  title="Files to copy"
                  hint="In a git repository each chat works in its own copy of the project. These files come along from the primary folder, so the first run has what git leaves out, like .env files. One pattern per line."
                >
                  <FilesToCopySection value={filesToCopy} onChange={setFilesToCopy} cwd={primary} heading={false} />
                </Section>
              )}

              {primary && (
                <section>
                  <MenuAction density="none"
                    type="button"
                    onClick={() => setScriptsOpen((v) => !v)}
                    aria-expanded={scriptsOpen}
                    className="flex w-full items-center justify-between gap-2 text-left"
                  >
                    <span>
                      <span className="block text-[13px] font-medium text-foreground">Worktree scripts</span>
                      <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground/80">
                        {setupCommand.trim() || startCommand.trim() || teardownCommand.trim()
                          ? [setupCommand.trim() && 'Setup', startCommand.trim() && 'Start', teardownCommand.trim() && 'Teardown'].filter(Boolean).join(', ')
                          : 'In a git repository, install, start and clean up each chat\'s copy of the project. Optional.'}
                      </span>
                    </span>
                    {scriptsOpen ? <ChevronDown size={15} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={15} className="shrink-0 text-muted-foreground" />}
                  </MenuAction>
                  {scriptsOpen && (
                    <div className="mt-3">
                      <WorktreeScriptsSection
                        setupCommand={setupCommand}
                        startCommand={startCommand}
                        teardownCommand={teardownCommand}
                        onSetupChange={setSetupCommand}
                        onStartChange={setStartCommand}
                        onTeardownChange={setTeardownCommand}
                        cwd={primary}
                      />
                    </div>
                  )}
                </section>
              )}

              <Section title="Area" hint="Where its tasks and notes belong. Optional.">
                <NativeSelect
                  value={areaId}
                  onChange={(e) => setAreaId(e.target.value)}
                  aria-label="Area"
                  className="w-full"
                >
                  <option value="">None</option>
                  {areas?.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.emoji ? `${area.emoji} ${area.name}` : area.name}
                    </option>
                  ))}
                </NativeSelect>
              </Section>

              {error && (
                <Callout padding="md" density="row" tone={"error"} role="alert" >
                  {error}
                </Callout>
              )}
            </form>

            <div className="flex shrink-0 items-center justify-end gap-2 px-5 pt-2 pb-4">
              <DialogPrimitive.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                >
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!trimmedName || createWs.isPending}
                variant="primary"
                size="md"
                className="flex items-center gap-1.5"
              >
                {createWs.isPending && <Loader2 size={14} className="animate-spin" />}
                Create agent
              </Button>
            </div>
          </Card>
          <FolderPickerDialog
            open={picking}
            onOpenChange={setPicking}
            initialPath={parentOf(folders[folders.length - 1])}
            onChoose={addFolder}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

    </DialogPrimitive.Root>
  );
}

/** One folder in the list: its name (the whole path on hover), Primary or Make primary, and remove. */
function FolderRow({
  folder,
  primary,
  onMakePrimary,
  onRemove,
}: {
  folder: string;
  primary: boolean;
  onMakePrimary: () => void;
  onRemove: () => void;
}) {
  const label = folderName(folder);
  return (
    <li className="group flex items-center gap-2.5 border-b border-border px-3 py-2">
      <Folder size={15} className="shrink-0 text-muted-foreground" />
      <Tip label={folder}>
        <span tabIndex={0} className="min-w-0 flex-1 truncate text-[13px] text-foreground focus:outline-none">
          {label}
        </span>
      </Tip>
      {primary ? (
        <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11.5px] text-muted-foreground">Primary</span>
      ) : (
        <Button
          type="button"
          onClick={onMakePrimary}
          variant="ghost"
          size="sm"
          reveal
          className="shrink-0"
        >
          Make primary
        </Button>
      )}
      <IconButton
        type="button"
        onClick={onRemove}
        label={`Remove ${label}`}
        variant="ghost"
        size="sm"
        className="shrink-0"
      >
        <X size={13} />
      </IconButton>
    </li>
  );
}

/** A setting below the folders: a heading, what it does, and its control. */
function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-[13px] font-medium text-foreground">{title}</h3>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground/80">{hint}</p>
      </div>
      {children}
    </section>
  );
}
