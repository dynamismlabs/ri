/**
 * When someone last used this Home, for the quiet stretch before an update
 * (docs/always-on-spec.md 7.2): a window saying a person typed or clicked, or an
 * agent connected over MCP. Polling and streams don't count, since an idle window
 * does both all day. Neither does a chat's own work, which counts as running.
 */
import { currentHomeApiPath } from '@/lib/coordinator/legacy-names';
import { processState } from '@/lib/process-state';

const state = processState('service.last-use', () => ({ at: 0 }));

export function noteUse(at = Date.now()) { state.at = at; }
export function lastUseAt() { return state.at; }

const AGENT_CONNECTIONS = new Set(['/api/mcp', '/api/home/mcp', '/api/team/mcp']);
/** A request from an agent connected from outside ("Ri in other agents"). */
export function isAgentCall(method: string | undefined, pathname: string) {
  return method === 'POST' && AGENT_CONNECTIONS.has(currentHomeApiPath(pathname));
}
