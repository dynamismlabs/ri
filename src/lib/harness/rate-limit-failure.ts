import type { HarnessId } from './registry';

export function supportsRateLimitResume(harness: HarnessId): boolean {
  return harness === 'claude' || harness === 'codex' || harness === 'antigravity';
}

export function rateLimitRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function isRateLimitFailure(text: string): boolean {
  return /\b(?:rate[_ -]?limit|usage[_ -]?limit|usageLimitExceeded|resource[_ -]exhausted|too many requests|quota.{0,25}(?:exceeded|exhausted)|you['’]ve (?:hit|reached) your (?:[\w-]+\s+)?limit)/i.test(text);
}

type Event = { source: string; content?: string | null; raw?: unknown; externalParentToolCallId?: string | null };

/** Only actual provider errors. Account-usage notifications and normal assistant text cannot arm a send. */
export function isChatRateLimitFailure(event: Event): boolean {
  if (event.externalParentToolCallId) return false;
  if (event.source === 'rate_limit') {
    // Old Claude and Codex capacity notifications can be rendered as pills.
    return rateLimitRecord(event.raw).type !== 'rate_limit';
  }
  const envelope = rateLimitRecord(event.raw);
  const native = rateLimitRecord(envelope.raw);
  if (event.source === 'agent') return envelope.providerType === 'claude' && native.error === 'rate_limit';
  if (event.source !== 'error') return false;
  if (native.method === 'error' || native.method === 'turn/failed') {
    const params = rateLimitRecord(native.params);
    if (params.willRetry === true) return false;
    const error = rateLimitRecord(params.error);
    return 'usageLimitExceeded' in rateLimitRecord(error.codexErrorInfo)
      || error.codexErrorInfo === 'usageLimitExceeded' || isRateLimitFailure(event.content ?? '');
  }
  return envelope.providerType === 'claude' && isRateLimitFailure(event.content ?? '');
}
