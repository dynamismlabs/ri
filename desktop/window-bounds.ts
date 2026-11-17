export interface Area { x: number; y: number; width: number; height: number }

export const DEFAULT_WINDOW_SIZE = { width: 1440, height: 980 };
export const MIN_WINDOW_SIZE = { width: 800, height: 600 };

/** A saved place still on a display: at least a corner of the title bar inside its work area. */
function onDisplay(saved: Area, workAreas: Area[]) {
  return workAreas.some(area => saved.x + 100 > area.x && saved.x < area.x + area.width && saved.y + 50 > area.y && saved.y < area.y + area.height);
}

/**
 * Where Ri's window opens: where the person left it, while that's still on a
 * display, and otherwise centered on the main display at a size that fits it.
 * The usual size is larger than many laptop screens. Windows and Linux leave a
 * window that size hanging off the screen, and macOS shrinks it only once it's
 * shown, so the window would move after it opened.
 */
export function initialWindowBounds(saved: unknown, workAreas: Area[], primary: Area): Area {
  const place = saved as Partial<Area> | null;
  if (place && typeof place === 'object' && (['x', 'y', 'width', 'height'] as const).every(key => Number.isFinite(place[key]))) {
    const candidate = place as Area;
    if (candidate.width >= MIN_WINDOW_SIZE.width && candidate.height >= MIN_WINDOW_SIZE.height && onDisplay(candidate, workAreas)) {
      return { x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height };
    }
  }
  // The minimum still wins on a display smaller than it, since the window can't
  // be smaller. It then starts at the work area's corner, title bar in reach.
  const width = Math.max(MIN_WINDOW_SIZE.width, Math.min(DEFAULT_WINDOW_SIZE.width, primary.width));
  const height = Math.max(MIN_WINDOW_SIZE.height, Math.min(DEFAULT_WINDOW_SIZE.height, primary.height));
  const centered = (start: number, room: number, size: number) => start + Math.max(0, Math.floor((room - size) / 2));
  return { x: centered(primary.x, primary.width, width), y: centered(primary.y, primary.height, height), width, height };
}
