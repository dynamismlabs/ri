import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { APPEARANCE_SCRIPT, CLIENT_THEME_KEY } from './appearance-script';
import { ThemeSettings } from '@/components/settings/sections/theme-settings';

let values: Map<string, string>;
let blocked: boolean;
beforeEach(() => {
  // What the server renders: dark, with no look flag.
  const { window, document } = parseHTML('<html class="dark"><body></body></html>');
  vi.stubGlobal('window', window); vi.stubGlobal('document', document);
  blocked = false; values = new Map();
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => { if (blocked) throw new Error('Blocked'); return values.get(key) ?? null; },
  } });
});
afterEach(() => { vi.unstubAllGlobals(); });

/** The head script, run as the browser runs it, before React. */
const runScript = () => new Function(APPEARANCE_SCRIPT)();
const dark = () => document.documentElement.classList.contains('dark');
const look = () => document.documentElement.getAttribute('data-look');

it('applies a saved light theme before first paint, and requires no look flag', () => {
  values.set(CLIENT_THEME_KEY, 'light');
  runScript();
  expect(dark()).toBe(false);
  expect(look()).toBeNull();
});

it('keeps the dark default when nothing is saved or dark is saved', () => {
  runScript();
  expect(dark()).toBe(true);
  values.set(CLIENT_THEME_KEY, 'dark');
  runScript();
  expect(dark()).toBe(true);
});

it('leaves the defaults when browser storage is blocked', () => {
  blocked = true;
  expect(() => runScript()).not.toThrow();
  expect(dark()).toBe(true);
  expect(look()).toBeNull();
});

it('offers only the theme in the shared appearance settings, with no look switch', () => {
  const html = renderToStaticMarkup(createElement(ThemeSettings));
  expect(html).toContain('Dark mode');
  expect(html).not.toContain('Classic');
  expect(html.match(/role="switch"/g)?.length).toBe(1);
});
