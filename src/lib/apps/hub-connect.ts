/**
 * Connecting an app Ri installed to Ri's own hub, without a browser (docs/personal-apps.md
 * "Connecting an app Ri installed to the hub").
 *
 * An app reaches the person's accounts through Ri's hub, connecting once with OAuth. Its own
 * "Connect to Ri" sends a browser to Ri's approval page, and for an app Ri installed, that page is
 * at Ri's loopback address, which a browser on the person's laptop or phone can't open. So Ri
 * connects it here, with the app's host key (host-access.ts) and the kit's host hub routes (kit
 * core 0.2.11, `host-hub.ts`):
 * 1. Ri tells the app where its hub is (`POST /api/host/hub`), kept only when the app has none.
 * 2. Ri asks the app to start connecting (`POST /api/host/hub/connect`). The app registers its
 *    client, makes its PKCE challenge and state, and answers its authorization address on Ri.
 *    Inside the app's own view, the app makes that address itself and asks Ri to open it.
 * 3. The person chooses accounts, tools and Ri's services in Ri's dialog, from what the consent
 *    page offers (hubConsentFor). Ri checks the authorization as the page's form does
 *    (checkAuthorizeRequest), records the grant and issues the code (hubDecisionRedirect).
 * 4. Ri sends the code and state to the app (`POST /api/host/hub/finish`), which exchanges it at
 *    Ri's token endpoint with its own verifier. The tokens never pass through here.
 *
 * Ri approves only an authorization for its own hub, at one of its own loopback addresses, whose
 * client returns to an app Ri installed, and sends the code only to that app.
 */
import { z } from 'zod/v4';
import { getLoopbackBaseUrl } from '@/lib/auth/bootstrap';
import { getAppSourceForApp, listAppSources, type AppSourceRecord } from '@/lib/db/queries';
import { getPersonalApp, PersonalAppError } from '@/lib/integrations/apps';
import { hubConsentFor } from '@/lib/integrations/hub/consent';
import { grantFromChoice, type HubConsentOptions } from '@/lib/integrations/hub/grant';
import { getMcpServerStore } from '@/lib/integrations/runtime';
import { processState } from '@/lib/process-state';
import { checkAuthorizeRequest, hubDecisionRedirect, type AuthorizeRequest } from '@/lib/oauth/flow';
import { teamRefusal } from '@/lib/oauth/http';
import { HUB_MCP_PATH, issuerFor, OAUTH_PATHS } from '@/lib/oauth/issuer';
import { errorCode, hostRequest, installedAppHost, loopbackOrigin, type BrowserReason, type Host } from './host-access';

/** Where the kit serves the hub routes, on the app's own address. */
export const HOST_HUB_PATH = '/api/host/hub';
export const HOST_HUB_CONNECT_PATH = '/api/host/hub/connect';
export const HOST_HUB_FINISH_PATH = '/api/host/hub/finish';

const HUB_STATES = ['not_connected', 'connected', 'reconnect', 'unreachable'] as const;
export type AppHubState = typeof HUB_STATES[number];
const HubAnswer = z.object({
  source: z.enum(['hub', 'fixtures']), state: z.enum(HUB_STATES), url: z.string().nullable(), error: z.string().nullable(),
  purpose: z.string().nullable(), uses: z.array(z.string()), scope: z.string().nullable(),
});
const BeginAnswer = z.union([z.object({ authorizationUrl: z.string().min(1).max(8192) }), z.object({ connected: z.literal(true) })]);

/**
 * An app's link to Ri's hub, as its page in Ri shows it:
 * - `none`: it doesn't use the hub.
 * - `browser`: Ri can't connect it itself (`reason`, as for allowing Ri in it); the app's Settings can.
 * - `host`: Ri can. `here` is whether its hub is this Ri; `testData` when it runs on fixtures.
 */
export type AppHub =
  | { kind: 'none' }
  | { kind: 'browser'; reason: BrowserReason }
  | { kind: 'host'; state: AppHubState; here: boolean; uses: string[]; purpose: string | null; error: string | null; testData: boolean };

/** What Ri's dialog shows for one authorization: the app, and the accounts, tools and services it may be lent. */
export interface HubAuthorization {
  appId: string;
  appName: string;
  purpose: string | null;
  options: HubConsentOptions;
}

const said = (error: unknown) => error instanceof Error ? error.message : String(error);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Ri's hub, as an app on this computer reaches it. */
export function riHubUrl(): string {
  return `${getLoopbackBaseUrl()}${HUB_MCP_PATH}`;
}

