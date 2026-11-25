/**
 * Allowing Ri in an app it installed, without a browser (docs/personal-apps.md "Allowing Ri in an
 * app").
 *
 * An app's consent screen is a page at the app's own loopback address, which only a browser on the
 * Home's computer can open. So for an app Ri installed, the app kit offers its host a grant instead:
 * the app's server keeps a secret in its data directory (the host key, whose path the kit's status
 * reports as `hostKeyPath`), and with it Ri may ask the app for its consent choices, in the app's own
 * words, and approve one of them for an authorization Ri's own OAuth client started. Ri shows the
 * choices in its own dialog, then finishes the connection on its server exactly as its OAuth callback
 * does, PKCE included. Tokens and refresh are as before.
 *
 * Ri only ever sends the key over loopback, to the address it installed the app at, and only a key
 * from the file the kit names in the app's data directory. This is the one file of an app's data
 * directory Ri reads. An app without the grant (an older kit), or one that asks the person to sign
 * in first, keeps its browser consent screen.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { z } from 'zod/v4';
import { getAppSourceForApp, type AppSourceRecord } from '@/lib/db/queries';
import { PersonalAppError, placeName } from '@/lib/integrations/apps';
import { beginMcpAuthorization, completeMcpAuthorization } from '@/lib/integrations/mcp-authorization';
import type { McpServerEntry } from '@/lib/integrations/mcp-servers';
import { getMcpServerStore } from '@/lib/integrations/runtime';
import { homeComputerName } from './home-computer';
import { appStatus } from './status';

export const ACCESS_KINDS = ['write', 'read', 'add'] as const;
export type AccessKind = typeof ACCESS_KINDS[number];
export interface AccessChoice { access: AccessKind; label: string; description: string }

/** Where the kit serves the grant, on the app's own address. */
export const HOST_CHOICES_PATH = '/api/host/access-choices';
export const HOST_APPROVE_PATH = '/api/host/approve';
/** The file the kit keeps the key in, and the key: 32 random bytes, base64url. */
const HOST_KEY_FILE = 'host-key';
const HOST_KEY = /^[A-Za-z0-9_-]{43}$/;
const MAX_ANSWER_BYTES = 64 * 1024;

const ChoicesAnswer = z.object({
  choices: z.array(z.object({
    access: z.enum(ACCESS_KINDS), label: z.string().trim().min(1).max(120), description: z.string().trim().max(500),
  })).min(1).max(8),
  recommended: z.enum(ACCESS_KINDS),
});
const ApproveAnswer = z.object({ redirectTo: z.string().min(1).max(8192) });

/**
 * Why Ri can't ask in its own dialog, so the person allows it on the app's own page:
 * - `not_installed_by_ri`: added by its address, so Ri holds no key for it.
 * - `no_endpoint`: made with a kit from before the grant. Updating the app brings it.
 * - `sign_in_required`: the app has an owner account, so the person signs in on its page.
 * - `unavailable`: the app didn't answer as the kit does, so Ri leaves it to the page.
 */
export type BrowserReason = 'not_installed_by_ri' | 'no_endpoint' | 'sign_in_required' | 'unavailable';

interface PlaceAccessBase {
  appName: string;
  /** `Ri`, or the agent the connection is for. */
  placeName: string;
  /** The computer the app runs on, whose browser alone can open a loopback consent page. */
  homeComputer: string | null;
  /** The app's consent page is on a loopback address, so only that computer's browser opens it. */
  loopbackOnly: boolean;
}

export type PlaceAccess = PlaceAccessBase & (
  | { kind: 'host'; choices: AccessChoice[]; recommended: AccessKind }
  | { kind: 'browser'; reason: BrowserReason }
);

export type AllowResult = (PlaceAccessBase & { connected: true }) | (PlaceAccessBase & { connected: false; kind: 'browser'; reason: BrowserReason });

export interface Host { origin: string; key: string }

/** `http://127.0.0.1:<port>` and its aliases, or null for any other address. */
export function loopbackOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' || url.username || url.password || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return null;
    return url.origin;
  } catch { return null; }
}

/**
 * The host key at `file`, or null unless it's exactly what the kit writes: a file named `host-key`
 * in the app's data directory (when Ri knows it), small, holding one key. Anything else is never
 * read whole or sent anywhere.
 */
