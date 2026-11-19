import { expect, it } from 'vitest';
import { CONNECTED_RESULT, connectedNotice } from './connected-notice';

it("says the desktop app's sign-in result once", () => {
  expect(connectedNotice(CONNECTED_RESULT)).toBe('Connected');
});

it('names what a web sign-in connected', () => {
  expect(connectedNotice('X (Twitter)')).toBe('Connected X (Twitter)');
  expect(connectedNotice('Work')).toBe('Connected Work');
});
