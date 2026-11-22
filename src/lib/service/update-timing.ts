/**
 * When a downloaded release takes effect, by itself (docs/always-on-spec.md
 * section 7.2). One rule for every Home: one quiet minute,
 * never stopping running work, and at most one automatic update every 12 hours.
 * Kept free of I/O and clocks, so the rule is tested as it is written.
 */
const minutes = (value: number) => value * 60_000;
function setting(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
/** Server and desktop check the same feed every 15–20 minutes, spread across installs. */
export function updateCheckIntervalMs() {
  return setting('RI_UPDATE_CHECK_MS', minutes(15 + Math.random() * 5));
}
export const updateTiming = () => ({
  quietMs: setting('RI_UPDATE_QUIET_MS', minutes(1)),
  holdMs: setting('RI_UPDATE_HOLD_MS', minutes(60)),
  spacingMs: setting('RI_UPDATE_SPACING_MS', minutes(12 * 60)),
  longWaitMs: setting('RI_UPDATE_LONG_WAIT_MS', minutes(24 * 60)),
});
export type UpdateTiming = ReturnType<typeof updateTiming>;

export interface TimingFacts {
  now: number;
  /** What an update would cut off right now. */
  work: string[];
  /** The last time someone used Ri: a window, or an agent connected over MCP. */
  lastUseAt: number;
  /** When the current quiet stretch could have begun at the earliest. */
  quietFrom: number;
  heldUntil?: number;
  lastAutomaticAt?: number;
}
export type TimingStep =
  | { step: 'wait'; reason: string }
  | { step: 'update' };

/** The person can read this, in Settings and in `ri status`. */
export const QUIET_REASON = 'a quiet moment';

export function nextTimingStep(facts: TimingFacts, timing: UpdateTiming = updateTiming()): TimingStep {
  const { now } = facts;
  if (facts.heldUntil && now < facts.heldUntil) return { step: 'wait', reason: 'you asked to update later' };
  if (facts.lastAutomaticAt && now - facts.lastAutomaticAt < timing.spacingMs) return { step: 'wait', reason: 'the next update window, since Ri updates by itself at most every 12 hours' };
  if (facts.work.length) return { step: 'wait', reason: facts.work.join(', ') };
  // Any use starts the quiet stretch over. There is no separate countdown.
  if (now - Math.max(facts.lastUseAt, facts.quietFrom) < timing.quietMs) return { step: 'wait', reason: QUIET_REASON };
  return { step: 'update' };
}
