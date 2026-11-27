import { Cron } from 'croner';
import { normalizeTimestamp } from '@/lib/utils/timestamps';
import type { StoredRateLimitBucket } from './rate-limits';
import { rateLimitRecord as object } from './rate-limit-failure';

const BLOCKED = new Set(['exceeded', 'blocked', 'limited', 'throttled', 'rejected', 'rate_limit_reached', 'usage_limit_reached', 'usage_limit_exceeded', 'usage_limit', 'weekly_limit', 'monthly_limit']);
export const isRateLimitBlocked = (status: string) => BLOCKED.has(status.toLowerCase()) || /_(?:usage_limit|spend_control)_reached$/.test(status.toLowerCase());

/** Absolute provider timestamps first, then unambiguous relative waits or zoned reset times. */
export function rateLimitResetFromEvent(event: { raw?: unknown; content?: string | null; createdAt: string }): string | null {
  const codex = codexWindows(event);
  if (codex) return latestBlockingReset(codex);
  const observedAt = normalizeTimestamp(event.createdAt);
  const raw = object(event.raw);
  const native = object(raw.raw);
  const params = object(native.params);
  const error = object(params.error);
  const apiError = object(native.api_error_params);
  const claudeLimit = object(apiError.rate_limit_info);
  for (const value of [raw.resetAt, claudeLimit.resetsAt, native.resetAt, error.resetsAt, error.resetAt, apiError.resets_at, apiError.reset_at]) {
    const ms = typeof value === 'number' ? value * 1000 : typeof value === 'string' ? Date.parse(value) : NaN;
    if (Number.isFinite(new Date(ms).getTime())) return new Date(ms).toISOString();
  }
  const text = event.content ?? '';
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})\b/);
  if (iso && Number.isFinite(Date.parse(iso[0]))) return new Date(iso[0]).toISOString();
  const wait = text.match(/(?:try again|retry|resets?) in\s+((?:\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\s*(?:,|and)?\s*)+)/i);
  if (wait) {
    let ms = 0;
    for (const part of wait[1].matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)/gi)) {
      ms += Number(part[1]) * (/^h/i.test(part[2]) ? 3_600_000 : /^m/i.test(part[2]) ? 60_000 : 1000);
    }
    const reset = new Date(Date.parse(observedAt) + ms);
    if (ms > 0 && Number.isFinite(reset.getTime())) return reset.toISOString();
  }
  const clock = text.match(/resets?\s+(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\s+at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([A-Za-z_]+\/[A-Za-z_/]+|UTC)\)/i);
  if (clock) {
    const hour = Number(clock[3]);
    const minute = Number(clock[4] ?? 0);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    try {
      const month = clock[1] ? 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ').indexOf(clock[1].toLowerCase()) + 1 : '*';
      return new Cron(`${minute} ${hour % 12 + (clock[5].toLowerCase() === 'pm' ? 12 : 0)} ${clock[2] ?? '*'} ${month} *`, { timezone: clock[6] })
        .nextRun(new Date(observedAt))?.toISOString() ?? null;
    } catch { /* Unknown timezone: ask for a time rather than guess. */ }
  }
  return null;
}

export type RecoveryEvent = { raw?: unknown; content?: string | null; createdAt: string };

/** The normalized Codex scalar reset is the first window, even when that window has room. */
function codexWindows(event: RecoveryEvent): StoredRateLimitBucket[] | null {
  const envelope = object(event.raw);
  const native = object(envelope.raw);
  if (native.method !== 'account/rateLimits/updated') return null;
  const params = object(native.params);
  const pool = object(params.rateLimits);
  const poolId = typeof pool.limitId === 'string' ? pool.limitId : typeof envelope.limitType === 'string' ? envelope.limitType : 'codex';
  return Object.entries(pool).flatMap(([key, value]) => {
    const window = object(value);
    if (key !== 'primary' && key !== 'secondary' && !('usedPercent' in window)) return [];
    if (!value || typeof value !== 'object') return [];
    const percent = typeof window.usedPercent === 'number' ? window.usedPercent : undefined;
    const reset = typeof window.resetsAt === 'number' ? window.resetsAt * 1000 : typeof window.resetsAt === 'string' ? Date.parse(window.resetsAt) : NaN;
    return [{ id: `${poolId}:${key}`, owner: { kind: 'account' as const }, applicability: { kind: 'provider_pool' as const, pool: poolId },
      observedAt: normalizeTimestamp(event.createdAt), usedPercent: percent,
      ...(Number.isFinite(new Date(reset).getTime()) ? { resetAt: new Date(reset).toISOString() } : {}) }];
  });
}

