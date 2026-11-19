import { expect, it } from 'vitest';
import { initialWindowBounds, type Area } from './window-bounds';

// A 1024x768 Mac, as on CI's Apple-chip runner: menu bar 25 points, Dock 59.
const smallMac: Area = { x: 0, y: 25, width: 1024, height: 684 };
const studio: Area = { x: 0, y: 25, width: 2560, height: 1415 };
const external: Area = { x: 2560, y: 0, width: 1920, height: 1080 };

it('fits a first window to a display smaller than the usual size, where the OS would otherwise move or crop it', () => {
  expect(initialWindowBounds(undefined, [smallMac], smallMac)).toEqual(smallMac);
  // A 1366x768 Windows laptop with a 40 pixel taskbar.
  const laptop = { x: 0, y: 0, width: 1366, height: 728 };
  expect(initialWindowBounds(undefined, [laptop], laptop)).toEqual({ x: 0, y: 0, width: 1366, height: 728 });
});

it('centers the usual size on a display with room for it', () => {
  expect(initialWindowBounds(undefined, [studio, external], studio)).toEqual({ x: 560, y: 25 + 217, width: 1440, height: 980 });
  // The main display need not start at the origin.
  expect(initialWindowBounds(undefined, [external], external)).toEqual({ x: 2560 + 240, y: 50, width: 1440, height: 980 });
});

it('keeps the minimum size on a display smaller than it, from the work area corner', () => {
  const tiny = { x: 0, y: 25, width: 780, height: 575 };
  expect(initialWindowBounds(undefined, [tiny], tiny)).toEqual({ x: 0, y: 25, width: 800, height: 600 });
});

it('reopens where the person left it while that is still on a display', () => {
  const saved = { x: 2700, y: 100, width: 1200, height: 800 };
  expect(initialWindowBounds(saved, [studio, external], studio)).toEqual(saved);
  // Partly off the screen is the person's choice, kept as it was.
  expect(initialWindowBounds({ x: 1900, y: 40, width: 1200, height: 900 }, [studio], studio)).toEqual({ x: 1900, y: 40, width: 1200, height: 900 });
});

it('opens a first window instead when the saved place is gone, too small or unreadable', () => {
  const fallback = initialWindowBounds(undefined, [smallMac], smallMac);
  // Left on an external display that is no longer connected.
  expect(initialWindowBounds({ x: 2700, y: 100, width: 1200, height: 800 }, [smallMac], smallMac)).toEqual(fallback);
  expect(initialWindowBounds({ x: 10, y: 40, width: 640, height: 480 }, [smallMac], smallMac)).toEqual(fallback);
  for (const saved of [null, 'window', { x: 10, y: 40, width: 1000 }, { x: 10, y: 40, width: Number.NaN, height: 650 }]) {
    expect(initialWindowBounds(saved, [smallMac], smallMac)).toEqual(fallback);
  }
});
