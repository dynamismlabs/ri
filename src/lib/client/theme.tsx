'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { Theme, ThemePreference } from '@/types/dashboard';
import { CLIENT_THEME_KEY, DARK_SCHEME_QUERY } from './appearance-script';

export { CLIENT_THEME_KEY };
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const satisfies readonly ThemePreference[];
const CHANGE_EVENT = 'ri:client-theme';
/** What a browser that never chose gets, and the choice when storage is blocked. */
let fallback: ThemePreference = 'system';

const isThemePreference = (value: unknown): value is ThemePreference =>
  (THEME_PREFERENCES as readonly unknown[]).includes(value);

function readPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(CLIENT_THEME_KEY);
    return isThemePreference(value) ? value : fallback;
  } catch { return fallback; }
}
function subscribePreference(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === CLIENT_THEME_KEY || event.key === null) listener(); };
  window.addEventListener('storage', storage);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => { window.removeEventListener('storage', storage); window.removeEventListener(CHANGE_EVENT, listener); };
}
export function setThemePreference(preference: ThemePreference) {
  fallback = preference;
  try { window.localStorage.setItem(CLIENT_THEME_KEY, preference); } catch { /* Browser preferences still work without storage. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The device's light or dark setting. Without media queries, the server's dark. */
const deviceQuery = () => (typeof window.matchMedia === 'function' ? window.matchMedia(DARK_SCHEME_QUERY) : null);
function readDeviceTheme(): Theme {
  const query = deviceQuery();
  return !query || query.matches ? 'dark' : 'light';
}
function subscribeDeviceTheme(listener: () => void) {
  const query = deviceQuery();
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}

export const resolveTheme = (preference: ThemePreference, device: Theme): Theme =>
  preference === 'system' ? device : preference;

/** What the page draws: the `dark` class on `<html>`, set by the head script and
 * `ClientAppearance`, or by a document that fixes its own theme (the chat UI
 * gallery's previews). Anything that must match the page reads this. */
function readDocumentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}
function subscribeDocumentTheme(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
const serverTheme = (): Theme => 'dark';
const serverPreference = (): ThemePreference => 'system';

/** A browser choice of Automatic, Light or Dark, shared by personal, embedded
 * and standalone Home documents. It never reads or writes a Home's settings. */
export function useThemePreference() {
  const preference = useSyncExternalStore(subscribePreference, readPreference, serverPreference);
  return { preference, setPreference: setThemePreference };
}

/** The theme the page is drawn in, light or dark. */
export function useDocumentTheme(): Theme {
  return useSyncExternalStore(subscribeDocumentTheme, readDocumentTheme, serverTheme);
}

/** Draws the chosen theme, and follows the device while the choice is Automatic. */
export function ClientAppearance() {
  const preference = useSyncExternalStore(subscribePreference, readPreference, serverPreference);
  const device = useSyncExternalStore(subscribeDeviceTheme, readDeviceTheme, serverTheme);
  useEffect(() => {
    // Read live rather than from this render: a hydrating render still holds the
    // server's dark, and the head script has already drawn the right theme.
    document.documentElement.classList.toggle('dark', resolveTheme(readPreference(), readDeviceTheme()) === 'dark');
  }, [preference, device]);
  return null;
}