/** Two addresses on this computer's loopback at the same port, whatever loopback name each uses. */
export function sameLoopbackPort(a: string, b: string): boolean {
  try {
    const left = new URL(a), right = new URL(b);
    return left.protocol === right.protocol && LOOPBACK.has(left.hostname) && LOOPBACK.has(right.hostname) && left.port === right.port;
  } catch { return false; }
}

/** The installed app's host, or the refusal its page explains. */
async function hostOf(source: AppSourceRecord | undefined, appId?: string): Promise<Host> {
  const host = await installedAppHost(source);
  if (typeof host !== 'string') return host;
  let name = source?.name ?? 'This app';
  if (!source && appId) try { name = getPersonalApp(appId).name; } catch { /* Gone: the plain words do. */ }
  throw new PersonalAppError('invalid', host === 'not_installed_by_ri' ? `${name} wasn’t installed by Ri on this computer, so connect it from its own Settings.`
    : host === 'no_endpoint' ? `Update ${name} first: its version can’t be connected from Ri.` : `${name} didn’t answer Ri. Is it running?`);
}

/** One request to the app's hub routes, its refusals said in the app's words. */
async function ask(source: AppSourceRecord, host: Host, method: 'GET' | 'POST', pathname: string, body: unknown, timeoutMs: number) {
  let answer;
  try { answer = await hostRequest(host, method, pathname, body, timeoutMs); }
  catch (error) { throw new PersonalAppError('invalid', `${source.name} didn’t answer: ${said(error)}. Is it running?`); }
  if (answer.status === 409 && errorCode(answer.json) === 'sign_in_required') throw new PersonalAppError('invalid', `${source.name} has accounts, so connect it to Ri from its own Settings.`);
  return answer;
}

/**
 * The app's link to Ri's hub. When the app has no hub yet, Ri tells it where Ri's is, so its own
 * Settings and view connect here without asking for an address.
 */
export async function appHub(appId: string): Promise<AppHub> {
  const source = getAppSourceForApp(appId);
  const host = await installedAppHost(source);
  if (typeof host === 'string') return { kind: 'browser', reason: host };
  let answer;
  try { answer = await hostRequest(host, 'GET', HOST_HUB_PATH, undefined, 5_000); }
  catch { return { kind: 'browser', reason: 'unavailable' }; }
  // The kit's own 404 says the app uses no hub. Anything else that isn't its answer, such as an
  // older kit's page for an address it doesn't know, means the app needs updating first.
  if (answer.status === 404 && errorCode(answer.json) === 'not_found') return { kind: 'none' };
  if (answer.status === 409 && errorCode(answer.json) === 'sign_in_required') return { kind: 'browser', reason: 'sign_in_required' };
  if (answer.status === 401 || answer.status === 403) return { kind: 'browser', reason: 'unavailable' };
  let parsed = HubAnswer.safeParse(answer.json);
  if (answer.status !== 200 || !parsed.success) return { kind: 'browser', reason: 'no_endpoint' };
  if (parsed.data.source === 'hub' && !parsed.data.url) {
    const offered = await hostRequest(host, 'POST', HOST_HUB_PATH, { url: riHubUrl() }, 5_000).catch(() => null);
    const again = offered?.status === 200 ? HubAnswer.safeParse(offered.json) : null;
    if (again?.success) parsed = again;
  }
  const hub = parsed.data;
  return {
    kind: 'host', state: hub.state, here: !!hub.url && sameLoopbackPort(hub.url, riHubUrl()),
    uses: hub.uses, purpose: hub.purpose, error: hub.error, testData: hub.source === 'fixtures',
  };
}

/**
 * When one of an app's views opens: tell the app where Ri's hub is if it has none, once per app
 * while Ri runs, so the app's own Connect button works inside Ri without the person opening its
 * page in Ri first. Best effort: an app that isn't answering is asked again next time.
 */
export async function offerRiHub(serverId: string): Promise<void> {
  const appId = getMcpServerStore().get(serverId)?.app?.id;
  if (!appId) return;
  const offered = processState('apps.hub-offered', () => new Set<string>());
  if (offered.has(appId)) return;
  offered.add(appId);
  const hub = await appHub(appId).catch(() => null);
  if (!hub || hub.kind === 'browser') offered.delete(appId);
}