function latestBlockingReset(buckets: StoredRateLimitBucket[]): string | null {
  const times: number[] = [];
  for (const bucket of buckets) {
    // Codex repeats pool enforcement on every window, including windows with room.
    const blocking = bucket.usedPercent !== undefined ? bucket.usedPercent >= 100
      : bucket.enforcement?.allowed === false || isRateLimitBlocked(bucket.enforcement?.status ?? '');
    if (!blocking) continue;
    const at = bucket.resetAt ? Date.parse(bucket.resetAt) : NaN;
    if (!Number.isFinite(at)) return null;
    times.push(at);
  }
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

/** Opaque provider identity is the only proof that a later account read belongs to this failure. */
export function rateLimitAccountContext(rawValue: unknown): { accountId?: string; authContextId?: string } {
  const raw = object(rawValue);
  const native = object(raw.raw);
  const params = object(native.params);
  const bound = object(raw.rateLimitContext);
  const accountId = bound.accountId ?? raw.accountId ?? params.accountId ?? native.accountId;
  const authContextId = bound.authContextId ?? raw.authContextId;
  return { ...(typeof accountId === 'string' ? { accountId } : {}), ...(typeof authContextId === 'string' ? { authContextId } : {}) };
}

export function sameRateLimitAccount(event: RecoveryEvent, snapshot: { accountId?: string; authContextId?: string }): boolean {
  const bound = rateLimitAccountContext(event.raw);
  if (bound.accountId && snapshot.accountId) return bound.accountId === snapshot.accountId;
  return !!bound.authContextId && bound.authContextId === snapshot.authContextId;
}

/** Used only after an actual failure. Unknown applicable blocking resets remain unknown. */
export function recoveryRateLimits(event: RecoveryEvent, buckets: StoredRateLimitBucket[], model: string | null) {
  const raw = object(event.raw);
  const limitType = raw.limitType ?? object(object(object(raw.raw).api_error_params).rate_limit_info).rateLimitType;
  const applicable = buckets.filter(bucket => {
    if (bucket.credits || bucket.overage) return false;
    if (Date.parse(bucket.observedAt) < Date.parse(normalizeTimestamp(event.createdAt)) - 10 * 60_000) return false;
    const scope = bucket.applicability;
    if (scope.kind === 'all_models') return true;
    if (scope.kind === 'models') return !!model && scope.modelIds.includes(model);
    if (scope.kind === 'model_family') return !!model && model.toLowerCase().includes(scope.family.toLowerCase());
    if (bucket.id === limitType) return true;
    if (scope.kind === 'provider_pool') return scope.pool === limitType
      || (raw.providerType === 'codex' && scope.pool === 'codex' && !bucket.collectionId);
    return false;
  });
  const native = codexWindows(event);
  const merged = new Map((native ?? []).map(bucket => [bucket.id, bucket]));
  for (const bucket of applicable) merged.set(bucket.id, bucket);
  const candidates = [...merged.values()];
  const blocking = candidates.filter(bucket => bucket.usedPercent !== undefined ? bucket.usedPercent >= 100
    : bucket.enforcement?.allowed === false || isRateLimitBlocked(bucket.enforcement?.status ?? ''));
  const reset = latestBlockingReset(blocking);
  const unknownObservedAt = blocking.reduce((latest, bucket) => {
    if (Number.isFinite(Date.parse(bucket.resetAt ?? ''))) return latest;
    return Math.max(latest, Date.parse(bucket.observedAt));
  }, 0);
  if (unknownObservedAt) return { resetAt: null, unknownObservedAt };
  // A native Codex report identifies its windows. Never reuse its synthesized scalar or display text.
  if (native) return { resetAt: reset, unknownObservedAt };
  const direct = rateLimitResetFromEvent(event);
  const times = [direct, reset].filter((value): value is string => !!value).map(Date.parse);
  return { resetAt: times.length ? new Date(Math.max(...times)).toISOString() : null, unknownObservedAt };
}
