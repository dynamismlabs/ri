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
  const back = input.fromCatalog ? `Add it again from Recommended apps to pick both back up.` : `Make a new app named ${name} to pick both back up.`;
  return `${what} ${kept}${reach} ${back}`;
}

export interface RemovedNoticeInput extends Pick<RemoveCopyInput, 'name' | 'folder' | 'dataDir'> {
  /** Ri couldn't uninstall it because its folder is gone (src/lib/apps/remove.ts). */
  stillInstalled?: { command: string | null } | null;
}

/** What the person is told once it's removed. */
export function removedNotice(input: RemovedNoticeInput): string {
  if (input.stillInstalled) {
    const folder = input.folder ? `its folder at ${input.folder}` : 'its folder';
    const run = input.stillInstalled.command ? `run ${input.stillInstalled.command} in it` : 'run the app kit’s serve --uninstall in it';
    return `${input.name} is removed from ${APP_NAME}, but ${APP_NAME} couldn’t uninstall it. The app kit needs ${folder}, and the folder is gone. ${input.name} may still be running. To uninstall it, put the folder back and ${run}.`;
  }
  const kept = [input.folder ? `its folder at ${input.folder}` : 'its folder', input.dataDir ? `its data at ${input.dataDir}` : 'its data'];
  return `${input.name} is removed. ${APP_NAME} kept ${kept.join(' and ')}.`;
}
