import { describe, expect, it } from 'vitest';
import type { StreamEvent } from '@agentex/agent';
import { parseStreamEvent } from '@/lib/runner/parse';
import { rateLimitResetFromEvent, recoveryRateLimits, sameRateLimitAccount } from './rate-limit-recovery';
import { claudeUsageRateLimits } from '@agentex/agent/providers/claude/parse';
import { isChatRateLimitFailure } from './rate-limit-failure';
import type { StoredRateLimitBucket } from './rate-limits';

const at = '2026-10-22T18:00:00.000Z';
const recoveryResetAt = (...args: Parameters<typeof recoveryRateLimits>) => recoveryRateLimits(...args).resetAt;
const stream = (fields: Record<string, unknown>) => ({ timestamp: at, providerType: 'claude', ...fields }) as StreamEvent;
const bucket = (resetAt: string, extra: Partial<StoredRateLimitBucket> = {}): StoredRateLimitBucket => ({
  id: 'five_hour', owner: { kind: 'account' }, applicability: { kind: 'all_models' }, observedAt: at, usedPercent: 100, resetAt, ...extra,
});

describe('rate limit detection', () => {
  it('keeps account telemetry separate from a turn failure', () => {
    const rejected = parseStreamEvent('chat', stream({ type: 'rate_limit', status: 'exceeded' }));
    expect(rejected?.source).toBe('rate_limit');
    expect(isChatRateLimitFailure({ ...rejected, source: rejected!.source! })).toBe(false);
    expect(parseStreamEvent('chat', stream({ type: 'rate_limit', status: 'allowed_warning' }))).toBeNull();
  });
  it('recognizes a final Codex usage failure, but leaves retries hidden', () => {
    const raw = { method: 'error', params: { error: { message: 'You have hit your usage limit. Try again in 2 hours 15 minutes.' }, willRetry: false } };
    expect(parseStreamEvent('chat', stream({ type: 'unknown', providerType: 'codex', raw }))?.source).toBe('rate_limit');
    raw.params.willRetry = true;
    expect(parseStreamEvent('chat', stream({ type: 'unknown', providerType: 'codex', raw }))?.source).toBe('system');
  });
  it('recognizes Claude synthetic failures while leaving ordinary assistant prose alone', () => {
    const text = "You've hit your limit · resets 5pm (America/Denver)";
    expect(parseStreamEvent('chat', stream({ type: 'assistant', text, raw: { error: 'rate_limit' } }))?.source).toBe('rate_limit');
    expect(parseStreamEvent('chat', stream({ type: 'assistant', text }))?.source).toBe('agent');
  });
});

