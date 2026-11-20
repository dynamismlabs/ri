'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * The design the app is drawn in, a browser preference like the theme.
 * `classic` is today's look. `edge` is the Edge Mac design on trial: its tokens
 * and component styles live in `src/styles/edge.css`, scoped to
 * `html[data-look="edge"]`, so switching back is one click and nothing else in
 * the app changes shape (docs/ui-system.md).
 */
export type ClientLook = 'classic' | 'edge';

export const CLIENT_LOOK_KEY = 'ri.client.look';
const CHANGE_EVENT = 'ri:client-look';
let fallback: ClientLook = 'classic';

function read(): ClientLook {
  try {
    const value = window.localStorage.getItem(CLIENT_LOOK_KEY);
    return value === 'edge' || value === 'classic' ? value : fallback;
  } catch { return fallback; }
}
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === CLIENT_LOOK_KEY || event.key === null) listener(); };
  window.addEventListener('storage', storage);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => { window.removeEventListener('storage', storage); window.removeEventListener(CHANGE_EVENT, listener); };
}
function setLook(look: ClientLook) {
  fallback = look;
  try { window.localStorage.setItem(CLIENT_LOOK_KEY, look); } catch { /* The look still changes for this page without storage. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
const serverLook = (): ClientLook => 'classic';

/** A browser preference shared by every surface in this document, never a Home setting. */
export function useClientLook() {
  const look = useSyncExternalStore(subscribe, read, serverLook);
  const toggleLook = useCallback(() => setLook(look === 'edge' ? 'classic' : 'edge'), [look]);
  useEffect(() => {
    const root = document.documentElement;
    if (look === 'edge') root.setAttribute('data-look', 'edge');
    else root.removeAttribute('data-look');
  }, [look]);
  return { look, setLook, toggleLook };
}
