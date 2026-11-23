/**
 * The browser's theme, applied before first paint.
 *
 * The server renders the defaults on `<html>`: the dark theme, and the one look
 * (`data-look="edge"`, see docs/ui-system.md). This script runs first in the
 * document head, before the page paints, and applies a light theme this browser
 * chose, so a person in light mode never sees a dark frame first.
 * `useClientTheme` keeps it in step afterwards.
 *
 * A plain module, not a client one, so the root layout (a server component) can
 * read the string. The key lives here and the hook imports it.
 */
export const CLIENT_THEME_KEY = 'ri.client.theme';

export const APPEARANCE_SCRIPT = `(function(){try{var d=document.documentElement,t=window.localStorage.getItem(${JSON.stringify(CLIENT_THEME_KEY)});if(t==='light')d.classList.remove('dark');else if(t==='dark')d.classList.add('dark');}catch(e){}})();`;
