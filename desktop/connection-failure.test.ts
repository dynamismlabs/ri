import { expect, it } from 'vitest';
import { automatedFailure, connectionFailure } from './connection-failure';
import { DesktopSessionError } from './session-auth';

const slowSignIn = connectionFailure(new DesktopSessionError('The local Ri service did not finish signing in within 15 seconds. Retry when it is ready and reachable.', 'timeout'), true);
const refused = connectionFailure(new DesktopSessionError('The local Ri service rejected its desktop sign-in credential (HTTP 401).', 'credential'), true);
const smoke = { RI_DESKTOP_SMOKE: '1' };

it('lets a person or the recovery smoke see every failure', () => {
  expect(automatedFailure({}, slowSignIn, true)).toBe('show');
  expect(automatedFailure({}, refused, true)).toBe('show');
  expect(automatedFailure({ ...smoke, RI_DESKTOP_RECOVERY_SMOKE: '1' }, refused, true)).toBe('show');
});

it('waits out a slow first sign-in while Ri is still starting, as the app does', () => {
  expect(slowSignIn.retryable).toBe(true);
  expect(automatedFailure(smoke, slowSignIn, true)).toBe('wait');
});

it('ends an automated run on a failure Ri will not retry, or once startup is over', () => {
  expect(refused.retryable).toBe(false);
  expect(automatedFailure(smoke, refused, true)).toBe('quit');
  expect(automatedFailure(smoke, slowSignIn, false)).toBe('quit');
  // The startup limit itself is never retried.
  expect(automatedFailure(smoke, connectionFailure('The app did not finish starting within four minutes. Check the backend output and retry.'), false)).toBe('quit');
});
