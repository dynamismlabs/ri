/**
 * A personal app's prompts in a chat's composer (docs/personal-apps.md, "Prompts"): the requests an
 * app ships for the person to start, such as People's "Prepare for a meeting". The `/` menu lists
 * the prompts of every app the chat can use on its place's own connection (not those switched Off
 * in the chat). Picking one asks the app for its text (`prompts/get`) with the arguments the person
 * filled in, and the text lands in the draft as text they edit and send themselves, never sent for
 * them: agents act with the person's access, so the person reads every word first.
 *
 * Each connection's list is kept until the app says its prompts changed (`McpPromptCache`).
 */
import type { McpPromptDef, McpPromptResult } from '@integrations/engine/mcp';
import { getChatSession } from '@/lib/db/queries';
import { encodeSource } from '@/lib/chat-sources/reference';
import { appToolMode } from './app-tools';
import { isAppToolkitId } from './app-ids';
import { hostedMcpConnectionId } from './hosted-mcp';
import type { McpServerEntry } from './mcp-servers';
import { promptArgumentLabel } from './prompt-argument-label';

/** Prompts one app may list in the menu, and arguments one prompt may take. */
export const MAX_APP_PROMPTS = 50;
export const MAX_PROMPT_ARGUMENTS = 20;
/** One argument's value, as the person types it. */
export const MAX_PROMPT_ARGUMENT_CHARS = 4_000;
/** What one prompt's messages may hold in all, files included. */
export const MAX_PROMPT_RESULT_BYTES = 8 * 1024 * 1024;
const MAX_PROMPT_MESSAGES = 50;

export interface AppPromptArgument {
  name: string;
  title?: string;
  description?: string;
  required: boolean;
}

/** One prompt as the composer shows it. `command` is what the `/` menu matches: `<app>:<prompt>`. */
export interface ChatAppPrompt {
  serverId: string;
  toolkitId: string;
  app: string;
  command: string;
  name: string;
  title?: string;
  description?: string;
  arguments: AppPromptArgument[];
}

/** A content block as the composer takes an app's message: text, image, resource link or embedded resource. */
export type AppPromptBlock = { type: string; [key: string]: unknown };

/** What a picked prompt puts in the draft: the app's chip, then its messages' blocks in order. */
export interface AppPromptDraft {
  app: string;
  /** The app's account chip for this chat, so its tools come with the message. */
  sourceRef: string | null;
  blocks: AppPromptBlock[];
}

export class AppPromptError extends Error {
  constructor(readonly code: 'not_found' | 'invalid' | 'unavailable', message: string) {
    super(message);
    this.name = 'AppPromptError';
  }
}

const text = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;

/** A server's prompts as the menu lists them: valid names only, bounded, in the server's order. */
export function menuPrompts(prompts: readonly McpPromptDef[], app: { serverId: string; toolkitId: string; name: string; slug: string }): ChatAppPrompt[] {
  const out: ChatAppPrompt[] = [];
  const seen = new Set<string>();
  const appCommand = app.slug.replace(/_/g, '-');
  for (const prompt of prompts) {
    const name = typeof prompt.name === 'string' ? prompt.name : '';
    if (!name || name.length > 200 || /[\u0000-\u001f\u007f]/.test(name) || seen.has(name)) continue;
    seen.add(name);
    const args = Array.isArray(prompt.arguments) ? prompt.arguments : [];
    out.push({
      serverId: app.serverId, toolkitId: app.toolkitId, app: app.name,
      command: `${appCommand}:${name.replace(/\s+/g, '-')}`,
      name,
      ...(text(prompt.title, 200) ? { title: text(prompt.title, 200) } : {}),
      ...(text(prompt.description, 500) ? { description: text(prompt.description, 500) } : {}),
      arguments: args.slice(0, MAX_PROMPT_ARGUMENTS).flatMap((arg) => {
        const argName = text(arg?.name, 100);
        if (!argName) return [];
        return [{
          name: argName,
          ...(text(arg.title, 200) ? { title: text(arg.title, 200) } : {}),
          ...(text(arg.description, 300) ? { description: text(arg.description, 300) } : {}),
          required: arg.required === true,
        }];
      }),
    });
    if (out.length >= MAX_APP_PROMPTS) break;
  }
  return out;
}

/**
 * The arguments to send: only the ones the prompt declares, each a string within bounds, with every
 * required one present. Blank optional ones are left out, as an unanswered form field is.
 */
export function promptArguments(prompt: Pick<ChatAppPrompt, 'arguments' | 'title' | 'name'>, given: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of prompt.arguments) {
    const value = given[arg.name];
    if (typeof value === 'string' && value.length > MAX_PROMPT_ARGUMENT_CHARS) throw new AppPromptError('invalid', `${promptArgumentLabel(arg)} is too long.`);
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) {
      if (arg.required) throw new AppPromptError('invalid', `${prompt.title ?? prompt.name} needs ${promptArgumentLabel(arg)}.`);
      continue;
    }
    out[arg.name] = trimmed;
  }
  return out;
}

/**
 * A prompt's messages as composer blocks, in order. Text, images and resources pass through as an
 * app's `ui/message` content does (src/lib/client/app-message.ts). Audio becomes an attached file.
 * A message from the assistant role stays visible as a titled item, since the person sends the
 * whole draft as their own message. Anything else is named, not dropped silently.
 */
