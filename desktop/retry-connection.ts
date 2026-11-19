/** What Retry asks the local service before Ri connects again (desktop/main.ts,
 * `retryConnection`), from the recovery view or the connection notice. */
import { awaitingRetry, type ServiceStatus } from '../src/lib/service/client';

export interface RetryService {
  status(): Promise<ServiceStatus | null>;
  /** Asks a Home waiting for its next try to try now. */
  restart(): Promise<unknown>;
}

/** A controller busy starting the Home doesn't answer a short control request
 * in time: a new Home's first database work can take longer than that on a slow
 * computer. Busy is no reason to stop. The connection that follows waits for it,
 * as the service's own start does (`ensureServiceStatus`). */
function busy(error: unknown): undefined {
  if ((error as NodeJS.ErrnoException | null)?.code === 'ETIMEDOUT') return undefined;
  throw error;
}

/** Throws only when Retry can't help. Otherwise the caller connects again. */
export async function prepareRetry(service: RetryService): Promise<void> {
  const status = await service.status().catch(busy);
  if (status?.phase === 'failed') throw new Error('The service needs recovery before it can restart.');
  // A Home waiting for its next try after a failed start tries now: whoever
  // pressed this has likely fixed the cause.
  if (awaitingRetry(status)) await service.restart().catch(busy);
}
