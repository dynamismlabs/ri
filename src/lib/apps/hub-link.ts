/**
 * Whether an address an app's view asked Ri to open is an approval for an app to use Ri's hub
 * (src/lib/apps/hub-connect.ts): Ri's authorization page for its hub, on this computer or at this
 * Ri's own address. Ri's server checks it in full before showing anything, so this only decides
 * whether Ri asks in its own dialog instead of opening the address.
 */
const HUB_PATH = '/api/integrations/mcp';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function isHubAuthorization(raw: string, here = typeof window === 'undefined' ? '' : window.location.host): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.pathname !== '/oauth/authorize') return false;
  if (!LOOPBACK.has(url.hostname) && url.host !== here) return false;
  const resource = url.searchParams.get('resource');
  if (!resource) return false;
  try { return new URL(resource).pathname === HUB_PATH; } catch { return false; }
}
