import { expect, it } from 'vitest';
import { removeAppDescription, removedNotice } from './remove-copy';

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

