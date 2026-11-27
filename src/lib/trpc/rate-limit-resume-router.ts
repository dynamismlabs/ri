import { TRPCError } from '@trpc/server';
import { z } from 'zod/v4';
import { actorFromRequest } from '@/lib/auth/actor';
import { router, viewerProcedure as p } from '@/lib/trpc/init';
import { unwrapOperation, isOperationError, failure } from '@/lib/server/operation';
import { rateLimitRecovery, scheduleRateLimitResume, cancelRateLimitResume } from '@/lib/server/operations/rate-limit-resume';

const id = z.string().min(8).max(100);
const target = z.object({ sessionId: id, eventId: id }).strict();
const person = p.use(({ ctx, next }) => {
  if (actorFromRequest(ctx.request.headers).source === 'ai') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only a person can schedule a resume from this chat.' });
  }
  return next();
});

async function operation<T>(run: () => T | Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) {
    if (!isOperationError(error)) throw error;
    return unwrapOperation(failure(error.body, error.status));
  }
}

export const rateLimitResumeRouter = router({
  get: p.input(target).query(({ input }) => operation(() => rateLimitRecovery(input, true))),
  schedule: person.input(target.extend({
    prompt: z.string().min(1).max(20_000),
    runAt: z.iso.datetime().optional(),
  })).mutation(({ input }) => operation(() => scheduleRateLimitResume(input))),
  cancel: person.input(target).mutation(({ input }) => operation(() => cancelRateLimitResume(input))),
});
