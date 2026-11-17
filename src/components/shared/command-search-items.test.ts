import { expect, it } from 'vitest';
import type { PaletteCommand } from '@/constants/commands';
import { matchCommands } from './command-search-items';

const open = (name: string): PaletteCommand => ({ id: `open-app:${name}`, label: `Open ${name}`, keywords: `app ${name} mcp connector`, icon: 'LayoutGrid', group: 'navigate' });

it("finds an app's Open row by its name, as a search names it", () => {
  const apps = [open('Bookmarks'), open('Reading Log')];
  expect(matchCommands(apps, 'Bookmarks').map(command => command.label)).toEqual(['Open Bookmarks']);
  expect(matchCommands(apps, '  reading ').map(command => command.label)).toEqual(['Open Reading Log']);
  expect(matchCommands(apps, 'open').map(command => command.label)).toEqual(['Open Bookmarks', 'Open Reading Log']);
  expect(matchCommands(apps, 'calendar')).toEqual([]);
});
