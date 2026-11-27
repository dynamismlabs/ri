/**
 * A starter's Started chats (docs/started-chats.md): the chats an execution's
 * chats, or an agent's main chat, started, and archiving the finished ones.
 */
import { z } from 'zod/v4';
import { TRPCError } from '@trpc/server';
import { sharedProcedure, router } from '@/lib/trpc/init';
import { listStartedChats } from '@/lib/db/queries';
import { isTeamAuthority } from '@/lib/home/authority';
import { actorFromRequest } from '@/lib/auth/actor';
import { executionAuthority, workspaceAuthority } from '@/lib/workspaces/access';
import type { RequestKey } from '@/lib/auth/request-key';
import type { StartedScope } from './started-chats-archive';

const scopeInput = z.union([
  z.object({ executionId: z.string().min(1).max(128) }).strict(),
  z.object({ workspaceId: z.string().min(1).max(128) }).strict(),
]);

/** An execution's chats, or the agent's main chat by its stable address, after the caller may see them. */
function authorizedScope(key: RequestKey | null, input: z.infer<typeof scopeInput>, operation: 'read' | 'archive'): StartedScope {
  if ('executionId' in input) {
    executionAuthority(key, input.executionId, operation);
    return { executionId: input.executionId };
  }
  workspaceAuthority(key, input.workspaceId, operation);
  return { address: `agent:${input.workspaceId}` };
}

export const startedChatsRouter = router({
  /** Every chat this starter started, newest first, archived included. */
  list: sharedProcedure.input(z.object({ scope: scopeInput }).strict()).query(({ input, ctx }) => {
    const scope = authorizedScope(ctx.key, input.scope, 'read');
    // Coordination is personal: a team's chats start none.
    return isTeamAuthority() ? [] : listStartedChats(scope);
  }),
  /** Archive the finished ones you never wrote in (`isFinishedUntouched`). */
  archiveFinished: sharedProcedure.input(z.object({ scope: scopeInput }).strict()).mutation(async ({ input, ctx }) => {
    const scope = authorizedScope(ctx.key, input.scope, 'archive');
    const { archiveFinishedStartedChats, NO_STARTED_OUTCOME } = await import('./started-chats-archive');
    if (isTeamAuthority()) return NO_STARTED_OUTCOME;
    try {
      return await archiveFinishedStartedChats(scope, actorFromRequest(ctx.request.headers));
    } catch (error) {
      throw new TRPCError({ code: 'CONFLICT', message: error instanceof Error ? error.message : String(error) });
    }
  }),
});
