import { expect, it, vi } from 'vitest';
import { nextTimingStep, QUIET_REASON, updateCheckIntervalMs, updateTiming, type TimingFacts } from './update-timing';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const now = 1_000 * HOUR;
const quiet: TimingFacts = { now, work: [], lastUseAt: now - HOUR, quietFrom: now - HOUR };
const timing = { quietMs: MINUTE, holdMs: HOUR, spacingMs: 12 * HOUR, longWaitMs: 24 * HOUR };
const step = (change: Partial<TimingFacts>) => nextTimingStep({ ...quiet, ...change }, timing);

it('reads the defaults from the spec', () => {
  expect(updateTiming()).toEqual(timing);
});

it('checks for releases every 15–20 minutes across server and desktop installs', () => {
  const random = vi.spyOn(Math, 'random');
  try {
    random.mockReturnValue(0);
    expect(updateCheckIntervalMs()).toBe(15 * MINUTE);
    random.mockReturnValue(0.999);
    expect(updateCheckIntervalMs()).toBeGreaterThan(19 * MINUTE);
    expect(updateCheckIntervalMs()).toBeLessThan(20 * MINUTE);
  } finally { random.mockRestore(); }
});

it('honours an explicit release-check interval', () => {
  vi.stubEnv('RI_UPDATE_CHECK_MS', '5000');
  try { expect(updateCheckIntervalMs()).toBe(5000); }
  finally { vi.unstubAllEnvs(); }
});

it('updates after one quiet minute without a separate countdown', () => {
  expect(step({ quietFrom: now - MINUTE + 1 })).toEqual({ step: 'wait', reason: QUIET_REASON });
  expect(step({ quietFrom: now - MINUTE })).toEqual({ step: 'update' });
});

it('counts the minute from the last use, an agent over MCP included', () => {
  expect(step({ lastUseAt: now - MINUTE + 1 })).toEqual({ step: 'wait', reason: QUIET_REASON });
  expect(step({ lastUseAt: now - MINUTE })).toEqual({ step: 'update' });
});

it('counts them from when the wait began too, or from the last work it saw', () => {
  expect(step({ quietFrom: now - 30_000 })).toEqual({ step: 'wait', reason: QUIET_REASON });
});

it('never stops running work, and says what it waits for', () => {
  expect(step({ work: ['2 chats', '1 background task'] })).toEqual({ step: 'wait', reason: '2 chats, 1 background task' });
  expect(step({ work: ['1 chat'] })).toEqual({ step: 'wait', reason: '1 chat' });
});

it('starts the quiet stretch over when someone uses Ri', () => {
  expect(step({ lastUseAt: now - 10_000 })).toEqual({ step: 'wait', reason: QUIET_REASON });
});

it('holds for an hour after Not now, then follows the quiet rule', () => {
  expect(step({ heldUntil: now + 1 })).toEqual({ step: 'wait', reason: 'you asked to update later' });
  expect(step({ heldUntil: now })).toEqual({ step: 'update' });
});

it('updates by itself at most every 12 hours', () => {
  expect(step({ lastAutomaticAt: now - 11 * HOUR })).toMatchObject({ step: 'wait' });
  expect(step({ lastAutomaticAt: now - 12 * HOUR })).toEqual({ step: 'update' });
});

it('honours the test overrides', () => {
  process.env.RI_UPDATE_QUIET_MS = '5';
  try { expect(updateTiming().quietMs).toBe(5); } finally { delete process.env.RI_UPDATE_QUIET_MS; }
});
