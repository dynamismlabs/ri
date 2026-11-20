import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CLIENT_LOOK_KEY, useClientLook } from './look';
import { ClientAppearance } from './theme';
import { APPEARANCE_SCRIPT, CLIENT_THEME_KEY } from './appearance-script';
import { ThemeSettings } from '@/components/settings/sections/theme-settings';

let root: Root;
let values: Map<string, string>;
let blocked: boolean;
beforeEach(() => {
  // What the server renders: dark, on the Edge Mac look.
  const { window, document } = parseHTML('<html class="dark" data-look="edge"><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('Event', window.Event);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  blocked = false; values = new Map();
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => { if (blocked) throw new Error('Blocked'); return values.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (blocked) throw new Error('Blocked'); values.set(key, value); },
    removeItem: (key: string) => { if (blocked) throw new Error('Blocked'); values.delete(key); },
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
/** The head script, run as the browser runs it, before React. */
const runScript = () => new Function(APPEARANCE_SCRIPT)();

it('starts on the new look and stores only a choice of Classic', async () => {
  await render();
  expect(document.getElementById('a')!.textContent).toBe('edge');
  expect(lookAttr()).toBe('edge');
  expect(values.has(CLIENT_LOOK_KEY)).toBe(false);
  await act(async () => document.getElementById('b')!.click());
  expect(document.getElementById('a')!.textContent).toBe('classic');
  expect(lookAttr()).toBeNull();
  expect(values.get(CLIENT_LOOK_KEY)).toBe('classic');
  // The theme class is independent of the look.
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  await act(async () => document.getElementById('a')!.click());
  expect(lookAttr()).toBe('edge');
  expect(values.has(CLIENT_LOOK_KEY)).toBe(false);
});

it("doesn't treat turning the old preview off as choosing Classic", async () => {
  values.set('ri.client.look', 'classic');
  await render();
  expect(document.getElementById('a')!.textContent).toBe('edge');
  expect(lookAttr()).toBe('edge');
});

it('follows a change made in another tab', async () => {
  await render();
  values.set(CLIENT_LOOK_KEY, 'classic');
  await act(async () => window.dispatchEvent(Object.assign(new Event('storage'), { key: CLIENT_LOOK_KEY })));
  expect(document.getElementById('b')!.textContent).toBe('classic');
  expect(lookAttr()).toBeNull();
});

it('still switches for this page when browser storage is unavailable', async () => {
  await render();
  blocked = true;
  await act(async () => document.getElementById('a')!.click());
  expect(document.getElementById('b')!.textContent).toBe('classic');
  expect(lookAttr()).toBeNull();
});

it('offers the Classic look switch in the shared appearance settings', () => {
  const html = renderToStaticMarkup(createElement(ThemeSettings));
  expect(html).toContain('Classic look');
  expect(html.match(/role="switch"/g)?.length).toBe(2);
});

it('applies a saved light theme and a choice of Classic before first paint', () => {
  values.set(CLIENT_THEME_KEY, 'light');
  values.set(CLIENT_LOOK_KEY, 'classic');
  runScript();
  expect(document.documentElement.classList.contains('dark')).toBe(false);
  expect(lookAttr()).toBeNull();
});

it('leaves the server defaults when nothing is saved, or storage is blocked', () => {
  runScript();
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  expect(lookAttr()).toBe('edge');
  blocked = true;
  expect(() => runScript()).not.toThrow();
  expect(lookAttr()).toBe('edge');
});
