import type { MenuItemConstructorOptions } from 'electron';
import { APP_NAME, DOCS_URL } from '../src/constants/app';

/**
 * The Help menu, last in the menu bar on every platform. `role: 'help'`
 * makes it the Mac's own Help menu, with its search field. Its item opens
 * the user guide (`guide/`, published at ri.app/docs) in the default browser.
 */
export function helpMenu(openExternal: (url: string) => void): MenuItemConstructorOptions {
  return {
    label: 'Help',
    role: 'help',
    submenu: [{ id: 'ri-documentation', label: `${APP_NAME} Documentation`, click: () => openExternal(DOCS_URL) }],
  };
}