/** Ask the app to start connecting to Ri's hub: the authorization Ri's dialog then approves. */
export async function beginAppHub(appId: string): Promise<{ authorizationUrl: string } | { connected: true }> {
  const source = getAppSourceForApp(appId);
  const host = await hostOf(source, appId);
  const answer = await ask(source!, host, 'POST', HOST_HUB_CONNECT_PATH, { url: riHubUrl() }, 20_000);
  const parsed = BeginAnswer.safeParse(answer.json);
  if (answer.status === 200 && parsed.success) return parsed.data;
  if (answer.status === 404) throw new PersonalAppError('invalid', `Update ${source!.name} first: its version can’t be connected from Ri.`);
  const message = answer.json && typeof answer.json === 'object' && typeof (answer.json as { message?: unknown }).message === 'string' ? (answer.json as { message: string }).message : `HTTP ${answer.status}`;
  throw new PersonalAppError('invalid', `${source!.name} couldn’t start connecting: ${message}`);
}

/**
 * An authorization an app made for Ri's hub, checked as the consent page's form checks it: for
 * this Ri, at one of its own loopback addresses, a hub authorization with PKCE whose client
 * returns to the one app Ri installed at that address. `serverId`, from an app's view, must be
 * that same app's.
 */
async function hubAuthorizationRequest(authorizationUrl: string, serverId?: string): Promise<{ request: AuthorizeRequest; source: AppSourceRecord }> {
  const refused = (why: string) => new PersonalAppError('invalid', why);
  // A team's server lends no hub to personal apps, as its consent page doesn't.
  if (teamRefusal()) throw refused('A team connects apps from its own settings.');
  let url: URL;
  try { url = new URL(authorizationUrl); } catch { throw refused('That isn’t an address Ri can read.'); }
  if (url.pathname !== OAUTH_PATHS.authorize || !loopbackOrigin(url.href)) throw refused('That isn’t an approval for this Ri.');
  const issuer = issuerFor(new Headers({ host: url.host }), url.href);
  if (issuer !== url.origin) throw refused('That isn’t an approval for this Ri.');
  const check = await checkAuthorizeRequest(url.searchParams, issuer);
  if (check.kind === 'fatal') throw refused(check.message);
  if (check.kind === 'redirect') throw refused(check.description);
  if (check.request.audience !== 'hub') throw refused('That approval isn’t for an app to use your accounts.');
  const installed = listAppSources().filter((source) => source.createdByRi && !source.removedAt && !!source.url && !!source.personalAppId && sameLoopbackPort(source.url, check.request.redirectUri));
  if (installed.length !== 1) throw refused(`${check.request.client.name} isn’t an app Ri installed on this computer, so it connects in a browser.`);
  const source = installed[0]!;
  if (serverId !== undefined && getMcpServerStore().get(serverId)?.app?.id !== source.personalAppId) throw refused('That approval is for another app.');
  return { request: check.request, source };
}

/** What Ri's dialog offers for an app's authorization. */
export async function hubAuthorization(authorizationUrl: string, serverId?: string): Promise<HubAuthorization> {
  const { request, source } = await hubAuthorizationRequest(authorizationUrl, serverId);
  return { appId: source.personalAppId!, appName: source.name, purpose: request.client.purpose ?? null, options: await hubConsentFor(request) };
}

/**
 * The person's choice in Ri's dialog: record it as the app's grant, as the consent page does, and
 * send the code to the app, which finishes connecting with its own verifier.
 */
export async function approveAppHub(
  authorizationUrl: string,
  choice: { tools: Record<string, readonly string[]>; services: readonly string[] },
  serverId?: string,
): Promise<{ appId: string; appName: string; connected: boolean }> {
  const { request, source } = await hubAuthorizationRequest(authorizationUrl, serverId);
  const host = await hostOf(source);
  const grant = grantFromChoice(await hubConsentFor(request), choice);
  const answered = new URL(hubDecisionRedirect(request, grant));
  const code = answered.searchParams.get('code');
  if (!code) throw new PersonalAppError('invalid', `Ri couldn’t approve ${source.name}. Try again.`);
  const answer = await ask(source, host, 'POST', HOST_HUB_FINISH_PATH, { code, state: answered.searchParams.get('state') }, 20_000);
  const parsed = HubAnswer.safeParse(answer.json);
  if (answer.status === 200 && parsed.success) return { appId: source.personalAppId!, appName: source.name, connected: parsed.data.state === 'connected' };
  const message = answer.json && typeof answer.json === 'object' && typeof (answer.json as { message?: unknown }).message === 'string' ? (answer.json as { message: string }).message : `HTTP ${answer.status}`;
  throw new PersonalAppError('invalid', `${source.name} didn’t finish connecting: ${message}`);
}
