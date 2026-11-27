'use client';

import { useSyncExternalStore } from 'react';
import { readDocumentBinding } from '@/lib/home/document-binding';
import { homeStorageIdentity } from '@/lib/home/document-scope';

/**
 * Which groups of started chats Recent shows open (docs/started-chats.md).
 * Every group starts folded, so a chat that started ten reads as one row
 * with a line saying what they're doing. The ones you open stay open on this
 * browser, keyed by the starter's address, which outlives a main chat's New
 * chat.
 *
 * Only the most recently opened groups are kept, so the stored list can't
 * grow without end. A group dropped from it is simply folded again.
 */
export const STARTED_FOLDS_KEY = 'ri.client.openStartedGroups';
const CHANGED = 'ri:open-started-groups-changed';
const KEEP = 200;
const NONE: ReadonlySet<string> = new Set();

export function parseOpenGroups(raw: string | null): ReadonlySet<string> {
  if (!raw) return NONE;
  try {
    const keys = JSON.parse(raw);
    return Array.isArray(keys) ? new Set(keys.filter((key): key is string => typeof key === 'string')) : NONE;
  } catch {
    return NONE;
  }
}

/** The stored list after toggling one group: opened ones go last, so the oldest drop first. */
export function toggledOpenGroups(open: ReadonlySet<string>, key: string): string[] {
  const next = [...open].filter((k) => k !== key);
  if (!open.has(key)) next.push(key);
  return next.slice(-KEEP);
}

function storageKey() {
  const team = typeof document !== 'undefined' && ['team', 'space'].includes(document.documentElement.dataset.riAuthority ?? '');
  return homeStorageIdentity(STARTED_FOLDS_KEY, team ? readDocumentBinding() : null);
}

// One parsed set per stored string, so the snapshot stays the same object
// until the stored value changes.
let lastRaw: string | null = null;
let lastOpen: ReadonlySet<string> = NONE;
function read(): ReadonlySet<string> {
  if (typeof window === 'undefined') return NONE;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey());
  } catch {
    return NONE;
  }
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastOpen = parseOpenGroups(raw);
  }
  return lastOpen;
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === storageKey() || e.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGED, onChange);
  };
}

function toggle(key: string) {
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(toggledOpenGroups(read(), key)));
  } catch {
    /* localStorage can throw in private mode, non-fatal */
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function useOpenStartedGroups(): [ReadonlySet<string>, (key: string) => void] {
  const open = useSyncExternalStore(subscribe, read, () => NONE);
  return [open, toggle];
}
