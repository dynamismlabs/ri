import type { RouterOutputs } from '@/lib/trpc/router';
import { isAppToolkitId } from '@/lib/integrations/app-ids';
import { APPLICATIONS, isApplicationId, parseManagedToolkitId } from '@/lib/integrations/sources/applications';
import type { ApplicationId } from '@/lib/integrations/sources/types';
import type { SkillSummary } from '@/lib/api/skills';
import { APPLICATION_LOGO, integrationMeta } from '@/components/integrations/integration-meta';

export type LibraryFilter = 'all' | 'apps' | 'connectors' | 'skills';
export type LibraryMode = 'yours' | 'discover';
export type LibraryTarget =
  | { kind: 'provider'; id: string }
  /** Accounts a connection source holds for one application (Gmail through Composio), on that application's page. */
  | { kind: 'application'; id: ApplicationId }
  | { kind: 'mcp'; id: string }
  | { kind: 'skill'; ref: string };
/** A connection's own page beside the library: a provider's, a managed application's, or a custom MCP server's. */
export type SetupTarget = Exclude<LibraryTarget, { kind: 'skill' }>;

export interface LibraryItem {
  connectedAppId?: string;
  sourceRef?: string;
  key: string;
  name: string;
  description: string;
  keywords: string;
  kind: Exclude<LibraryFilter, 'all'>;
  target: LibraryTarget;
  providerId?: string;
  /** The brand mark to draw, when it isn't the provider's own (a managed application's). */
  logo?: string;
  chat: boolean;
  view: boolean;
  status: string;
  attention: boolean;
  draft?: boolean;
  added: boolean;
  usable?: boolean;
}

export interface LibrarySources {
  connectedApps?: RouterOutputs['connectedApps']['catalog'];
  providers?: RouterOutputs['integrations']['statusGet']['providers'];
  connections?: RouterOutputs['integrations']['connectionsGet']['connections'];
  servers?: RouterOutputs['integrations']['mcpServersGet']['servers'];
  skills?: SkillSummary[];
  /** Ri's catalog of apps it builds and runs (docs/personal-apps.md "The catalog"), for Discover. */
  catalogApps?: RouterOutputs['appBuilds']['catalog']['apps'];
}

/**
 * One row per product. Provider-backed MCP servers stay under their provider.
 * Managed accounts stay under their application, as in Connectors.
 * A connection whose server supplies an interface (docs/connected-mcp-apps.md) is an app.
 */
