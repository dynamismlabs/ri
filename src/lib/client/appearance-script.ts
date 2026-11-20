/**
 * The browser's appearance choices, applied before first paint.
 *
 * The server renders the defaults on `<html>`: the dark theme and the Edge Mac
 * look (`data-look="edge"`). This script runs in the document head, before the
 * page paints, and applies what this browser chose instead, so a person in light
 * mode or on the Classic look never sees a flash of the default. The client hooks
 * (`useClientTheme`, `useClientLook`) keep it in step afterwards.
 *
 * A plain module, not a client one, so the root layout (a server component) can
 * read the string. The keys live here and the hooks import them.
 */
export const CLIENT_THEME_KEY = 'ri.client.theme';

/**
 * Only a choice of Classic is stored. A new key on purpose: the preview's old key
 * (`ri.client.look`) recorded turning a trial on or off, not choosing the previous
 * design once Edge became the default.
 */
export const CLIENT_LOOK_KEY = 'ri.client.lookChoice';

export const APPEARANCE_SCRIPT = `(function(){try{var d=document.documentElement,s=window.localStorage,t=s.getItem(${JSON.stringify(CLIENT_THEME_KEY)});if(t==='light')d.classList.remove('dark');else if(t==='dark')d.classList.add('dark');if(s.getItem(${JSON.stringify(CLIENT_LOOK_KEY)})==='classic')d.removeAttribute('data-look');}catch(e){}})();`;
