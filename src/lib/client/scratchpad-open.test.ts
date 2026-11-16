import { describe, expect, it } from 'vitest';
import { nextDeckBesideAction, nextScratchpadAction } from './scratchpad-open';

/** ⌘⇧J gets you to the scratchpad's caret and back (docs/scratchpad.md). */
describe('nextScratchpadAction', () => {
  it('opens a closed pad', () => {
    expect(nextScratchpadAction(false, false, true)).toBe('open');
    expect(nextScratchpadAction(false, false, false)).toBe('open');
  });

  it('puts the caret in a pad that is open while you work elsewhere', () => {
    expect(nextScratchpadAction(true, false, true)).toBe('focus');
    expect(nextScratchpadAction(true, false, false)).toBe('focus');
  });

  it('goes back from the pad beside the page and leaves it in view', () => {
    expect(nextScratchpadAction(true, true, true)).toBe('return');
  });

  it('closes a sheet over the page', () => {
    expect(nextScratchpadAction(true, true, false)).toBe('close');
  });
});

/** The deck's button in the top bar shares the column with the pad. */
describe('nextDeckBesideAction', () => {
  it('opens a closed column on the deck', () => {
    expect(nextDeckBesideAction(false, 'scratchpad')).toBe('show');
    expect(nextDeckBesideAction(false, 'deck')).toBe('show');
  });

  it('switches a column showing the pad to the deck', () => {
    expect(nextDeckBesideAction(true, 'scratchpad')).toBe('show');
  });

  it('closes the column when it already shows the deck', () => {
    expect(nextDeckBesideAction(true, 'deck')).toBe('close');
  });
});
