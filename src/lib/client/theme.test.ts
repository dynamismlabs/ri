import { act, createElement } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CLIENT_THEME_KEY, ClientAppearance, setThemePreference, useDocumentTheme, useThemePreference } from './theme';
import { APPEARANCE_SCRIPT } from './appearance-script';
import { ThemeSettings } from '@/components/settings/sections/theme-settings';

let root: Root | undefined;
let values: Map<string, string>;
let blocked: boolean;
let device: { matches: boolean; listeners: Set<() => void>; set(dark: boolean): void };
beforeEach(() => {
  const { window, document, MutationObserver } = parseHTML('<html class="dark"><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('Event', window.Event);
  vi.stubGlobal('MutationObserver', MutationObserver);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  blocked = false; values = new Map();
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => { if (blocked) throw new Error('Blocked'); return values.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (blocked) throw new Error('Blocked'); values.set(key, value); },
  } });
  device = { matches: false, listeners: new Set(), set(dark) { this.matches = dark; this.listeners.forEach(listener => listener()); } };
  const query = { get matches() { return device.matches; }, addEventListener: (_: string, listener: () => void) => device.listeners.add(listener), removeEventListener: (_: string, listener: () => void) => device.listeners.delete(listener) };
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => query });
  // The choice outlives storage for the page's life. Start each test from a browser that never chose.
  setThemePreference('system'); values.clear();
});
afterEach(async () => { const mounted = root; root = undefined; if (mounted) await act(async () => mounted.unmount()); vi.unstubAllGlobals(); });

/** A settings control: shows the choice and picks the next one on click. */
function Chooser({ id }: { id: string }) {
  const { preference, setPreference } = useThemePreference();
  const next = { system: 'light', light: 'dark', dark: 'system' } as const;
  return createElement('button', { id, onClick: () => setPreference(next[preference]) }, preference);
}
/** Anything that must match the page, such as a code editor. */
function Drawn({ id }: { id: string }) { return createElement('output', { id }, useDocumentTheme()); }
const text = (id: string) => document.getElementById(id)!.textContent;
const dark = () => document.documentElement.classList.contains('dark');
const mount = () => { root ??= createRoot(document.getElementById('root')!); return root; };
const render = () => act(async () => mount().render(createElement('div', null,
  createElement(ClientAppearance), createElement(Chooser, { id: 'personal' }), createElement(Chooser, { id: 'team' }), createElement(Drawn, { id: 'editor' }))));

it('starts Automatic and follows the device as it changes', async () => {
  await render();
  expect(text('personal')).toBe('system');
  expect(dark()).toBe(false); expect(text('editor')).toBe('light');
  await act(async () => device.set(true));
  expect(dark()).toBe(true); expect(text('editor')).toBe('dark');
  await act(async () => device.set(false));
  expect(dark()).toBe(false); expect(text('editor')).toBe('light');
});

it('keeps a chosen theme when the device changes, until Automatic is chosen again', async () => {
  await render();
  await act(async () => document.getElementById('team')!.click());
  expect(text('personal')).toBe('light'); expect(values.get(CLIENT_THEME_KEY)).toBe('light');
  await act(async () => device.set(true));
  expect(dark()).toBe(false); expect(text('editor')).toBe('light');
  await act(async () => document.getElementById('team')!.click());
  expect(text('personal')).toBe('dark'); expect(dark()).toBe(true); expect(text('editor')).toBe('dark');
  await act(async () => device.set(false));
  expect(dark()).toBe(true);
  await act(async () => document.getElementById('team')!.click());
  expect(text('personal')).toBe('system'); expect(values.get(CLIENT_THEME_KEY)).toBe('system');
  expect(dark()).toBe(false); expect(text('editor')).toBe('light');
});

it('shares the choice between mounted surfaces, documents and other tabs', async () => {
  await render();
  await act(async () => document.getElementById('team')!.click());
  expect(text('personal')).toBe('light');
  await act(async () => root!.render(null));
  await render();
  expect(text('team')).toBe('light');
  values.set(CLIENT_THEME_KEY, 'dark');
  await act(async () => window.dispatchEvent(Object.assign(new Event('storage'), { key: CLIENT_THEME_KEY })));
  expect(text('team')).toBe('dark');
  expect(dark()).toBe(true); expect(text('editor')).toBe('dark');
});

it('keeps the choice usable when browser storage is unavailable', async () => {
  await render();
  blocked = true;
  await act(async () => document.getElementById('team')!.click());
  expect(text('personal')).toBe('light');
  await act(async () => device.set(true));
  expect(dark()).toBe(false);
});

it('never draws the server dark over a light choice while hydrating', async () => {
  values.set(CLIENT_THEME_KEY, 'light');
  new Function(APPEARANCE_SCRIPT)();
  expect(dark()).toBe(false);
  const classes = document.documentElement.classList;
  const toggle = classes.toggle.bind(classes);
  const drawn: boolean[] = [];
  classes.toggle = (name: string, force?: boolean) => { if (name === 'dark') drawn.push(force ?? !classes.contains('dark')); return toggle(name, force); };
  const container = document.getElementById('root')!;
  container.innerHTML = renderToStaticMarkup(createElement(ClientAppearance));
  await act(async () => { root = hydrateRoot(container, createElement(ClientAppearance)); });
  expect(drawn).not.toContain(true);
  expect(dark()).toBe(false);
});

it('reads a theme a document fixes for itself', async () => {
  await act(async () => mount().render(createElement(Drawn, { id: 'editor' })));
  // Without ClientAppearance, as in the chat UI gallery's previews.
  expect(text('editor')).toBe('dark');
  await act(async () => { document.documentElement.classList.remove('dark'); });
  expect(text('editor')).toBe('light');
  await act(async () => device.set(true));
  expect(text('editor')).toBe('light');
});

it('renders the shared settings control without personal dashboard or server state', () => {
  const html = renderToStaticMarkup(createElement(ThemeSettings));
  expect(html).toContain('Theme'); expect(html).toContain('role="radiogroup"');
  expect(html).not.toContain('service');
});
