'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { CLIENT_LOOK_KEY } from './appearance-script';

/**
 * The design the app is drawn in, a browser preference like the theme.
 * `edge` (Edge Mac, docs/ui-system.md) is the default. `classic` is the previous
 * design, kept behind Settings > General > Classic look while people settle in.
 * Edge's tokens and component styles live in `src/styles/edge.css`, scoped to
 * `html[data-look="edge"]`. The server renders the attribute, so the default
 * paints without a flash, and `APPEARANCE_SCRIPT` removes it before first paint
 * for someone who chose Classic (only that choice is stored, see
 * `CLIENT_LOOK_KEY`).
 */
export type ClientLook = 'classic' | 'edge';

export { CLIENT_LOOK_KEY };
const CHANGE_EVENT = 'ri:client-look';
let fallback: ClientLook = 'edge';

function read(): ClientLook {
  try {
    return window.localStorage.getItem(CLIENT_LOOK_KEY) === 'classic' ? 'classic' : 'edge';
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
  try {
    if (look === 'classic') window.localStorage.setItem(CLIENT_LOOK_KEY, 'classic');
    else window.localStorage.removeItem(CLIENT_LOOK_KEY);
  } catch { /* The look still changes for this page without storage. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
const serverLook = (): ClientLook => 'edge';

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
