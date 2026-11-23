/**
 * Names Ri used before the main chat's role was called the coordinator and
 * Ri's own tools moved to `/api/home/` (docs/coordinator-harness.md, "Old
 * names"). Agents learned them, saved notes and skills mention them, and other
 * agents' settings, OAuth sign-ins and devices on an older release still use
 * them. So Ri keeps accepting each one and answers with the current name. The
 * values stored in a home were rewritten by the migration that made the
 * change, so nothing reads them from the database.
 */

/** The address `message_agent` and `delegate_work` used for the app's main chat. */
export const LEGACY_COORDINATOR_ADDRESS = 'orchestrator';
/** `chat_sessions.type` for main chats and scheduled Ri chats. */
export const LEGACY_COORDINATOR_CHAT_TYPE = 'orchestration';

/** A `chat_sessions.type` read from a home that hasn't updated (an import source), as the current type. */
export function currentChatType(type: string): string {
  return type === LEGACY_COORDINATOR_CHAT_TYPE ? 'coordinator' : type;
}

const LEGACY_HOME_API = '/api/orchestrator/';
const HOME_API = '/api/home/';

/** A path under the old `/api/orchestrator/` prefix, as its `/api/home/` path. Any other path is unchanged. */
export function currentHomeApiPath(pathname: string): string {
  return pathname.startsWith(LEGACY_HOME_API) ? HOME_API + pathname.slice(LEGACY_HOME_API.length) : pathname;
}

/** Whether a request came in on the old prefix. */
export function isLegacyHomeApiPath(pathname: string): boolean {
  return pathname.startsWith(LEGACY_HOME_API);
}

/** A `/api/home/` path as the old prefix, for a home that hasn't updated yet. */
export function legacyHomeApiPath(pathname: string): string | null {
  return pathname.startsWith(HOME_API) ? LEGACY_HOME_API + pathname.slice(HOME_API.length) : null;
}

/**
 * Call a home's `/api/home/` path, and its old path when the home answers as
 * a home on an older release does: no such route (404), or a proxy that only
 * lets this credential reach the old path (401, 403). The first answer stands
 * for anything else, and for a path with no old form.
 */
export async function fetchHomeApi(pathname: string, call: (pathname: string) => Promise<Response>): Promise<Response> {
  const response = await call(pathname);
  const legacy = legacyHomeApiPath(pathname);
  if (!legacy || ![401, 403, 404].includes(response.status)) return response;
  const older = await call(legacy);
  return older.status === 404 ? response : older;
}

/** Action input with the old names for the main chat replaced by the current ones. */
export function withCurrentNames(action: string, input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input };
  if (next.target === LEGACY_COORDINATOR_ADDRESS) next.target = 'coordinator';
  if (next.targetKind === LEGACY_COORDINATOR_ADDRESS) next.targetKind = 'coordinator';
  if (action === 'search_sessions' && next.type === LEGACY_COORDINATOR_CHAT_TYPE) next.type = 'coordinator';
  return next;
}