export function libraryItems({ providers = [], connections = [], servers = [], skills = [], connectedApps = [] }: LibrarySources): LibraryItem[] {
  const items: LibraryItem[] = [];
  // Retired providers still need a route to manage their existing accounts.
  const known = new Set(providers.map(provider => provider.id));
  const retired = [...new Set(connections.map(connection => connection.providerId))]
    .filter(id => !known.has(id) && !isAppToolkitId(id) && !parseManagedToolkitId(id) && !servers.some(server => !server.providerId && id === `mcp_${server.slug.replace(/[^a-zA-Z0-9_]/g, '_')}`))
    .map(id => ({ id, displayName: id }));
  for (const provider of [...providers, ...retired].filter(provider => !servers.some(server => !server.providerId && provider.id === `mcp_${server.slug.replace(/[^a-zA-Z0-9_]/g, '_')}`))) {
    const accounts = connections.filter(connection => connection.providerId === provider.id);
    const hosted = servers.filter(server => server.providerId === provider.id);
    const added = accounts.length > 0 || hosted.length > 0;
    const attention = accounts.some(account => account.status !== 'active') || hosted.some(server => server.enabled && server.lastStatus !== 'ok');
    const accountNames = accounts.map(account => account.label || account.email || account.accountId).join(' · ');
    const meta = integrationMeta(provider.id);
    // A service with screens of its own is an app, before it's connected too.
    items.push({ key: `provider:${provider.id}`, name: provider.displayName, description: meta.description,
      keywords: `${provider.id} ${meta.category} ${accountNames}`, kind: meta.screens ? 'apps' : 'connectors', providerId: provider.id,
      target: { kind: 'provider', id: provider.id }, chat: true, view: !!meta.screens,
      status: attention ? 'Needs attention' : accounts.length > 1 ? `${accounts.length} accounts` : accounts.length === 1 ? accountNames : added ? 'Finish setup' : 'Connect account',
      attention, added });
  }
  // Accounts a connection source holds (Gmail through Composio): one row per application, whichever sources hold them.
  const managed = new Map<ApplicationId, typeof connections>();
  for (const connection of connections) {
    const applicationId = parseManagedToolkitId(connection.providerId)?.applicationId;
    if (applicationId) managed.set(applicationId, [...(managed.get(applicationId) ?? []), connection]);
  }
  for (const [id, accounts] of managed) {
    const name = APPLICATIONS[id].displayName;
    const accountNames = accounts.map(account => account.label || account.email || account.accountId).join(' · ');
    const attention = accounts.some(account => account.status !== 'active');
    items.push({ key: `application:${id}`, name, description: 'Connected through Composio, with no OAuth app of your own.',
      keywords: `${id} google composio ${accountNames}`, kind: 'connectors', logo: APPLICATION_LOGO[id],
      target: { kind: 'application', id }, chat: true, view: false,
      status: attention ? 'Needs attention' : accounts.length > 1 ? `${accounts.length} accounts` : accountNames, attention, added: true });
  }
  // A personal app is one row, for Ri's own connection. Its agents' connections are listed on its page.
  for (const server of servers.filter(server => server.app?.place.kind === 'ri')) items.push({ key: `app:${server.app!.id}`, name: server.app!.name,
    description: server.url, keywords: `${server.slug} personal app`, kind: 'apps', target: { kind: 'mcp', id: server.id }, chat: true, view: false,
    status: !server.enabled ? 'Disabled' : server.lastStatus === 'ok' ? 'Connected' : server.lastAuthorizationId ? 'Needs attention' : 'Finish signing in',
    attention: server.enabled && server.lastStatus !== 'ok', added: true, usable: server.enabled && server.lastStatus === 'ok' });
  for (const server of servers.filter(server => !server.providerId && !server.app)) items.push({ key: `mcp:${server.id}`, name: server.displayName,
    description: server.url, keywords: `${server.slug} custom MCP`, kind: 'connectors', target: { kind: 'mcp', id: server.id }, chat: true, view: false,
    status: !server.enabled ? 'Disabled' : server.lastStatus === 'ok' ? 'Connected' : 'Needs attention',
    attention: server.enabled && server.lastStatus !== 'ok', added: true, usable: server.enabled && server.lastStatus === 'ok' });
  for (const skill of skills) items.push({ key: `skill:${skill.ref}`, name: skill.name, description: skill.description || 'Instructions for a repeatable workflow.',
    keywords: skill.location.kind === 'project' ? skill.location.projectName : skill.location.kind, kind: 'skills', target: { kind: 'skill', ref: skill.ref },
    chat: true, view: false, status: skill.hasErrors ? 'Needs attention' : skill.location.kind === 'draft' ? 'Draft' : skill.location.kind === 'project' ? skill.location.projectName : skill.location.kind === 'global' ? 'All agents on this computer' : 'Ri agents',
    attention: skill.hasErrors, added: true, draft: skill.location.kind === 'draft' });
  for (const item of items) {
    const connected = connectedApps.find(app => item.target.kind === 'mcp' ? app.id === item.target.id : item.target.kind === 'provider' && app.providerId === item.target.id);
    if (connected) { item.view = true; item.kind = 'apps'; item.connectedAppId = connected.id; }
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export function filterLibrary(items: LibraryItem[], mode: LibraryMode, filter: LibraryFilter, query: string): LibraryItem[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return items.filter(item => (mode === 'discover' ? item.kind === 'connectors' || !!item.providerId || !!item.connectedAppId : item.added)
    && (filter === 'all' || item.kind === filter || (filter === 'connectors' && !!item.connectedAppId))
    && terms.every(term => `${item.name} ${item.description} ${item.keywords}`.toLocaleLowerCase().includes(term)));
}

export function libraryLocation(query: Record<string, string>) {
  return { mode: query.browse === 'discover' ? 'discover' as const : 'yours' as const,
    filter: ['apps', 'connectors', 'skills'].includes(query.filter) ? query.filter as LibraryFilter : 'all' as const,
    search: query.q ?? '', provider: query.provider, mcp: query.mcp,
    application: isApplicationId(query.application) ? query.application : undefined };
}

/** No connection's page open: every key `setupQuery` sets, cleared. */
export const NO_SETUP = { provider: undefined, application: undefined, mcp: undefined } as const;

/** The query that opens one connection's page beside the library, and closes any other. */
export function setupQuery(target: SetupTarget): Record<string, string | undefined> {
  return { ...NO_SETUP, [target.kind]: target.id };
}

/** Any library or catalog entry's target. */
type AnyTarget = { kind: string; id?: string; ref?: string };

/** Whether a library entry is a connection with a page of its own (not a skill or a catalog entry). */
export function isSetupTarget(target: AnyTarget): target is SetupTarget {
  return target.kind === 'provider' || target.kind === 'application' || target.kind === 'mcp';
}

/** Whether this connection's page is the one open. */
export function isSetupOpen(query: Record<string, string>, target: AnyTarget): boolean {
  return isSetupTarget(target) && query[target.kind] === target.id;
}

export function libraryRoute(query: Record<string, string>, patch: Record<string, string | undefined>): string {
  const next = new URLSearchParams(query);
  for (const [key, value] of Object.entries(patch)) {
    if (value) next.set(key, value); else next.delete(key);
  }
  return next.size ? `?${next}` : '';
}
