import fs from 'node:fs';
import path from 'node:path';
import type { LocalPageStyleOptions } from './local-page-style';

export type DesktopTheme = 'light' | 'dark';
export const isDesktopTheme = (value: unknown): value is DesktopTheme => value === 'light' || value === 'dark';

/** Cosmetic, per-profile state. Never opens a Home or changes its settings.
 * The app's theme can be Automatic, and only the page knows the choice, so this
 * keeps the theme the app last drew only when it differs from `device`. A
 * profile with nothing kept follows `device` until the app draws. */
export function desktopAppearance(file: string, device: () => DesktopTheme = () => 'dark') {
  let kept: DesktopTheme | undefined;
  try { const saved = JSON.parse(fs.readFileSync(file, 'utf8')).theme; if (isDesktopTheme(saved)) kept = saved; }
  catch { /* A fresh profile follows the device, like the app's default. */ }
  let drawn: DesktopTheme | undefined;
  const get = () => drawn ??= kept ?? device();
  return {
    get,
    /** Records the theme the app drew. True when it changed what Ri shows. */
    set(value: unknown) {
      if (!isDesktopTheme(value)) return false;
      const changed = value !== get();
      drawn = value;
      const keep = value === device() ? undefined : value;
      if (keep !== kept) {
        kept = keep;
        try {
          fs.writeFileSync(`${file}.tmp`, JSON.stringify(keep ? { theme: keep } : {}), { mode: 0o600 });
          fs.renameSync(`${file}.tmp`, file);
        } catch { /* Cosmetic persistence must not interrupt the app. */ }
      }
      return changed;
    },
  };
}

/** Bundled assets are available before Next or a remote Home exists. */
export function localPageAssets(repo: string): Pick<LocalPageStyleOptions, 'themeCss' | 'fontDataUrl' | 'logoDataUrl'> {
  return {
    themeCss: fs.readFileSync(path.join(repo, 'src/styles/theme.css'), 'utf8'),
    fontDataUrl: `data:font/woff2;base64,${fs.readFileSync(path.join(repo, 'public/fonts/inter-latin.woff2')).toString('base64')}`,
    logoDataUrl: `data:image/svg+xml;base64,${fs.readFileSync(path.join(repo, 'public/brand/ri-mark-white.svg')).toString('base64')}`,
  };
}
