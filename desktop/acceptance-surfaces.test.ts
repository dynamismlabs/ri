import { expect, it } from 'vitest';
import { assertSameNativeWindow, settledWindowSnapshot } from './acceptance-surfaces';

type App = Parameters<typeof settledWindowSnapshot>[0];

/** Ri's one window as CI's Linux runner reported it: a 27 px menu bar above the content. */
const shown = (content: number, { visible = true } = {}) => ({
  id: 1, bounds: { x: 0, y: 22, width: 1280, height: 980 }, contentBounds: { x: 0, y: 49, width: 1280, height: content },
  visible, minimized: false, viewer: { id: 2, target: 'viewer', url: 'about:blank' }, local: [],
});

/** An app whose window passes through `states`, one per look, then stays at the last. */
function app(...states: ReturnType<typeof shown>[]): App {
  let look = 0;
  return { evaluate: async () => [states[Math.min(look++, states.length - 1)]] } as unknown as App;
}

it('takes the baseline once the window is shown and its menu bar has taken its place', async () => {
  // Xvfb, no window manager: the content sat below the menu bar at the window's full height, past its bottom
  // edge, before and after the window showed. However long that holds still, it isn't the window yet.
  const settled = await settledWindowSnapshot(app(shown(980, { visible: false }), shown(980), shown(980), shown(980), shown(953), shown(953)), { quietMs: 1 });
  expect(settled.contentBounds.height).toBe(953);
  expect(settled.visible).toBe(true);
});

it('says what the window was doing when it never holds still', async () => {
  const hidden = app(shown(953, { visible: false }));
  await expect(settledWindowSnapshot(hidden, { quietMs: 1, timeoutMs: 20 })).rejects.toThrow(/never settled: \{"visible":false/);
});

it('lets a layout still landing arrive, and fails a window that stays moved or resized', async () => {
  const before = shown(953);
  await assertSameNativeWindow(app(shown(980), shown(980), shown(953)), before);
  await expect(assertSameNativeWindow(app(shown(900)), before, 250)).rejects.toThrow('Local controls must preserve the title bar and content bounds');
  await expect(assertSameNativeWindow(app({ ...shown(953), bounds: { x: 40, y: 22, width: 1280, height: 980 } }), before, 250))
    .rejects.toThrow('Opening local controls must preserve window placement and size');
});
