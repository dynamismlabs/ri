/**
 * What started a hub call (docs/personal-apps.md "The hub"), for its audit entry and for where its
 * approval shows. None of this is access: the grant alone decides what a call may do.
 *
 * A chat (or the person) is named only when the call is verifiably tied to it. When Ri calls an
 * app's tool for a chat, it adds a signed invocation context to the call's `_meta`
 * (`ri/invocation`): who Ri is acting for, the app's address, and a 15 minute expiry, signed with
 * the home's local token. An app that passes that context back in the `_meta` of the hub calls it
 * makes while handling the tool call gets them attributed to that chat. Ri never guesses from
 * timing or a shared address: two apps on one host, or an app's own background work during a
 * chat's call, would be credited to the wrong chat.
 *
 * A job names itself in `_meta` (`app/job`, `app/jobRun`), as the kit's connector client does.
 * That's the app's own word, recorded as the app's job. Anything else is the app on its own.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import { APP_SHORT_ID } from '@/constants/app';
import { readAuthConfig } from '@/lib/auth/config-file';
import { processState } from '@/lib/process-state';

export interface StartedBy {
  kind: 'chat' | 'person' | 'job' | 'app';
  /** The chat ID, or the job's run. */
  id?: string;
  /** The job's name, or the chat's, for the log. */
  label?: string;
}

/** The `_meta` key Ri's invocation context travels under, to the app and back. */
export const INVOCATION_META = 'ri/invocation';
/** How long an app may keep using the context of one tool call for its hub calls. */
export const INVOCATION_TTL_MS = 15 * 60_000;

/** Who Ri is calling an app for, through the async work of one request. */
const current = () => processState('hub.origin.current', () => new AsyncLocalStorage<StartedBy>());

/** Run Ri's work for a chat or the person, so the app calls it makes carry who they're for. */
export function withStartedBy<T>(startedBy: StartedBy, work: () => T): T {
  return current().run(startedBy, work);
}

/** An app's address, as one key whatever loopback name it was reached by. */
export function appOrigin(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ? 'loopback' : parsed.hostname;
    return `${parsed.protocol}//${host}:${parsed.port || (parsed.protocol === 'https:' ? '443' : '80')}`;
  } catch { return null; }
}

interface InvocationClaims { k: 'chat' | 'person'; i?: string; o: string; e: number }

function sign(body: string, key: string): string {
  return crypto.createHmac('sha256', key).update(`${APP_SHORT_ID}-app-invocation:${body}`).digest('base64url');
}

/** A signed invocation context naming who Ri calls `appUrl` for. Null before the home has a local token. */
export function invocationContext(startedBy: StartedBy, appUrl: string, options: { key?: string | null; now?: number } = {}): string | null {
  const key = options.key === undefined ? readAuthConfig()?.localToken : options.key;
  const origin = appOrigin(appUrl);
  if (!key || !origin || (startedBy.kind !== 'chat' && startedBy.kind !== 'person')) return null;
  const claims: InvocationClaims = { k: startedBy.kind, ...(startedBy.id ? { i: startedBy.id } : {}), o: origin, e: (options.now ?? Date.now()) + INVOCATION_TTL_MS };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${sign(body, key)}`;
}

/** The `_meta` to add to Ri's call into an app, when Ri is acting for a chat or the person. */
export function invocationMeta(appUrl: string): Record<string, string> | undefined {
  const startedBy = current().getStore();
  const context = startedBy ? invocationContext(startedBy, appUrl) : null;
  return context ? { [INVOCATION_META]: context } : undefined;
}

/** Who a context names, if it verifies, hasn't expired and was issued for one of these addresses. */
export function verifyInvocation(value: unknown, appUrls: readonly (string | null | undefined)[], options: { key?: string | null; now?: number } = {}): StartedBy | null {
  const key = options.key === undefined ? readAuthConfig()?.localToken : options.key;
  if (typeof value !== 'string' || !key || value.length > 2048) return null;
  const dot = value.indexOf('.');
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(body, key));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let claims: InvocationClaims;
  try { claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as InvocationClaims; } catch { return null; }
  if (typeof claims.e !== 'number' || claims.e < (options.now ?? Date.now())) return null;
  // Issued for this app: a context handed to another app names nothing there.
  const origins = new Set(appUrls.map(appOrigin).filter((origin): origin is string => !!origin));
  if (!origins.has(claims.o)) return null;
  if (claims.k === 'chat' && typeof claims.i === 'string' && claims.i) return { kind: 'chat', id: claims.i };
  if (claims.k === 'person') return { kind: 'person' };
  return null;
}

/**
 * What started a hub call from an app at these addresses: the chat or person a valid invocation
 * context names, else the job the app says it is running, else the app on its own.
 */
export function startedByFor(appUrls: readonly (string | null | undefined)[], meta: Record<string, unknown> | undefined): StartedBy {
  const verified = verifyInvocation(meta?.[INVOCATION_META], appUrls);
  if (verified) return verified;
  const job = typeof meta?.['app/job'] === 'string' ? (meta['app/job'] as string).slice(0, 120) : null;
  if (job) {
    const run = typeof meta?.['app/jobRun'] === 'string' ? (meta['app/jobRun'] as string).slice(0, 120) : undefined;
    return { kind: 'job', label: job, ...(run ? { id: run } : {}) };
  }
  return { kind: 'app' };
}
