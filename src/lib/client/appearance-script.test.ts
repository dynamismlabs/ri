import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { APPEARANCE_SCRIPT, CLIENT_CONTROL_SHAPE_KEY, CLIENT_THEME_KEY, DARK_SCHEME_QUERY } from './appearance-script';
import { ThemeSettings } from '@/components/settings/sections/theme-settings';

let values: Map<string, string>;
let blocked: boolean;
let deviceDark: boolean | null;
beforeEach(() => {
  // What the server renders: dark, with no look flag.
  const { window, document } = parseHTML('<html class="dark"><body></body></html>');
  vi.stubGlobal('window', window); vi.stubGlobal('document', document);
  blocked = false; values = new Map(); deviceDark = false;
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => { if (blocked) throw new Error('Blocked'); return values.get(key) ?? null; },
  } });
  Object.defineProperty(window, 'matchMedia', { configurable: true, get: () => deviceDark === null ? undefined : (query: string) => {
    expect(query).toBe(DARK_SCHEME_QUERY);
    return { matches: deviceDark };
  } });
});
afterEach(() => { vi.unstubAllGlobals(); });

/** The head script, run as the browser runs it, before React. */
const runScript = () => new Function(APPEARANCE_SCRIPT)();
const dark = () => document.documentElement.classList.contains('dark');
const look = () => document.documentElement.getAttribute('data-look');

it('follows the device before first paint when nothing is chosen or Automatic is', () => {
  runScript();
  expect(dark()).toBe(false);
  deviceDark = true;
  runScript();
  expect(dark()).toBe(true);
  values.set(CLIENT_THEME_KEY, 'system'); deviceDark = false;
  runScript();
  expect(dark()).toBe(false);
  expect(look()).toBeNull();
});

it('applies a chosen light or dark theme whatever the device uses', () => {
  values.set(CLIENT_THEME_KEY, 'light'); deviceDark = true;
  runScript();
  expect(dark()).toBe(false);
  values.set(CLIENT_THEME_KEY, 'dark'); deviceDark = false;
  runScript();
  expect(dark()).toBe(true);
});

it('treats an unknown saved value as Automatic', () => {
  values.set(CLIENT_THEME_KEY, 'sepia');
  runScript();
  expect(dark()).toBe(false);
});

it('still follows the device when browser storage is blocked', () => {
  blocked = true;
  expect(() => runScript()).not.toThrow();
  expect(dark()).toBe(false);
  expect(look()).toBeNull();
});

it('keeps the server dark when the browser has no media queries', () => {
  deviceDark = null;
  expect(() => runScript()).not.toThrow();
  expect(dark()).toBe(true);
});

it('offers Automatic, Light and Dark as one choice, and the button shape trial, in the shared appearance settings', () => {
  const html = renderToStaticMarkup(createElement(ThemeSettings));
  expect(html).not.toContain('Classic');
  expect(html).not.toContain('role="switch"');
  expect(html.match(/role="radio"/g)?.length).toBe(5);
  expect([...html.matchAll(/role="radio"[^>]*>(?:<[^>]+>)*([^<]+)/g)].map(match => match[1])).toEqual(['Automatic', 'Light', 'Dark', 'Round', 'Rounded']);
  expect(html).toContain('Button shape');
});

it('applies a saved rounded-rectangle shape before first paint, and leaves capsules otherwise', () => {
  runScript();
  expect(document.documentElement.getAttribute('data-control-shape')).toBeNull();
  values.set(CLIENT_CONTROL_SHAPE_KEY, 'rect');
  runScript();
  expect(document.documentElement.getAttribute('data-control-shape')).toBe('rect');
});
