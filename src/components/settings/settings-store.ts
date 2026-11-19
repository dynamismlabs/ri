'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_SECTION, type SectionId } from './settings-sections';

/**
 * Imperative open/close store for the unified settings modal.
 *
 * Module-level so any surface — a deep preview-pane CTA, the mobile "More"
 * menu, the command palette, the top-HUD gear — can open the modal (optionally
 * on a specific section) without threading a handle through the React tree.
 * Mirrors the pattern the old `openBeamdSheet()` / `openRemotePreviewSettings()`
 * helpers used, but unified behind one store. `<SettingsModal/>` is mounted once
 * and subscribes via `useSettingsStore()`.
 */
interface SettingsState {
  open: boolean;
  section: SectionId;
  /**
   * Where within the section to land, like the Skills tab of Plugins for a
   * link that's about a skill. Reset whenever the section changes.
   */
  anchor: string | null;
  /** Repeated requests for the same destination still navigate and focus it. */
  requestId: number;
}

let state: SettingsState = { open: false, section: DEFAULT_SECTION, anchor: null, requestId: 0 };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Open settings. With a section → land there. Without → where you last were. */
export function openSettings(section?: SectionId, opts: { anchor?: string } = {}): void {
  state = section
    ? { open: true, section, anchor: opts.anchor ?? null, requestId: state.requestId + 1 }
    : { ...state, open: true, anchor: null, requestId: state.requestId + 1 };
  emit();
}


export function closeSettings(): void {
  if (!state.open) return;
  state = { ...state, open: false, anchor: null };
  emit();
}

/** A pane's local navigation updates its deep link without issuing another open request. */
export function setSettingsAnchor(anchor: string): void {
  if (!state.open || state.section !== 'plugins' || state.anchor === anchor) return;
  state = { ...state, anchor };
  emit();
}

export function setSettingsSection(section: SectionId): void {
  if (state.open && state.section === section) return;
  state = { ...state, section, anchor: null };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SettingsState {
  return state;
}

export function useSettingsStore(): SettingsState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
