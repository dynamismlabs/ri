'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether the scratchpad is showing (docs/scratchpad.md). On a wide window
 * it's a column beside every screen and stays open across navigation and
 * reloads, the way a notepad stays on the desk, so that choice is kept per
 * browser in localStorage. On a phone or tablet it's a sheet over the page,
 * which never reopens on its own.
 *
 * ⌘⇧J (`HOTKEYS.scratchpad`) gets you to the caret and back
 * (`nextScratchpadAction`).
 */

export const SCRATCHPAD_OPEN_KEY = 'ri.client.scratchpadOpen';
// Says whether the column is open, whichever view it shows (`BesideView`).
const CHANGE_EVENT = 'ri:scratchpad-open-changed';
/** Asks the open pad's editor to take the caret. */
export const SCRATCHPAD_FOCUS_EVENT = 'ri:scratchpad-focus';

function readColumn(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(SCRATCHPAD_OPEN_KEY) === '1'; } catch { return false; }
}

function subscribeColumn(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === SCRATCHPAD_OPEN_KEY || e.key === null) onChange(); };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function setScratchpadColumnOpen(open: boolean): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(SCRATCHPAD_OPEN_KEY, open ? '1' : '0'); } catch { /* private mode, non-fatal */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function isScratchpadColumnOpen(): boolean {
  return readColumn();
}

/** The column on a wide window. */
export function useScratchpadColumnOpen(): boolean {
  return useSyncExternalStore(subscribeColumn, readColumn, () => false);
}

/**
 * What the column beside every screen shows (docs/scratchpad.md, "The deck
 * beside"): the pad, or the deck, so the deck can stay in view from a chat
 * or an agent without going Home. Kept per browser with the open choice.
 */
export type BesideView = 'scratchpad' | 'deck';
export const BESIDE_VIEW_KEY = 'ri.client.besideView';

function readBesideView(): BesideView {
  if (typeof window === 'undefined') return 'scratchpad';
  try { return window.localStorage.getItem(BESIDE_VIEW_KEY) === 'deck' ? 'deck' : 'scratchpad'; } catch { return 'scratchpad'; }
}

function subscribeBesideView(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === BESIDE_VIEW_KEY || e.key === null) onChange(); };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function setBesideView(view: BesideView): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(BESIDE_VIEW_KEY, view); } catch { /* private mode, non-fatal */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getBesideView(): BesideView {
  return readBesideView();
}

export function useBesideView(): BesideView {
  return useSyncExternalStore(subscribeBesideView, readBesideView, () => 'scratchpad');
}

/** Whether the column is open on the pad, the only state ⌘⇧J counts as open. */
export function isScratchpadInColumn(): boolean {
  return readColumn() && readBesideView() === 'scratchpad';
}

/**
 * The deck's button: closes the column when it already shows the deck,
 * otherwise shows the deck there (switching from the pad, or opening it).
 */
export function nextDeckBesideAction(columnOpen: boolean, view: BesideView): 'show' | 'close' {
  return columnOpen && view === 'deck' ? 'close' : 'show';
}

let sheetOpen = false;
const sheetListeners = new Set<() => void>();
export function setScratchpadSheetOpen(open: boolean): void {
  if (sheetOpen === open) return;
  sheetOpen = open;
  sheetListeners.forEach(listener => listener());
}
const subscribeSheet = (listener: () => void) => { sheetListeners.add(listener); return () => { sheetListeners.delete(listener); }; };

export function isScratchpadSheetOpen(): boolean {
  return sheetOpen;
}

/** The sheet on a phone or tablet. */
export function useScratchpadSheetOpen(): boolean {
  return useSyncExternalStore(subscribeSheet, () => sheetOpen, () => false);
}

// Opening the pad mounts its editor, which takes the caret once it exists.
// A pad restored on load leaves focus where it was.
let focusOnMount = false;

/** Put the caret in the pad: now if its editor is up, else as it mounts. */
export function requestScratchpadFocus(): void {
  focusOnMount = true;
  window.dispatchEvent(new Event(SCRATCHPAD_FOCUS_EVENT));
}

/** Whether a newly mounted editor should take the caret. Asked once. */
export function consumeScratchpadFocus(): boolean {
  const focus = focusOnMount;
  focusOnMount = false;
  return focus;
}

export type ScratchpadAction = 'open' | 'focus' | 'return' | 'close';

/**
 * What the shortcut does, from where the pad and the caret are. Beside the
 * page (`wide`), pressing it again from inside goes back to where you were
 * and leaves the pad in view, since keeping it in view is the point. Escape
 * or ✕ closes it there. A sheet over the page closes instead.
 */
export function nextScratchpadAction(open: boolean, focused: boolean, wide: boolean): ScratchpadAction {
  if (!open) return 'open';
  if (!focused) return 'focus';
  return wide ? 'return' : 'close';
}
