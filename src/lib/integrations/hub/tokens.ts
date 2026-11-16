/**
 * App tokens for the hub (docs/personal-apps.md "The hub"). An app's access token reaches only
 * Ri's integrations endpoint, sees only its grant, and expires in an hour. Its refresh token lasts
 * 30 days and is used once. Presented again within 30 seconds (an app that never got the answer and
 * retried, or two of its requests refreshing at once), it returns the same new pair. After that, a
 * refresh token presented again revokes every token the app holds (RFC 9700 §4.14.2), since only a
 * copy could present it. Turning an app off revokes them all. Tokens are stored hashed, and the pair
 * a retry gets back is kept in memory only, for those 30 seconds.
 */
import crypto from 'node:crypto';
import {
  getHubToken, hubTokenForAccess, hubTokenForRefresh, insertHubToken, revokeHubToken, revokeHubTokensForApp,
  rotateHubToken, touchHubApp, type HubAppRecord,
} from '@/lib/db/queries';
import { processState } from '@/lib/process-state';

export const HUB_TOKEN_PREFIX = 'ri_hub_';
export const HUB_ACCESS_TTL_MS = 60 * 60_000;
export const HUB_REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;
/** How long a replaced refresh token still returns the pair that replaced it. */
export const HUB_REFRESH_GRACE_MS = 30_000;

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const mint = (kind: 'at' | 'rt') => `${HUB_TOKEN_PREFIX}${kind}_${crypto.randomBytes(32).toString('base64url')}`;

export function isHubToken(token: string): boolean {
  return token.startsWith(HUB_TOKEN_PREFIX);
}

export interface HubTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope?: string;
}

function newPair(appId: string, now: number) {
  const access = mint('at'), refresh = mint('rt');
  return {
    row: {
      appId,
      accessHash: hash(access), accessExpiresAt: new Date(now + HUB_ACCESS_TTL_MS).toISOString(),
      refreshHash: hash(refresh), refreshExpiresAt: new Date(now + HUB_REFRESH_TTL_MS).toISOString(),
    },
    response: { access_token: access, token_type: 'Bearer' as const, expires_in: Math.floor(HUB_ACCESS_TTL_MS / 1000), refresh_token: refresh },
  };
}

/** A fresh access and refresh token for an app whose access is on. */
export function issueHubTokens(appId: string, now = Date.now()): HubTokenResponse {
  const pair = newPair(appId, now);
  insertHubToken(pair.row);
  return pair.response;
}

/** The pair that replaced each refresh token in the last 30 seconds, by the old token's hash. */
const recentRotations = () => processState('hub.tokens.recent-rotations', () => new Map<string, { tokens: HubTokenResponse; tokenId: string; until: number }>());

/** The app an access token speaks for, if the token is live and the app's access is on. */
export function verifyHubAccessToken(token: string): HubAppRecord | null {
  if (!isHubToken(token)) return null;
  const found = hubTokenForAccess(hash(token));
  if (!found) return null;
  touchHubApp(found.app.id);
  return found.app;
}

export type RefreshResult =
  | { ok: true; tokens: HubTokenResponse }
  | { ok: false; error: 'invalid_grant'; description: string };

/**
 * RFC 6749 §6, with rotation: the old refresh token is spent and its replacement issued in one
 * transaction that checks the app's access is still on. The same old token within 30 seconds gets
 * the same new pair, while that pair is still live. After that, a replay ends the app's tokens.
 */
export function refreshHubTokens(refreshToken: string, clientId: string, now = Date.now()): RefreshResult {
  const oldHash = isHubToken(refreshToken) ? hash(refreshToken) : null;
  const found = oldHash ? hubTokenForRefresh(oldHash) : null;
  if (!oldHash || !found || found.app.clientId !== clientId) return { ok: false, error: 'invalid_grant', description: 'This refresh token is unknown. Connect to Ri again.' };
  if (found.app.revokedAt) return { ok: false, error: 'invalid_grant', description: 'This app’s access to Ri was turned off. Connect to Ri again.' };
  const recent = recentRotations();
  for (const [key, rotation] of recent) if (rotation.until < now) recent.delete(key);
  const replay = () => {
    recent.delete(oldHash);
    revokeHubTokensForApp(found.app.id);
    return { ok: false as const, error: 'invalid_grant' as const, description: 'This refresh token was already used, so every token for this app was ended. Connect to Ri again.' };
  };
  if (found.token.refreshedAt) {
    // Spent moments ago: a retry, or two requests at once, gets the pair that replaced it, if that
    // pair is still live (not itself spent, not ended by turning the app off).
    if (now - Date.parse(found.token.refreshedAt) <= HUB_REFRESH_GRACE_MS) {
      const rotation = recent.get(oldHash);
      if (!rotation) return { ok: false, error: 'invalid_grant', description: 'This refresh token was just used. Use the tokens from that answer, or connect to Ri again.' };
      const replacement = getHubToken(rotation.tokenId);
      if (replacement && !replacement.revokedAt && !replacement.refreshedAt) return { ok: true, tokens: rotation.tokens };
    }
    // Otherwise only a copy could present it again.
    return replay();
  }
  if (found.token.revokedAt || found.token.refreshExpiresAt <= new Date(now).toISOString()) {
    return { ok: false, error: 'invalid_grant', description: 'This refresh token has expired. Connect to Ri again.' };
  }
  const pair = newPair(found.app.id, now);
  const rotated = rotateHubToken(found.token.id, pair.row);
  if (!rotated.ok) {
    return rotated.reason === 'app_revoked'
      ? { ok: false, error: 'invalid_grant', description: 'This app’s access to Ri was turned off. Connect to Ri again.' }
      : { ok: false, error: 'invalid_grant', description: 'This refresh token was just used. Use the tokens from that answer, or connect to Ri again.' };
  }
  recent.set(oldHash, { tokens: pair.response, tokenId: rotated.token.id, until: now + HUB_REFRESH_GRACE_MS });
  return { ok: true, tokens: pair.response };
}

/** RFC 7009: holding a token is the authority to end it. Unknown tokens succeed too. */
export function revokeHubTokenValue(token: string): void {
  if (!isHubToken(token)) return;
  const access = hubTokenForAccess(hash(token));
  if (access) { revokeHubToken(access.token.id); return; }
  const refresh = hubTokenForRefresh(hash(token));
  if (refresh) revokeHubToken(refresh.token.id);
}