describe('reset time selection', () => {
  const event = { createdAt: at, content: null, raw: { resetAt: '2026-10-22T19:00:00Z' } };
  it('uses structured values and the latest exhausted applicable window', () => {
    expect(recoveryResetAt(event, [bucket('2026-10-22T20:00:00Z'), bucket('2026-10-25T18:00:00Z', { id: 'weekly' })], 'claude-sonnet-4-6')).toBe('2026-10-25T18:00:00.000Z');
  });
  it('ignores stale, unrelated-model, credit and unexhausted windows', () => {
    expect(recoveryResetAt(event, [
      bucket('2026-11-01T00:00:00Z', { observedAt: '2026-10-21T00:00:00Z' }),
      bucket('2026-11-01T00:00:00Z', { applicability: { kind: 'model_family', family: 'opus' } }),
      bucket('2026-11-01T00:00:00Z', { credits: { hasCredits: false } }),
      bucket('2026-11-01T00:00:00Z', { usedPercent: 30 }),
      bucket('2026-11-01T00:00:00Z', { usedPercent: 30, enforcement: { status: 'usage_limit_reached', allowed: false } }),
    ], 'claude-sonnet-4-6')).toBe('2026-10-22T19:00:00.000Z');
  });
  it('ignores a different Codex pool', () => {
    expect(recoveryResetAt({ ...event, raw: { ...event.raw, limitType: 'codex' } }, [bucket('2026-11-01T00:00:00Z', { applicability: { kind: 'provider_pool', pool: 'codex_other' } })], 'gpt-5')).toBe('2026-10-22T19:00:00.000Z');
  });
  it('reads relative waits and timezone-qualified Claude text', () => {
    expect(rateLimitResetFromEvent({ createdAt: at, content: 'Try again in 2 hours 15 minutes.' })).toBe('2026-10-22T20:15:00.000Z');
    expect(rateLimitResetFromEvent({ createdAt: at, content: 'Rate limit. Resets 5pm (America/Denver)' })).toBe('2026-10-22T23:00:00.000Z');
    expect(rateLimitResetFromEvent({ createdAt: '2026-10-22 18:00:00', content: 'Try again in 2 hours' })).toBe('2026-10-22T20:00:00.000Z');
  });
  it('uses the structured reset on the actual Claude API error shape', () => {
    const raw = { providerType: 'claude', raw: {
      error: 'rate_limit', is_api_error_message: true, api_error_status: 429,
      api_error_params: { rate_limit_info: { status: 'rejected', resetsAt: Date.parse('2026-10-22T23:00:00Z') / 1000 } },
    } };
    expect(rateLimitResetFromEvent({ createdAt: at, raw, content: "You've hit your 5-hour limit · resets 5pm (America/Denver)" })).toBe('2026-10-22T23:00:00.000Z');
    expect(rateLimitResetFromEvent({ createdAt: at, content: 'Resets Oct 23 at 5pm (America/Denver)' })).toBe('2026-10-23T23:00:00.000Z');
  });
  it('keeps an unknown or ambiguous reset unknown', () => {
    expect(rateLimitResetFromEvent({ createdAt: at, content: 'Try again later' })).toBeNull();
    expect(rateLimitResetFromEvent({ createdAt: at, content: 'Resets 5pm' })).toBeNull();
    expect(rateLimitResetFromEvent({ createdAt: at, raw: { resetAt: 'bad timestamp' } })).toBeNull();
  });
  it('ignores Codex scalar resets for an unexhausted first window', () => {
    const raw = { providerType: 'codex', type: 'rate_limit', limitType: 'codex', resetAt: '2026-10-29T18:00:00Z', raw: {
      method: 'account/rateLimits/updated', params: { rateLimits: { limitId: 'codex',
        primary: { usedPercent: 20, resetsAt: Date.parse('2026-10-29T18:00:00Z') / 1000 },
        secondary: { usedPercent: 100, resetsAt: Date.parse('2026-10-22T20:00:00Z') / 1000 } } },
    } };
    expect(recoveryResetAt({ ...event, raw }, [], 'gpt-5')).toBe('2026-10-22T20:00:00.000Z');
    expect(rateLimitResetFromEvent({ ...event, raw })).toBe('2026-10-22T20:00:00.000Z');
    delete (raw.raw.params.rateLimits.secondary as { resetsAt?: number }).resetsAt;
    expect(recoveryResetAt({ ...event, raw }, [], 'gpt-5')).toBeNull();
  });
  it('uses actual Claude usage normalization without guessing opaque model pool membership', () => {
    const normalized = claudeUsageRateLimits({ rate_limits: {
      five_hour: { utilization: 100, resets_at: '2026-10-22T20:00:00Z' },
      model_scoped: [{ id: 'opus-allowance', display_name: 'Claude Opus', utilization: 100, resets_at: '2026-10-29T18:00:00Z' }],
    } }, at)!;
    expect(normalized.snapshot.buckets.find(b => b.collectionId === 'model_scoped')?.applicability.kind).toBe('provider_pool');
    expect(recoveryResetAt(event, normalized.snapshot.buckets, 'sonnet')).toBe('2026-10-22T20:00:00.000Z');
  });
  it('preserves uncertainty when any applicable exhausted window has no reset', () => {
    const unknown = bucket('2026-10-22T20:00:00Z', { id: 'seven_day', resetAt: undefined });
    expect(recoveryResetAt(event, [unknown], 'sonnet')).toBeNull();
  });
  it('requires matching account or auth context before borrowing later readings', () => {
    const bound = { ...event, raw: { rateLimitContext: { accountId: 'account-a', authContextId: 'scope-a' } } };
    expect(sameRateLimitAccount(bound, { accountId: 'account-a' })).toBe(true);
    expect(sameRateLimitAccount(bound, { accountId: 'account-b', authContextId: 'scope-a' })).toBe(false);
    expect(sameRateLimitAccount(bound, { authContextId: 'scope-a' })).toBe(true);
    expect(sameRateLimitAccount(event, { accountId: 'account-b' })).toBe(false);
  });
});
