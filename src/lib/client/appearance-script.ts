/**
 * The browser's theme, applied before first paint.
 *
 * A browser's theme choice is Automatic, Light or Dark (`ThemePreference`).
 * Automatic, also what a browser that never chose gets, follows the device's
 * light or dark setting. The server can't know that setting, so it renders the
 * dark theme on `<html>`. This script runs first in the document head, before
 * the page paints, and applies the chosen or device theme, so a person in light
 * never sees a dark frame first. `ClientAppearance` keeps it in step afterwards,
 * including when the device switches while Ri is open.
 *
 * A plain module, not a client one, so the root layout (a server component) can
 * read the string. The key and the media query live here and the hook imports them.
 */
export const CLIENT_THEME_KEY = 'ri.client.theme';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';
/** `rect` draws controls as rounded rectangles instead of capsules (a trial). */
export const CLIENT_CONTROL_SHAPE_KEY = 'ri.client.controlShape';

export const APPEARANCE_SCRIPT = `(function(){try{var d=document.documentElement,t=null,s=null;try{t=window.localStorage.getItem(${JSON.stringify(CLIENT_THEME_KEY)});s=window.localStorage.getItem(${JSON.stringify(CLIENT_CONTROL_SHAPE_KEY)});}catch(e){}var m=window.matchMedia&&window.matchMedia(${JSON.stringify(DARK_SCHEME_QUERY)});d.classList.toggle('dark',t==='light'||t==='dark'?t==='dark':m?m.matches:true);if(s==='rect')d.setAttribute('data-control-shape','rect');}catch(e){}})();`;
