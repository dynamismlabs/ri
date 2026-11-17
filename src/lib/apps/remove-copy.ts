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
}

const where = (path: string | null, fallback: string) => (path ? `at ${path}` : fallback);

/** The confirmation for removing an app Ri installed or made. */
export function removeAppDescription(input: RemoveCopyInput): string {
  const { name } = input;
  const what = input.installed
    ? `${APP_NAME} stops ${name}, uninstalls it from this computer and forgets every sign-in to it, so ${APP_NAME} and every agent lose its tools and screens.`
    : `${APP_NAME} takes ${name} off its apps.`;
  const kept = `Its folder stays ${where(input.folder, 'where it is')}, with any changes you made, and its data stays ${where(input.dataDir, `where ${name} keeps it`)}.`;
  const reach = input.installed ? ` What it may reach through ${APP_NAME} stays as you allowed it.` : '';
  const back = input.fromCatalog ? `Add it again from Recommended apps to pick both back up.` : `Make a new app named ${name} to pick both back up.`;
  return `${what} ${kept}${reach} ${back}`;
}

/** What the person is told once it's removed. */
export function removedNotice(input: Pick<RemoveCopyInput, 'name' | 'folder' | 'dataDir'>): string {
  const kept = [input.folder ? `its folder at ${input.folder}` : 'its folder', input.dataDir ? `its data at ${input.dataDir}` : 'its data'];
  return `${input.name} is removed. ${APP_NAME} kept ${kept.join(' and ')}.`;
}
