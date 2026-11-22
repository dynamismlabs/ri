'use client';
import { MenuAction } from '@/components/system/menu-action';

import { StatusBadge } from '@/components/system/status-badge';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppWindow, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/system/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/system/menu';
import { Tip } from '@/components/ui/tip';
import { useOptionalDashboard } from '@/contexts/dashboard-context';
import {
  fileExtension,
  launchConnectedFile,
  showConnectedCapture,
  type FileLaunchApproval,
} from '@/lib/client/mcp-app-file';
import { useConnectedCompanion } from '@/lib/client/mcp-app-panel';
import { trpcClient } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/router';
import { connectedAppsQuery } from './catalog';

type App = RouterOutputs['connectedApps']['catalog'][number];
/** A file the person can open with an app: a chat attachment, a file in an agent's folder, or one in an execution's worktree. */
export type OpenWithFile =
  | { kind: 'attachment'; fileName: string; name: string }
  | { kind: 'agent-file'; workspaceId: string; path: string; name: string }
  | { kind: 'session-file'; sessionId: string; path: string; name: string };
export interface FileApp {
  app: App;
  tool: string;
  title: string;
  label: string;
}

/**
 * The connected apps whose file entrypoint (OpenAI's MCP extensions spec)
 * lists this file's extension, on accounts that can open it now. A product
 * with several accounts names the account too.
 */
export function fileAppsFor(apps: readonly App[] | undefined, name: string): FileApp[] {
  const extension = fileExtension(name);
  if (!extension || !apps) return [];
  const matches = apps
    .filter((app) => app.available)
    .flatMap((app) =>
      app.files.filter((entry) => entry.extensions.includes(extension)).map((entry) => ({ app, entry })),
    );
  return matches.map(({ app, entry }) => {
    const several = matches.filter((other) => other.app.toolkitName === app.toolkitName).length > 1;
    return {
      app,
      tool: entry.name,
      title: entry.title,
      label: several ? `${app.toolkitName} · ${app.account}` : app.toolkitName,
    };
  });
}

/**
 * "Open with <app>" for a file. Beside a chat, the app opens in the pane at
 * its side, as a tab of that chat. Elsewhere it opens the app's page full
 * screen. Opening calls the app's file entrypoint through the ordinary
 * approval gate, and the app reaches the file only through Ri: it never sees
 * a path on this computer.
 */
export function useOpenWithApp(file: OpenWithFile | null) {
  const companion = useConnectedCompanion();
  const dashboard = useOptionalDashboard();
  const catalog = useQuery({ ...connectedAppsQuery(), enabled: !!file && !!fileExtension(file.name) });
  const apps = file ? fileAppsFor(catalog.data, file.name) : [];
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<
    (FileLaunchApproval & { app: FileApp; answer: (allow: boolean) => void }) | null
  >(null);
  // A chat's file opens beside that chat. An agent's own folder has no chat, so its file opens full screen.
  const besideChat = !file || file.kind === 'agent-file' ? null : (companion?.chatId ?? null);

  const open = async (choice: FileApp) => {
    if (!file) return;
    setBusy(true);
    try {
      const { handle } = await trpcClient.connectedApps.files.handle.mutate(
        file.kind === 'attachment'
          ? { kind: 'attachment', fileName: file.fileName, name: file.name }
          : file.kind === 'agent-file'
            ? { kind: 'agent-file', workspaceId: file.workspaceId, path: file.path }
            : { kind: 'session-file', sessionId: file.sessionId, path: file.path },
      );
      const launch = (chatId: string | null) =>
        launchConnectedFile({
          serverId: choice.app.id,
          tool: choice.tool,
          handle,
          chatId,
          ask: (request, signal) =>
            new Promise<boolean>((resolve) => {
              const answer = (allow: boolean) => {
                setApproval(null);
                resolve(allow);
              };
              signal.addEventListener('abort', () => answer(false), { once: true });
              setApproval({ ...request, app: choice, answer });
            }),
        });
      let chatId = besideChat;
      let captureId: string;
      try {
        captureId = await launch(chatId);
      } catch (error) {
        // The chat's agent may not use this app. The person can still open their file in it, full screen,
        // where nothing it does reaches that chat.
        if (!chatId || !(error instanceof Error) || !/not available to this chat/.test(error.message))
          throw error;
        chatId = null;
        captureId = await launch(null);
      }
      showConnectedCapture(
        { captureId, serverId: choice.app.id, chatId },
        { companion, setActiveView: dashboard?.setActiveView },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${choice.label} could not open ${file.name}`);
    } finally {
      setBusy(false);
    }
  };

  return { apps, busy, approval, open, fileName: file?.name ?? '' };
}

type OpenWithController = ReturnType<typeof useOpenWithApp>;

/** Inline and overflow presentations share one launch and approval state. */
export function OpenWithAppActions({
  controller,
  menu = false,
}: {
  controller: OpenWithController;
  menu?: boolean;
}) {
  const { apps, busy, open, fileName } = controller;
  if (!apps.length) return null;
  if (menu)
    return (
      <>
        {apps.map((choice) => (
          <MenuAction kind="menu"
            key={`${choice.app.id}:${choice.tool}`}
            disabled={busy}
            onSelect={() => void open(choice)}
          >
            <AppWindow size={14} />
            Open with {choice.label}
          </MenuAction>
        ))}
      </>
    );
  const icon = busy ? <Loader2 size={12} className="animate-spin" /> : <AppWindow size={12} />;
  return (
    <>
      {apps.length === 1 ? (
        <Tip label={`Opens ${fileName} in ${apps[0].title}`} onlyWhenTextHidden>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void open(apps[0])}
            variant="ghost"
            size="xs"
            className="gap-1"
          >
            {icon}
            <span className="truncate">Open with {apps[0].label}</span>
          </Button>
        </Tip>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" disabled={busy} variant="ghost" size="xs" className="gap-1">
              {icon}Open with
              <ChevronDown size={11} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {apps.map((choice) => (
              <MenuAction kind="menu" key={`${choice.app.id}:${choice.tool}`} onSelect={() => void open(choice)}>
                {choice.label}
              </MenuAction>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}

/** Kept outside the menu, so closing it cannot unmount an approval in flight. */
export function OpenWithAppApproval({ controller }: { controller: OpenWithController }) {
  const { approval, fileName } = controller;
  return (
    <>
      {approval && (
        <StatusBadge tone={"warning"}
          role="group"
          aria-label={`Allow ${approval.app.label} to open ${fileName}`}
          className="mt-1 block space-y-2"
        >
          <span className="block">
            Allow {approval.app.label} to open {fileName}?
          </span>
          {approval.preview != null && (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-[11px]">
              {JSON.stringify(approval.preview, null, 2)}
            </pre>
          )}
          <span className="flex gap-2">
            <Button type="button" onClick={() => approval.answer(true)} variant="primary" size="md">
              Allow once
            </Button>
            <Button type="button" onClick={() => approval.answer(false)} variant="ghost" size="xs">
              Decline
            </Button>
          </span>
        </StatusBadge>
      )}
    </>
  );
}

export function OpenWithApp({ file, className }: { file: OpenWithFile; className?: string }) {
  const controller = useOpenWithApp(file);
  if (!controller.apps.length) return null;
  return (
    <span className={className}>
      <OpenWithAppActions controller={controller} />
      <OpenWithAppApproval controller={controller} />
    </span>
  );
}
