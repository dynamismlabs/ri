import type { DesktopConnectionIssue } from '../src/lib/connection/desktop-contract';
import { DesktopSessionError } from './session-auth';

/** Preserve structured causes across helper IPC instead of guessing from
 * prose or labelling every failure as a sleeping remote computer. */
export function connectionFailure(error: unknown, local = false): DesktopConnectionIssue {
  const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : 'The connection could not be completed. Try again.';
  const problem = (error as { problem?: string } | null)?.problem;
  const code = (error as { code?: string } | null)?.code;
  if (problem === 'unauthorized' || error instanceof DesktopSessionError && ['credential', 'forbidden'].includes(error.code)) {
    if (local) return { kind: 'attention', message: 'The local Ri service needs attention.', detail, retryable: false };
    return { kind: 'sign_in', message: 'This computer needs to sign in again.', detail, retryable: false };
  }
  if (problem === 'app_update') return { kind: 'app_update', message: 'Update the Ri desktop app to keep using this Ri.', detail, retryable: false };
  if (problem === 'untrusted_certificate') {
    return { kind: 'certificate', message: 'Ri could not verify the connection’s certificate.', detail, retryable: false };
  }
  if (problem === 'unreachable' || (code && ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH', 'EAI_AGAIN'].includes(code)) || error instanceof DesktopSessionError && (['network', 'timeout', 'server'].includes(error.code) || error.status === 429)) {
    return { kind: 'network', message: 'Reconnecting to Ri…', detail, retryable: true };
  }
  return { kind: 'attention', message: 'The Ri connection needs attention.', detail, retryable: false };
}

/** A local Home whose start failed and that its controller keeps trying
 * (docs/always-on-spec.md section 6.2). It comes up by itself once the cause
 * is gone, so this is retryable, and the controller's reason is the detail. */
export function retryingStartIssue(reason: string): DesktopConnectionIssue {
  return { kind: 'attention', message: 'Ri couldn’t start. It keeps trying by itself.', detail: reason, retryable: true };
}

/**
 * What a failure does to an automated run (RI_DESKTOP_SMOKE). It must end the
 * run instead of waiting on a person at a modal dialog. A failure Ri retries by
 * itself while it is still starting, such as a Home slow to answer its first
 * sign-in on a slow computer, waits like the app does: the backend tries again
 * in two seconds, and the startup limit still ends the run if it never comes up.
 * `show` is the app's ordinary path, for a person or the recovery smoke.
 */
export function automatedFailure(env: Record<string, string | undefined>, issue: Pick<DesktopConnectionIssue, 'retryable'>, starting: boolean): 'quit' | 'wait' | 'show' {
  if (!env.RI_DESKTOP_SMOKE || env.RI_DESKTOP_RECOVERY_SMOKE) return 'show';
  return issue.retryable && starting ? 'wait' : 'quit';
}
