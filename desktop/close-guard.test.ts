import { expect, it } from 'vitest';
import { closeDialogDetail, closeHold, closeHoldLog } from './close-guard';
import { UNLOAD_BLOCKER_MESSAGES } from '../src/lib/client/unload-blockers';

it('lets a page close only on ok, and takes only a known name from its answer', () => {
  expect(closeHold({ ok: true })).toBeNull();
  // A page names a blocker even if it also says ok, so ok alone decides.
  expect(closeHold({ ok: true, waitingFor: 'request' })).toBeNull();
  expect(closeHold({ ok: false, waitingFor: 'request' })).toBe('request');
  expect(closeHold({ ok: false, waitingFor: 'capture' })).toBe('capture');
  // A page from before pages named it, or one that names something else.
  expect(closeHold({ ok: false })).toBe('unsaved');
  expect(closeHold({ ok: false, waitingFor: '<b>Click here</b>' })).toBe('unsaved');
  expect(closeHold({ ok: 'true' })).toBe('unsaved');
});

it('leads the dialog with what the page named, and logs why it asked', () => {
  expect(closeDialogDetail('request')).toMatch(new RegExp(`^${UNLOAD_BLOCKER_MESSAGES.request} Keep Ri open`));
  expect(closeDialogDetail('no-answer')).toMatch(/^Keep Ri open/);
  expect(closeDialogDetail('unsaved')).toBe(closeDialogDetail('no-answer'));
  expect(closeHoldLog('no-answer')).toBe('Asked before closing (no-answer). The page did not answer within 15 seconds.');
  expect(closeHoldLog('unsaved')).toBe('Asked before closing (unsaved). The page has unsaved work.');
  expect(closeHoldLog('input')).toBe(`Asked before closing (input). ${UNLOAD_BLOCKER_MESSAGES.input}`);
  for (const hold of ['request', 'no-answer', 'unsaved'] as const) {
    expect(closeDialogDetail(hold)).not.toMatch(/[—–;]/);
    expect(closeHoldLog(hold)).not.toMatch(/[—–;]/);
  }
});
