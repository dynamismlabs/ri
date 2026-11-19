/**
 * Removing an app Ri installed, and connecting one that's installed but not connected
 * (docs/personal-apps.md "Removing an app").
 *
 * Remove stops the app and uninstalls its service with the kit's `serve --uninstall` (the kit's
 * `docs/safe-change.md`), disconnects every place it was connected, and takes it off Ri's lists.
 * Its folder, with any changes the person made, and its data, which the kit keeps by the app's id,
 * both stay on this computer. Adding it again (from the catalog, or New app with its name) installs
 * that folder again and the app finds its data where it left it.
 *
 * If the folder is gone, the kit can't uninstall the app, since it finds the service from the
 * folder. Remove still takes the app off Ri, and its result says the app may still be running and
 * gives the kit's command to uninstall it by hand.
 */
import fs from 'node:fs';
import { getAppSource, updateAppSource, type AppSourceRecord } from '@/lib/db/queries';
import { addPersonalApp, listPersonalApps, removePersonalApp } from '@/lib/integrations/apps';
import { AppBuildError, finish, kitCliFor, latestAppJob, newJob, pnpmCommand, prepare, runIn, toolsWithGit } from './builder';
import { appStatus } from './status';
import { appToolchain } from './toolchain';

type RequestLike = Pick<Request, 'headers' | 'url'>;

/** What removing an app kept, for the person. */
export interface RemovedApp {
  name: string;
  folder: string | null;
  /** Where its data stays, when the kit said. */
  dataDir: string | null;
  /**
   * Set when Ri installed the app but couldn't uninstall it: its folder is gone, and the kit finds
   * the app's service from the folder. The app may still be running. `command` is the kit's
   * uninstall as the person runs it in the folder once it's back, when Ri knows the kit's name.
   */
  stillInstalled: { command: string | null } | null;
  /**
   * Its access to the person's accounts through Ri's hub was turned off too. Only ever true for an
   * app Ri couldn't uninstall, when the person kept that choice ticked (`RemoveOptions`).
   */
  accessTurnedOff: boolean;
}

export interface RemoveOptions {
  /**
   * When Ri can't confirm the app stopped (its folder is gone), also turn off its access to the
   * person's accounts, as its hub panel's switch does: its tokens stop and its waiting and unused
   * approvals go. Otherwise Remove keeps that access, so Add picks it back up.
   */
  turnOffAccess?: boolean;
}

/**
 * The kit's uninstall, as the person runs it in an app's folder. Named by the kit Ri carries: an
 * app's own copy of the kit has the same command.
 */
function uninstallCommand(): string | null {
  const name = appToolchain().kit?.name;
  return name ? `pnpm exec ${name} serve --uninstall` : null;
}

/** Whether the app's connection for Ri's own chats still exists. */
export function isConnected(source: Pick<AppSourceRecord, 'personalAppId'>, connected = new Set(listPersonalApps().map((app) => app.id))): boolean {
  return !!source.personalAppId && connected.has(source.personalAppId);
}

function requireRiApp(sourceId: string): AppSourceRecord {
  const source = getAppSource(sourceId);
  if (!source || source.removedAt) throw new AppBuildError('not_found', 'That app isn’t in Ri anymore.');
  if (!source.createdByRi) throw new AppBuildError('invalid', `Ri didn’t install ${source.name}, so it can’t uninstall it. Remove its connection instead.`);
  return source;
}

/**
 * Remove an app Ri installed. The service goes first: when the kit can't uninstall it, nothing else
 * changes and the person is told why. Then every connection goes, and the app leaves Ri's lists.
 */
export async function removeApp(sourceId: string, options: RemoveOptions = {}): Promise<RemovedApp> {
  const source = requireRiApp(sourceId);
  if (latestAppJob(source.id)?.state === 'running') throw new AppBuildError('conflict', 'Something is already running for this app. Wait for it to finish.');
  const folder = source.folder && fs.existsSync(/* turbopackIgnore: true */ source.folder) ? source.folder : null;
  let dataDir: string | null = null;
  if (source.url && folder) {
    // Where its data is, before its service goes, so the person knows where it stays.
    dataDir = (await appStatus(source.id, { fresh: true }).catch(() => null))?.dataDir ?? null;
    const tools = toolsWithGit();
    const cli = kitCliFor(folder);
    const job = newJob(source.id, 'remove');
    try {
      if (!await prepare(tools, job, folder)) throw new AppBuildError('setup', job.error ?? `Ri couldn’t get ${source.name}’s kit ready to uninstall it.`);
      job.steps.push({ step: 'uninstall', status: 'started' });
      const { code, tail } = await runIn(tools, folder, pnpmCommand(tools), ['exec', cli, 'serve', '--uninstall'], {}, () => {});
      const reason = tail.trim().split('\n').pop() ?? '';
      job.steps[job.steps.length - 1] = { step: 'uninstall', status: code === 0 ? 'passed' : 'failed', ...(code === 0 ? {} : { detail: tail.slice(-500) }) };
      if (code !== 0) throw new AppBuildError('setup', `The app kit couldn’t uninstall ${source.name}${reason ? `: ${reason.slice(0, 300)}` : '.'} Nothing else changed.`);
      finish(job, 'done');
    } catch (error) {
      finish(job, 'failed', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
  // Installed, but its folder is gone, so the kit can't find its service to uninstall it. It's
  // still removed from Ri, and the person is told what may still be running and how to stop it.
  const stillInstalled = source.url && !folder ? { command: uninstallCommand() } : null;
  // An app that may still be running keeps reaching the person's accounts unless they say otherwise.
  const accessTurnedOff = !!stillInstalled && options.turnOffAccess === true && source.url
    ? (await import('@/lib/integrations/hub/manage')).turnOffHubAppsAt(source.url) > 0
    : false;
  if (source.personalAppId) await removePersonalApp(source.personalAppId);
  updateAppSource(source.id, { url: null, personalAppId: null, removedAt: new Date().toISOString() });
  return { name: source.name, folder: source.folder, dataDir, stillInstalled, accessTurnedOff };
}

/**
 * Connect an app that's installed but not connected (its connection was removed, or its consent
 * screen was never finished), as installing it does: the app's consent screen opens next.
 */
export async function reconnectApp(sourceId: string, request?: RequestLike, returnTo?: string) {
  const source = requireRiApp(sourceId);
  if (!source.url) throw new AppBuildError('invalid', `${source.name} isn’t installed. Install and connect it instead.`);
  if (isConnected(source)) throw new AppBuildError('conflict', `${source.name} is already connected.`);
  const added = await addPersonalApp({ name: source.name, url: source.url, ...(returnTo ? { returnTo } : {}) }, request)
    .catch((error: unknown) => { throw new AppBuildError('setup', error instanceof Error ? error.message : String(error)); });
  updateAppSource(source.id, { personalAppId: added.app.id });
  return added.requiresAuth ? { requiresAuth: true as const, authUrl: added.authUrl } : { requiresAuth: false as const };
}
