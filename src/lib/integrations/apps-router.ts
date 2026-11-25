import { TRPCError } from '@trpc/server';
import { z } from 'zod/v4';
import { viewerProcedure as p, router } from '@/lib/trpc/init';
import { safeReturnPath } from './oauth-return';
import { getAppSourceForApp } from '@/lib/db/queries';
import { AppBuildError } from '@/lib/apps/builder';
import { removeApp } from '@/lib/apps/remove';
import { ACCESS_KINDS, allowPlaceHere, placeAccess } from '@/lib/apps/host-access';
import { appHub, approveAppHub, beginAppHub, hubAuthorization, offerRiHub } from '@/lib/apps/hub-connect';

/** Remove an app Ri installed, its kit's refusals said as this router says its own. */
async function removeAppWithBuildErrors(sourceId: string, turnOffAccess?: boolean) {
  try { return await removeApp(sourceId, { turnOffAccess }); }
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
const authorizationUrl = z.string().min(1).max(8192);

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
  // What a place may do in an app, asked in Ri's own dialog when Ri installed the app, and allowing
  // it there without a browser (src/lib/apps/host-access.ts). Otherwise the app's own page asks.
  accessChoices: p.input(z.object({ serverId: id }).strict()).query(({ input }) => run(() => placeAccess(input.serverId))),
  allowHere: p.input(z.object({ serverId: id, access: z.enum(ACCESS_KINDS) }).strict())
    .mutation(({ input }) => run(() => allowPlaceHere(input.serverId, input.access))),
  // Lending an app Ri installed the person's accounts through Ri's hub, chosen in Ri's own dialog
  // instead of the consent page in a browser (src/lib/apps/hub-connect.ts).
  hub: p.input(z.object({ appId: id }).strict()).query(({ input }) => run(() => appHub(input.appId))),
  hubBegin: p.input(z.object({ appId: id }).strict()).mutation(({ input }) => run(() => beginAppHub(input.appId))),
  hubOffer: p.input(z.object({ serverId: id }).strict()).mutation(({ input }) => offerRiHub(input.serverId)),
  hubAuthorization: p.input(z.object({ authorizationUrl, serverId: id.optional() }).strict())
    .query(({ input }) => run(() => hubAuthorization(input.authorizationUrl, input.serverId))),
  hubApprove: p.input(z.object({
    authorizationUrl, serverId: id.optional(),
    tools: z.record(z.string().max(200), z.array(z.string().max(200)).max(500)),
    services: z.array(z.string().max(100)).max(50),
  }).strict()).mutation(({ input }) => run(() => approveAppHub(input.authorizationUrl, { tools: input.tools, services: input.services }, input.serverId))),
  disallow: p.input(z.object({ appId: id, workspaceId: id }).strict())
    .mutation(({ input }) => run(() => removePersonalAppFromAgent(input))),
  // An app Ri installed is uninstalled too, keeping its folder and data (src/lib/apps/remove.ts).
  // One added by its address is only disconnected: it runs on its own.
  // `turnOffAccess`: an installed app whose folder is gone may keep running, so the person may turn off its hub access too.
  remove: p.input(z.object({ appId: id, turnOffAccess: z.boolean().optional() }).strict()).mutation(({ input }) => run(async () => {
    const source = getAppSourceForApp(input.appId);
    if (source?.createdByRi) return removeAppWithBuildErrors(source.id, input.turnOffAccess);
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