export function readHostKey(file: string, dataDir: string | null): string | null {
  if (!path.isAbsolute(file) || path.basename(file) !== HOST_KEY_FILE) return null;
  if (dataDir && path.dirname(path.resolve(/* turbopackIgnore: true */ file)) !== path.resolve(/* turbopackIgnore: true */ dataDir)) return null;
  try {
    const stat = fs.lstatSync(/* turbopackIgnore: true */ file);
    if (!stat.isFile() || stat.size > 128) return null;
    const key = fs.readFileSync(/* turbopackIgnore: true */ file, 'utf8').trim();
    return HOST_KEY.test(key) ? key : null;
  } catch { return null; }
}

function placeEntry(serverId: string): McpServerEntry {
  const entry = getMcpServerStore().get(serverId);
  if (!entry?.app || entry.auth.kind !== 'oauth') throw new PersonalAppError('not_found', 'This app isn’t connected anymore.');
  return entry;
}

function describe(entry: McpServerEntry): PlaceAccessBase {
  return { appName: entry.app!.name, placeName: placeName(entry.app!.place), homeComputer: homeComputerName(), loopbackOnly: !!loopbackOrigin(entry.url) };
}

/** The app's grant, when Ri installed it at this address and its kit reports a host key. */
async function hostFor(entry: McpServerEntry): Promise<Host | BrowserReason> {
  const source = getAppSourceForApp(entry.app!.id);
  const origin = loopbackOrigin(entry.url);
  if (!origin || !source?.url || origin !== loopbackOrigin(source.url)) return 'not_installed_by_ri';
  return installedAppHost(source);
}

/**
 * An app Ri installed on this computer, at its loopback address, with the host key its kit names,
 * or why Ri can't ask it anything itself. Shared with connecting the app to Ri's hub (hub-connect.ts).
 */
export async function installedAppHost(source: AppSourceRecord | undefined): Promise<Host | BrowserReason> {
  if (!source?.createdByRi || source.removedAt || !source.url || !source.folder) return 'not_installed_by_ri';
  const origin = loopbackOrigin(source.url);
  if (!origin) return 'not_installed_by_ri';
  const status = await appStatus(source.id).catch(() => null);
  if (!status?.hostKeyPath) return 'no_endpoint';
  const key = readHostKey(status.hostKeyPath, status.dataDir ?? null);
  if (!key) {
    console.warn(`[apps] ${source.name}'s kit names a host key Ri can't use, so it asks in the app's own page.`);
    return 'unavailable';
  }
  return { origin, key };
}

/**
 * One request to the app's grant over loopback. Plain `node:http`, so nothing but these headers goes:
 * the kit refuses a request that carries an Origin or a forwarding header, which only a browser or a
 * proxy would add.
 */
export function hostRequest(host: Host, method: 'GET' | 'POST', pathname: string, body: unknown, timeoutMs: number): Promise<{ status: number; json: unknown }> {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const request = http.request(new URL(pathname, host.origin), {
      method, agent: false, timeout: timeoutMs,
      headers: { authorization: `Bearer ${host.key}`, accept: 'application/json', ...(payload ? { 'content-type': 'application/json', 'content-length': String(payload.length) } : {}) },
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_ANSWER_BYTES) request.destroy(new Error('it answered with too much'));
        else chunks.push(chunk);
      });
      response.on('end', () => {
        let json: unknown = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* Not JSON: the status says enough. */ }
        resolve({ status: response.statusCode ?? 0, json });
      });
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error(`it didn’t answer within ${Math.round(timeoutMs / 1000)} seconds`)));
    request.on('error', reject);
    request.end(payload ?? undefined);
  });
}

