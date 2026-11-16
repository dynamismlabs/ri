'use client';

/**
 * New agent (docs/agent-folders.md): a name and the folders it works in, the
 * way ChatGPT creates a project. Folders are optional. The first one is the
 * primary folder, where its chats start and whose instructions they follow,
 * and any other can be made primary instead. With none, Ri makes the agent a
 * folder and says where. The name and icon follow the primary folder until
 * the person sets them. Everything else (connectors, browser, scripts, files
 * to copy, area) keeps its default and lives in the agent's Setup.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Folder, FolderPlus, Loader2, Monitor, SmilePlus, X } from 'lucide-react';
import { Dialog as DialogPrimitive, VisuallyHidden } from 'radix-ui';
import { EmojiPicker } from '@/components/shared/emoji-picker';
import { SharedComputerWarning } from '@/components/home/shared-computer-warning';
import { Tip } from '@/components/ui/tip';
import type { Attachment } from '@/db/types';
import { useClientLocation } from '@/hooks/use-client-location';
import { useCreateWorkspace, useNewAgentFolder } from '@/hooks/use-workspaces';
import { apiErrorBody, apiErrorStatus } from '@/lib/api/client';
import { fsApi } from '@/lib/api/fs';
import { coverAttachmentUrl } from '@/lib/attachments/view';
import { agentInitials } from '@/lib/client/agent-initials';
import { folderName } from '@/lib/folders/folder-name';
import { cn } from '@/lib/utils';
import { useAgentConfigurationScope } from './agent-placement-controls';
import { FolderPickerDialog } from './folder-picker-dialog';

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
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        browserEnabled: personalTools,
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
  }, [canConfigure, trimmedName, createWs, primary, folders, emoji, attachment, personalTools, reset, onOpenChange]);

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
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[520px] -translate-x-1/2 -translate-y-1/2 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="flex max-h-[88vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-3">
              <DialogPrimitive.Title className="text-lg font-semibold text-foreground">New agent</DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <button aria-label="Close" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  <X size={16} />
                </button>
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
              <div className="flex items-center rounded-xl border border-border bg-background focus-within:border-foreground/40 focus-within:ring-1 focus-within:ring-foreground/20">
                <EmojiPicker
                  onSelect={(picked) => {
                    setEmoji(picked);
                    setAttachment(null);
                    coverEditedRef.current = true;
                  }}
                >
                  <button
                    type="button"
                    aria-label="Agent icon"
                    className="ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt="" className="h-6 w-6 rounded-md object-cover" />
                    ) : emoji ? (
                      <span className="text-lg leading-none">{emoji}</span>
                    ) : initials ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-foreground/80">{initials}</span>
                    ) : (
                      <SmilePlus size={16} />
                    )}
                  </button>
                </EmojiPicker>
                <span aria-hidden className="mx-1.5 h-5 w-px bg-border" />
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    // A name cleared back to nothing follows the primary folder again.
                    nameEditedRef.current = e.target.value.trim().length > 0;
                  }}
                  placeholder="Agent name"
                  aria-label="Agent name"
                  autoFocus
                  className="h-11 min-w-0 flex-1 bg-transparent pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
                />
              </div>

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
                    <button
                      type="button"
                      onClick={() => setPicking(true)}
                      className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-accent/70"
                    >
                      <FolderPlus size={14} />
                      Add
                    </button>
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
                      <button
                        type="button"
                        onClick={() => setPicking(true)}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                      >
                        <FolderPlus size={15} className="shrink-0" />
                        Add folder
                      </button>
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

              {error && (
                <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                  {error}
                </div>
              )}
            </form>

            <div className="flex shrink-0 items-center justify-end gap-2 px-5 pt-2 pb-4">
              <DialogPrimitive.Close asChild>
                <button type="button" className="rounded-lg px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  Cancel
                </button>
              </DialogPrimitive.Close>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!trimmedName || createWs.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {createWs.isPending && <Loader2 size={14} className="animate-spin" />}
                Create agent
              </button>
            </div>
          </div>
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
        <button
          type="button"
          onClick={onMakePrimary}
          className={cn(
            'shrink-0 rounded-md bg-accent px-2 py-0.5 text-[11.5px] font-medium text-foreground transition-opacity hover:bg-accent/70',
            'opacity-0 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100',
          )}
        >
          Make primary
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="shrink-0 rounded p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
      >
        <X size={13} />
      </button>
    </li>
  );
}