export function promptBlocks(result: McpPromptResult): AppPromptBlock[] {
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_PROMPT_RESULT_BYTES) {
    throw new AppPromptError('invalid', 'The app’s prompt is larger than Ri puts in a draft.');
  }
  const messages = Array.isArray(result.messages) ? result.messages.slice(0, MAX_PROMPT_MESSAGES) : [];
  const blocks: AppPromptBlock[] = [];
  messages.forEach((message, index) => {
    const content = message?.content && typeof message.content === 'object' ? message.content as AppPromptBlock : null;
    if (!content) return;
    if (index > 0 && blocks.length) blocks.push({ type: 'text', text: '\n\n' });
    const assistant = message.role === 'assistant';
    if (content.type === 'text' && typeof content.text === 'string') {
      blocks.push(assistant ? { type: 'text', text: content.text, _meta: { 'openai/title': 'Assistant turn' } } : { type: 'text', text: content.text });
    } else if (content.type === 'image' || content.type === 'resource' || content.type === 'resource_link') {
      blocks.push(content);
    } else if (content.type === 'audio' && typeof content.data === 'string' && typeof content.mimeType === 'string') {
      blocks.push({ type: 'resource', resource: { uri: 'audio', mimeType: content.mimeType, blob: content.data } });
    } else {
      blocks.push({ type: 'text', text: `[The app included ${typeof content.type === 'string' ? content.type : 'content'} that Ri can’t put in a draft]` });
    }
  });
  return blocks;
}

interface UsableApp { serverId: string; toolkitId: string; name: string; slug: string; connectionId: string; entry: McpServerEntry }

/** The apps this chat may use on its place's own connection, not switched Off here, by server entry. */
async function usableApps(chatId: string): Promise<{ apps: UsableApp[]; connections: { id: string; accountId: string; authConfigId?: string | null }[] }> {
  const chat = getChatSession(chatId);
  if (!chat) throw new AppPromptError('not_found', 'That chat isn’t here anymore.');
  const { getIntegrationRuntime, getIntegrationOwnerId, getMcpServerStore, resolveWorkspaceIntegrationFilter } = await import('./runtime');
  const { resolveRiIntegrationFilter } = await import('./workspace-filter');
  const runtime = await getIntegrationRuntime({ stale: true });
  const ownerId = getIntegrationOwnerId();
  const place = chat.workspaceId
    ? await resolveWorkspaceIntegrationFilter(chat.workspaceId, ownerId, runtime)
    : await resolveRiIntegrationFilter(runtime, ownerId);
  const entries = getMcpServerStore().list();
  const apps: UsableApp[] = [];
  for (const toolkitId of place.toolkits) {
    const connectionId = place.connectionPins[toolkitId];
    if (!isAppToolkitId(toolkitId) || !connectionId || appToolMode(chat.appTools, toolkitId) === 'off') continue;
    const entry = entries.find((candidate) => candidate.app && hostedMcpConnectionId(candidate) === connectionId);
    if (!entry?.app || !entry.enabled) continue;
    apps.push({ serverId: entry.id, toolkitId, name: entry.app.name, slug: entry.app.slug, connectionId, entry });
  }
  return { apps: apps.sort((a, b) => a.name.localeCompare(b.name)), connections: await runtime.listConnections({ ownerId }) };
}

/** The server's view of its current connection, from the current build, or null when it's down. */
async function promptView(serverId: string) {
  const { getMcpServerStore, getMcpViewAuthority } = await import('./runtime');
  const { isCurrentMcpTransport } = await import('./mcp-lifecycle');
  const { view, connections } = await getMcpViewAuthority(serverId, { stale: true });
  if (!view || !isCurrentMcpTransport(view.snapshot, getMcpServerStore())) return null;
  return connections.some((connection) => connection.id === hostedMcpConnectionId(view.snapshot) && connection.status === 'active') ? view : null;
}

/** Every prompt the chat's apps offer. An app that is down or offers none lists nothing. */
export async function chatAppPrompts(chatId: string): Promise<ChatAppPrompt[]> {
  const { apps } = await usableApps(chatId);
  const lists = await Promise.all(apps.map(async (app) => {
    const view = await promptView(app.serverId).catch(() => null);
    if (!view) return [];
    const prompts = await view.listPrompts().catch((error: unknown) => {
      console.warn(`[app-prompts] ${app.name} didn't list its prompts:`, error instanceof Error ? error.message : error);
      return [];
    });
    return menuPrompts(prompts, app);
  }));
  return lists.flat();
}

/** One prompt filled in for the draft, through the chat's own connection to the app. */
export async function getChatAppPrompt(chatId: string, serverId: string, name: string, given: Record<string, string> = {}): Promise<AppPromptDraft> {
  const { apps, connections } = await usableApps(chatId);
  const app = apps.find((candidate) => candidate.serverId === serverId);
  if (!app) throw new AppPromptError('not_found', 'This chat can’t use that app.');
  const view = await promptView(serverId);
  if (!view) throw new AppPromptError('unavailable', `${app.name} isn’t reachable right now. Try again in a moment.`);
  const prompt = menuPrompts(await view.listPrompts(), app).find((candidate) => candidate.name === name);
  if (!prompt) throw new AppPromptError('not_found', `${app.name} no longer offers that prompt.`);
  const result = await view.getPrompt({ name, arguments: promptArguments(prompt, given) }).catch((error: unknown) => {
    // The app's own refusal ("No one called … is in People") is what the person needs to read.
    throw new AppPromptError('unavailable', error instanceof Error && error.message ? error.message.replace(/^MCP error -?\d+:\s*/, '') : `${app.name} couldn’t fill in that prompt.`);
  });
  const connection = connections.find((candidate) => candidate.id === app.connectionId);
  const sourceRef = connection
    ? encodeSource({ v: 1, kind: 'integration', toolkitId: app.toolkitId, account: { accountId: connection.accountId, authConfigId: connection.authConfigId ?? null } })
    : null;
  return { app: app.name, sourceRef, blocks: promptBlocks(result) };
}
