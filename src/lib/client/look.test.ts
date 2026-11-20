import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CLIENT_LOOK_KEY, useClientLook } from './look';
import { ClientAppearance } from './theme';
import { ThemeSettings } from '@/components/settings/sections/theme-settings';

let root: Root;
let values: Map<string, string>;
let blocked: boolean;
beforeEach(() => {
  const { window, document } = parseHTML('<html class="dark"><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('Event', window.Event);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  blocked = false; values = new Map();
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => { if (blocked) throw new Error('Blocked'); return values.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (blocked) throw new Error('Blocked'); values.set(key, value); },
  } });
  root = createRoot(document.getElementById('root')!);
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
function Reader({ id }: { id: string }) {
  const { look, toggleLook } = useClientLook();
  return createElement('button', { id, onClick: toggleLook }, look);
}
const render = () => act(async () => root.render(createElement('div', null, createElement(ClientAppearance), createElement(Reader, { id: 'a' }), createElement(Reader, { id: 'b' }))));
const lookAttr = () => document.documentElement.getAttribute('data-look');

it('starts on the classic look and marks the document only for the new one', async () => {
  await render();
  expect(document.getElementById('a')!.textContent).toBe('classic');
  expect(lookAttr()).toBeNull();
  await act(async () => document.getElementById('b')!.click());
  expect(document.getElementById('a')!.textContent).toBe('edge');
  expect(lookAttr()).toBe('edge');
  expect(values.get(CLIENT_LOOK_KEY)).toBe('edge');
  // The theme class is independent of the look.
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  await act(async () => document.getElementById('a')!.click());
  expect(lookAttr()).toBeNull();
  expect(values.get(CLIENT_LOOK_KEY)).toBe('classic');
});

it('follows a change made in another tab', async () => {
  await render();
  values.set(CLIENT_LOOK_KEY, 'edge');
  await act(async () => window.dispatchEvent(Object.assign(new Event('storage'), { key: CLIENT_LOOK_KEY })));
  expect(document.getElementById('b')!.textContent).toBe('edge');
  expect(lookAttr()).toBe('edge');
});

it('still switches for this page when browser storage is unavailable', async () => {
  await render();
  blocked = true;
  await act(async () => document.getElementById('a')!.click());
  expect(document.getElementById('b')!.textContent).toBe('edge');
  expect(lookAttr()).toBe('edge');
});

it('offers the switch in the shared appearance settings', () => {
  const html = renderToStaticMarkup(createElement(ThemeSettings));
  expect(html).toContain('New look (preview)');
  expect(html.match(/role="switch"/g)?.length).toBe(2);
});
