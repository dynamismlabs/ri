import { expect, it } from 'vitest';
import { removeAppDescription, removedNotice } from './remove-copy';
import { versionLabel } from './version-label';

it('says what removing an installed app stops, and what it keeps and where', () => {
  const text = removeAppDescription({ name: 'Bookmarks', installed: true, folder: '/Users/me/ri/apps/bookmarks', dataDir: '/Users/me/.local/share/bookmarks', fromCatalog: true });
  expect(text).toContain('stops Bookmarks, uninstalls it from this computer');
  expect(text).toContain('Its folder stays at /Users/me/ri/apps/bookmarks, with any changes you made, and its data stays at /Users/me/.local/share/bookmarks.');
  expect(text).toContain('Add it again from Recommended apps');
  expect(text).not.toMatch(/[—;]/);
});

it('names New app for an app the person made, and says less for one never installed', () => {
  const text = removeAppDescription({ name: 'Tide Log', installed: false, folder: '/apps/tide-log', dataDir: null, fromCatalog: false });
  expect(text).toBe('Ri takes Tide Log off its apps. Its folder stays at /apps/tide-log, with any changes you made, and its data stays where Tide Log keeps it. Make a new app named Tide Log to pick both back up.');
  expect(removedNotice({ name: 'Tide Log', folder: '/apps/tide-log', dataDir: '/data/tide-log' })).toBe('Tide Log is removed. Ri kept its folder at /apps/tide-log and its data at /data/tide-log.');
});

it('says when Ri can’t uninstall an app whose folder is gone, and how to do it by hand', () => {
  const before = removeAppDescription({ name: 'Tide Log', installed: true, folder: '/apps/tide-log', dataDir: null, fromCatalog: true, folderGone: true });
  expect(before).toBe('Ri takes Tide Log off its apps and forgets every sign-in to it, so Ri and every agent lose its tools and screens. Ri can’t uninstall it, because the app kit needs its folder at /apps/tide-log and the folder is gone. Tide Log may keep running, and Ri will say how to uninstall it by hand.');
  const after = removedNotice({ name: 'Tide Log', folder: '/apps/tide-log', dataDir: null, stillInstalled: { command: 'pnpm exec tide-kit serve --uninstall' } });
  expect(after).toBe('Tide Log is removed from Ri, but Ri couldn’t uninstall it. The app kit needs its folder at /apps/tide-log, and the folder is gone. Tide Log may still be running. To uninstall it, put the folder back and run pnpm exec tide-kit serve --uninstall in it.');
  expect(removedNotice({ name: 'Tide Log', folder: null, dataDir: null, stillInstalled: { command: null } })).toContain('put the folder back and run the app kit’s serve --uninstall in it.');
  for (const text of [before, after]) expect(text).not.toMatch(/[—;]/);
});

it('shows a catalog version as its tag, or a commit by its first 7 characters', () => {
  expect(versionLabel('b149ca3eaddbf2bdc7c064030e637df68e281d4a')).toBe('b149ca3');
  expect(versionLabel('v1.2.0')).toBe('v1.2.0');
  expect(versionLabel('0ebde33')).toBe('0ebde33');
  expect(versionLabel(null)).toBe('');
});