export const errorCode = (json: unknown) => json && typeof json === 'object' && typeof (json as { error?: unknown }).error === 'string' ? (json as { error: string }).error : null;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * What the person may allow a place (Ri's own chats, or an agent) in an app: the app's own choices
 * when Ri can ask itself, or why the app's page has to ask.
 */
export async function placeAccess(serverId: string): Promise<PlaceAccess> {
  const entry = placeEntry(serverId);
  const base = describe(entry);
  const host = await hostFor(entry);
  if (typeof host === 'string') return { ...base, kind: 'browser', reason: host };
  let answer;
  try { answer = await hostRequest(host, 'GET', HOST_CHOICES_PATH, undefined, 5_000); }
  catch (error) {
    console.warn(`[apps] ${base.appName} didn't say what Ri may do in it: ${message(error)}`);
    return { ...base, kind: 'browser', reason: 'unavailable' };
  }
  if (answer.status === 404) return { ...base, kind: 'browser', reason: 'no_endpoint' };
  if (answer.status === 409 && errorCode(answer.json) === 'sign_in_required') return { ...base, kind: 'browser', reason: 'sign_in_required' };
  const parsed = ChoicesAnswer.safeParse(answer.json);
  if (answer.status !== 200 || !parsed.success) {
    console.warn(`[apps] ${base.appName} answered Ri's host grant with HTTP ${answer.status}${errorCode(answer.json) ? ` (${errorCode(answer.json)})` : ''}.`);
    return { ...base, kind: 'browser', reason: 'unavailable' };
  }
  const choices = [...new Map(parsed.data.choices.map((choice) => [choice.access, choice])).values()];
  const recommended = choices.some((choice) => choice.access === parsed.data.recommended) ? parsed.data.recommended : choices[0]!.access;
  return { ...base, kind: 'host', choices, recommended };
}

/** The code and state in the app's answer, only when it sends them back to Ri's own callback. */
async function callbackParams(entry: McpServerEntry, redirectTo: string, appName: string) {
  const saved = await getMcpServerStore().getOAuthState(entry.id);
  let target: URL, expected: URL;
  try { target = new URL(redirectTo); expected = new URL(typeof saved?.redirectUri === 'string' ? saved.redirectUri : ''); }
  catch { throw new PersonalAppError('invalid', `${appName} answered with an address Ri can’t read, so Ri didn’t connect.`); }
  if (target.origin !== expected.origin || target.pathname !== expected.pathname) {
    throw new PersonalAppError('invalid', `${appName} sent Ri somewhere other than its own sign-in, so Ri didn’t use it.`);
  }
  const refused = target.searchParams.get('error');
  if (refused) throw new PersonalAppError('invalid', `${appName} didn’t allow it (${refused.slice(0, 100)}).`);
  const code = target.searchParams.get('code');
  const state = target.searchParams.get('state');
  if (!code || !state) throw new PersonalAppError('invalid', `${appName} didn’t send the sign-in back, so Ri didn’t connect.`);
  return { code, state, iss: target.searchParams.get('iss') };
}

/**
 * Allow a place in the app with the access the person chose, without a browser: Ri's OAuth client
 * starts an authorization (Ri's server finishes it, so never through the desktop app's relay), the
 * app approves it for that access, and Ri finishes it as its callback does. When the app can't grant
 * it here after all, the answer says why, and the person allows it on the app's page.
 */
export async function allowPlaceHere(serverId: string, access: AccessKind): Promise<AllowResult> {
  const entry = placeEntry(serverId);
  const base = describe(entry);
  const host = await hostFor(entry);
  if (typeof host === 'string') return { ...base, connected: false, kind: 'browser', reason: host };
  const start = await beginMcpAuthorization(entry).catch((error: unknown) => {
    throw new PersonalAppError('invalid', `Ri couldn’t start connecting to ${base.appName}: ${message(error)}`);
  });
  if (!start.requiresAuth) return { ...base, connected: true };
  let answer;
  try { answer = await hostRequest(host, 'POST', HOST_APPROVE_PATH, { authorizationUrl: start.authUrl, access }, 15_000); }
  catch (error) { throw new PersonalAppError('invalid', `${base.appName} didn’t answer: ${message(error)}. Is it running?`); }
  if (answer.status === 404) return { ...base, connected: false, kind: 'browser', reason: 'no_endpoint' };
  if (answer.status === 409 && errorCode(answer.json) === 'sign_in_required') return { ...base, connected: false, kind: 'browser', reason: 'sign_in_required' };
  // The key or the request wasn't the app's to accept: its page can still ask.
  if (answer.status === 401 || answer.status === 403) {
    console.warn(`[apps] ${base.appName} refused Ri's host grant with HTTP ${answer.status}${errorCode(answer.json) ? ` (${errorCode(answer.json)})` : ''}.`);
    return { ...base, connected: false, kind: 'browser', reason: 'unavailable' };
  }
  const parsed = ApproveAnswer.safeParse(answer.json);
  if (answer.status !== 200 || !parsed.success) {
    const code = errorCode(answer.json);
    throw new PersonalAppError('invalid', `${base.appName} didn’t allow it${code ? ` (${code})` : ` (HTTP ${answer.status})`}. Nothing changed.`);
  }
  const { code, state, iss } = await callbackParams(entry, parsed.data.redirectTo, base.appName);
  try { await completeMcpAuthorization(entry, code, state, undefined, iss); }
  catch (error) { throw new PersonalAppError('invalid', message(error)); }
  return { ...base, connected: true };
}
