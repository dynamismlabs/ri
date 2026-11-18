import { TRPCError } from '@trpc/server';
import { z } from 'zod/v4';
import { viewerProcedure as p, router } from '@/lib/trpc/init';
import { safeReturnPath } from './oauth-return';
import { getAppSourceForApp } from '@/lib/db/queries';
import { AppBuildError } from '@/lib/apps/builder';
import { removeApp } from '@/lib/apps/remove';

/** Remove an app Ri installed, its kit's refusals said as this router says its own. */
async function removeAppWithBuildErrors(sourceId: string) {
  try { return await removeApp(sourceId); }
  catch (error) {
    if (error instanceof AppBuildError) throw new PersonalAppError(error.code === 'setup' ? 'invalid' : error.code, error.message);
    throw error;
  }
}
import { chatAppTools, setAppToolMode } from './app-tools';
import { AppPromptError, chatAppPrompts, getChatAppPrompt, MAX_PROMPT_ARGUMENT_CHARS, MAX_PROMPT_ARGUMENTS } from './app-prompts';
import {
  addPersonalApp, allowPersonalAppInAgent, getPersonalApp, listPersonalApps, PersonalAppError,
  removePersonalApp, removePersonalAppFromAgent,
} from './apps';

/** Personal apps: add one, allow it in an agent with its own connection, remove either (docs/personal-apps.md). */
const id = z.string().min(1).max(200);
const returnTo = z.string().max(2048).optional();

async function run<T>(operation: () => Promise<T> | T): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof PersonalAppError) {
      throw new TRPCError({ code: error.code === 'not_found' ? 'NOT_FOUND' : error.code === 'conflict' ? 'CONFLICT' : 'BAD_REQUEST', message: error.message });
    }
    if (error instanceof AppPromptError) {
      throw new TRPCError({ code: error.code === 'not_found' ? 'NOT_FOUND' : error.code === 'invalid' ? 'BAD_REQUEST' : 'SERVICE_UNAVAILABLE', message: error.message });
    }
    throw error;
  }
}

export const personalAppsRouter = router({
  list: p.query(() => listPersonalApps()),
  get: p.input(z.object({ appId: id }).strict()).query(({ input }) => run(() => getPersonalApp(input.appId))),
  add: p.input(z.object({ name: z.string().max(200), url: z.string().max(2048), returnTo }).strict())
    .mutation(({ input, ctx }) => run(() => addPersonalApp({ ...input, returnTo: safeReturnPath(input.returnTo) ?? undefined }, ctx.request))),
  allow: p.input(z.object({ appId: id, workspaceId: id, returnTo }).strict())
    .mutation(({ input, ctx }) => run(() => allowPersonalAppInAgent({ ...input, returnTo: safeReturnPath(input.returnTo) ?? undefined }, ctx.request))),
  disallow: p.input(z.object({ appId: id, workspaceId: id }).strict())
    .mutation(({ input }) => run(() => removePersonalAppFromAgent(input))),
  // An app Ri installed is uninstalled too, keeping its folder and data (src/lib/apps/remove.ts).
  // One added by its address is only disconnected: it runs on its own.
  remove: p.input(z.object({ appId: id }).strict()).mutation(({ input }) => run(async () => {
    const source = getAppSourceForApp(input.appId);
    if (source?.createdByRi) return removeAppWithBuildErrors(source.id);
    await removePersonalApp(input.appId);
    return null;
  })),
  /** The apps a chat may use, each on, automatic or off for it (docs/personal-apps.md "Loading app tools"). */
  chatTools: p.input(z.object({ chatId: id }).strict()).query(({ input }) => chatAppTools(input.chatId)),
  setChatTool: p.input(z.object({ chatId: id, toolkitId: id, mode: z.enum(['on', 'auto', 'off']) }).strict())
    .mutation(async ({ input }) => { await setAppToolMode(input.chatId, input.toolkitId, input.mode); return chatAppTools(input.chatId); }),
  /** The prompts of the apps this chat can use, for its `/` menu (app-prompts.ts). */
  chatPrompts: p.input(z.object({ chatId: id }).strict()).query(({ input }) => run(() => chatAppPrompts(input.chatId))),
  /** One prompt filled in with the person's arguments, for the draft. Never sent. */
  getChatPrompt: p.input(z.object({
    chatId: id, serverId: id, name: z.string().min(1).max(200),
    arguments: z.record(z.string().max(100), z.string().max(MAX_PROMPT_ARGUMENT_CHARS))
      .refine((value) => Object.keys(value).length <= MAX_PROMPT_ARGUMENTS).optional(),
  }).strict()).mutation(({ input }) => run(() => getChatAppPrompt(input.chatId, input.serverId, input.name, input.arguments))),
});
