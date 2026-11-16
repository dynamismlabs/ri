import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as q from '@/lib/db/queries';
import { HUB_ACCESS_TTL_MS, HUB_REFRESH_GRACE_MS, isHubToken, issueHubTokens, refreshHubTokens, revokeHubTokenValue, verifyHubAccessToken } from './tokens';

/** App tokens for the hub: they expire, refresh once each, and stop when the app is turned off. */
function app(clientId = `client-${crypto.randomUUID()}`) {
  return q.upsertHubApp({ clientId, name: 'Bloom', grant: { accounts: [], services: ['list_tasks'] } });
}

describe('hub tokens', () => {
  it('reach as the app until they expire', () => {
    const bloom = app();
    const now = Date.now();
    const tokens = issueHubTokens(bloom.id, now - HUB_ACCESS_TTL_MS - 1000);
    expect(isHubToken(tokens.access_token)).toBe(true);
    expect(tokens.expires_in).toBe(3600);
    expect(verifyHubAccessToken(tokens.access_token)).toBeNull();
    const fresh = issueHubTokens(bloom.id);
    expect(verifyHubAccessToken(fresh.access_token)?.id).toBe(bloom.id);
    expect(verifyHubAccessToken('ri_hub_at_unknown')).toBeNull();
    expect(verifyHubAccessToken('not-a-hub-token')).toBeNull();
  });

  it('refresh once, for the client they were issued to, and a replay after 30 seconds ends every token the app holds', () => {
    const bloom = app();
    const first = issueHubTokens(bloom.id);
    expect(refreshHubTokens(first.refresh_token, 'someone-else')).toMatchObject({ ok: false, error: 'invalid_grant' });
    const second = refreshHubTokens(first.refresh_token, bloom.clientId);
    if (!second.ok) throw new Error(second.description);
    // The old access token went with its refresh token.
    expect(verifyHubAccessToken(first.access_token)).toBeNull();
    expect(verifyHubAccessToken(second.tokens.access_token)?.id).toBe(bloom.id);
    // The app retries within 30 seconds (it never got the answer, or two requests refreshed at once):
    // the same new pair, nothing ended.
    expect(refreshHubTokens(first.refresh_token, bloom.clientId)).toEqual(second);
    expect(refreshHubTokens(first.refresh_token, bloom.clientId, Date.now() + HUB_REFRESH_GRACE_MS - 1000)).toEqual(second);
    expect(verifyHubAccessToken(second.tokens.access_token)?.id).toBe(bloom.id);
    // After that, only a copy could present it again, so everything stops.
    expect(refreshHubTokens(first.refresh_token, bloom.clientId, Date.now() + HUB_REFRESH_GRACE_MS + 1000)).toMatchObject({ ok: false, error: 'invalid_grant' });
    expect(verifyHubAccessToken(second.tokens.access_token)).toBeNull();
    expect(refreshHubTokens(second.tokens.refresh_token, bloom.clientId)).toMatchObject({ ok: false });
  });

  it('never hand back a replaced pair that was used or ended since, and never issue after a revocation', () => {
    const bloom = app();
    const first = issueHubTokens(bloom.id);
    const second = refreshHubTokens(first.refresh_token, bloom.clientId);
    if (!second.ok) throw new Error(second.description);
    const third = refreshHubTokens(second.tokens.refresh_token, bloom.clientId);
    if (!third.ok) throw new Error(third.description);
    // The first token again, though the pair it got was already used: a copy. Everything ends.
    expect(refreshHubTokens(first.refresh_token, bloom.clientId)).toMatchObject({ ok: false });
    expect(verifyHubAccessToken(third.tokens.access_token)).toBeNull();
    // Turned off between a refresh and its retry: no pair comes back.
    const other = app();
    const tokens = issueHubTokens(other.id);
    expect(refreshHubTokens(tokens.refresh_token, other.clientId).ok).toBe(true);
    q.revokeHubApp(other.id);
    expect(refreshHubTokens(tokens.refresh_token, other.clientId)).toMatchObject({ ok: false });
    // The rotation itself checks the stored revocation in its transaction.
    const late = issueHubTokens(app().id);
    const row = q.hubTokenForRefresh(createHash('sha256').update(late.refresh_token).digest('hex'))!;
    q.revokeHubApp(row.app.id);
    expect(q.rotateHubToken(row.token.id, { appId: row.app.id, accessHash: 'a', accessExpiresAt: '2099-01-01T00:00:00.000Z', refreshHash: 'r', refreshExpiresAt: '2099-01-01T00:00:00.000Z' })).toEqual({ ok: false, reason: 'app_revoked' });
  });

  it('stop at the next call when the app is turned off, and can be ended by whoever holds them', () => {
    const bloom = app();
    const tokens = issueHubTokens(bloom.id);
    q.revokeHubApp(bloom.id);
    expect(verifyHubAccessToken(tokens.access_token)).toBeNull();
    expect(refreshHubTokens(tokens.refresh_token, bloom.clientId)).toMatchObject({ ok: false });
    // Connecting again turns it back on with a new grant revision.
    const again = q.upsertHubApp({ clientId: bloom.clientId, name: 'Bloom', grant: { accounts: [], services: [] } });
    expect(again).toMatchObject({ id: bloom.id, revokedAt: null, grantRevision: bloom.grantRevision + 1 });
    const next = issueHubTokens(bloom.id);
    revokeHubTokenValue(next.access_token);
    expect(verifyHubAccessToken(next.access_token)).toBeNull();
  });
});
