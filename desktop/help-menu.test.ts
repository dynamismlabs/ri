import type { MenuItemConstructorOptions } from 'electron';
import { expect, it, vi } from 'vitest';
import { helpMenu } from './help-menu';

it('opens the user guide in the default browser from the Help menu', () => {
  const open = vi.fn();
  const menu = helpMenu(open);
  expect(menu).toMatchObject({ label: 'Help', role: 'help' });
  const items = menu.submenu as MenuItemConstructorOptions[];
  expect(items.map(item => [item.id, item.label])).toEqual([['ri-documentation', 'Ri Documentation']]);
  items[0].click!({} as never, undefined, {} as never);
  expect(open).toHaveBeenCalledWith('https://ri.app/docs');
});

it('is the last menu in the application menu', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const main = fs.readFileSync(path.join(__dirname, 'main.ts'), 'utf8');
  const template = main.slice(main.indexOf('refreshApplicationMenu = () => Menu.setApplicationMenu(Menu.buildFromTemplate(['));
  expect(template.slice(0, template.indexOf(']));')).trimEnd()).toMatch(/helpMenu\(\w+\),?$/);
});
