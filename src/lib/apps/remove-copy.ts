/**
 * What removing an app says to the person, before and after (docs/personal-apps.md "Removing an
 * app"), with no server imports, so the dialog and its tests agree.
 */
import { APP_NAME } from '@/constants/app';

export interface RemoveCopyInput {
  name: string;
  /** Ri installed it and it's installed now, so removing it uninstalls it. */
  installed: boolean;
  folder: string | null;
  dataDir: string | null;
  /** Added from Ri's catalog, so Add there picks it back up. Otherwise New app with its name does. */
  fromCatalog: boolean;
  /** Installed, but its folder is gone (the status says `no_folder`), so Ri can't uninstall it. */
  folderGone?: boolean;
}

const where = (path: string | null, fallback: string) => (path ? `at ${path}` : fallback);

/** The confirmation for removing an app Ri installed or made. */
export function removeAppDescription(input: RemoveCopyInput): string {
  const { name } = input;
  if (input.installed && input.folderGone) {
    const folder = input.folder ? `its folder at ${input.folder}` : 'its folder';
    return `${APP_NAME} takes ${name} off its apps and forgets every sign-in to it, so ${APP_NAME} and every agent lose its tools and screens. ${APP_NAME} can’t uninstall it, because the app kit needs ${folder} and the folder is gone. ${name} may keep running, and ${APP_NAME} will say how to uninstall it by hand.`;
  }
  const what = input.installed
    ? `${APP_NAME} stops ${name}, uninstalls it from this computer and forgets every sign-in to it, so ${APP_NAME} and every agent lose its tools and screens.`
    : `${APP_NAME} takes ${name} off its apps.`;
  const kept = `Its folder stays ${where(input.folder, 'where it is')}, with any changes you made, and its data stays ${where(input.dataDir, `where ${name} keeps it`)}.`;
  const reach = input.installed ? ` What it may reach through ${APP_NAME} stays as you allowed it.` : '';
  const back = input.fromCatalog ? `Add it again from Discover to pick both back up.` : `Make a new app named ${name} to pick both back up.`;
  return `${what} ${kept}${reach} ${back}`;
}

/**
 * The choice Remove offers only when Ri can't uninstall the app (its folder is gone), ticked to
 * start with: the app may keep running, so it could keep reaching the person's accounts.
 */
export function turnOffAccessChoice(name: string): { label: string; help: string } {
  return {
    label: `Also turn off ${name}’s access to your accounts`,
    help: `${name} may still be running, so it could keep reaching your accounts and ${APP_NAME}’s services through ${APP_NAME}. This stops that at its next call. Requests waiting for you and approvals it hasn’t used yet are dropped.`,
  };
}

export interface RemovedNoticeInput extends Pick<RemoveCopyInput, 'name' | 'folder' | 'dataDir'> {
  /** Ri couldn't uninstall it because its folder is gone (src/lib/apps/remove.ts). */
  stillInstalled?: { command: string | null } | null;
  /** Its hub access was turned off with it (`turnOffAccessChoice`). */
  accessTurnedOff?: boolean;
}

/** What the person is told once it's removed. */
export function removedNotice(input: RemovedNoticeInput): string {
  if (input.stillInstalled) {
    const folder = input.folder ? `its folder at ${input.folder}` : 'its folder';
    const run = input.stillInstalled.command ? `run ${input.stillInstalled.command} in it` : 'run the app kit’s serve --uninstall in it';
    const access = input.accessTurnedOff ? ` Its access to your accounts through ${APP_NAME} is off.` : '';
    return `${input.name} is removed from ${APP_NAME}, but ${APP_NAME} couldn’t uninstall it. The app kit needs ${folder}, and the folder is gone. ${input.name} may still be running.${access} To uninstall it, put the folder back and ${run}.`;
  }
  const kept = [input.folder ? `its folder at ${input.folder}` : 'its folder', input.dataDir ? `its data at ${input.dataDir}` : 'its data'];
  return `${input.name} is removed. ${APP_NAME} kept ${kept.join(' and ')}.`;
}
