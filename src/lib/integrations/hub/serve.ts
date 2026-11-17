/**
 * What an app sees on Ri's integrations endpoint with its own token (docs/personal-apps.md "The
 * hub"): exactly its grant, read fresh on every request. Each granted tool is limited to the
 * accounts it was granted on, and runs through the same gated `runAction` as every other caller
 * (approval, redaction, audit), as the app. Writes ask the person every time. Ri's own services
 * are tools too, `ri__<name>`, under the same grant. Every call goes in the app's audit log with
 * what started it. `ri__list_accounts` names the accounts Ri lent the app, for every app.
 */
import { createHmac } from 'node:crypto';
import { z as z4 } from 'zod/v4';
import { z } from 'zod';
import { accountDisplay, modelSafeOutcome, toToolName, type AccountChoice, type Caller, type Connection, type IntegrationRuntime } from '@integrations/engine';
import type { RiMcpServer, RiMcpToolResult } from '@/lib/mcp/http-server';
import { insertHubCall, type HubAppRecord } from '@/lib/db/queries';
import { isAppToolkitId } from '../app-ids';
import { callRiService, RI_SERVICE_DESCRIPTIONS, riServiceInputs, RiServiceError, type RiServiceName } from './ri-services';
import { startedByFor, type StartedBy } from './origin';
import { RI_SERVICE_TOOL_PREFIX, riServiceTool } from './grant';

const text = (value: unknown, isError = false): RiMcpToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) });

export function hubCaller(app: Pick<HubAppRecord, 'id'>, startedBy: StartedBy): Caller {
  return { type: 'app', id: `hub:${app.id}`, hubApp: { appId: app.id, startedBy } };
}

function audit(app: HubAppRecord, tool: string, connectionId: string | null, startedBy: StartedBy, status: string, error?: string) {
  try {
    insertHubCall({
      appId: app.id, tool, connectionId, status,
      startedByKind: startedBy.kind, startedById: startedBy.id ?? null, startedByLabel: startedBy.label ?? null,
      error: error ? error.slice(0, 500) : null,
    });
  } catch (err) {
    // The call already ran or was refused. A failed log line must not change its answer.
    console.warn('[hub] recording the call failed:', err instanceof Error ? err.message : err);
  }
}

/** The tool every app has for the accounts Ri lent it. It isn't a consent choice: it shows only the app's own grant. */
export const LIST_ACCOUNTS_TOOL = `${RI_SERVICE_TOOL_PREFIX}list_accounts`;

/** One account Ri lent an app, as `ri__list_accounts` answers. */
export interface HubLentAccount {
  id: string;
  /** What a tool's `account` argument takes for it. `null` when Ri has no email or name for it. */
  name: string | null;
  provider: string;
  /** The granted tools this account backs, named as `tools/list` names them. */
  tools: string[];
}

/**
 * An account's ID for one app: the same on every tool it backs and for as long as it stays connected,
 * and never the connection's own ID. Two apps get different IDs for the same account, so they can't
 * match up what each was lent.
 */
export function hubAccountId(appId: string, connectionId: string): string {
  return `acc_${createHmac('sha256', appId).update(connectionId).digest('hex').slice(0, 24)}`;
}

/** How an account is named to an app, here and in a tool's `account` argument alike. */
function accountChoice(connection: Connection): AccountChoice {
  return { connectionId: connection.id, ...(connection.email ? { email: connection.email } : {}), ...(connection.label ? { label: connection.label } : {}) };
}

/** Where the app is: its own address and where it returns the person, for attribution only. */
function appUrls(app: HubAppRecord, redirectUris: readonly string[]): string[] {
  return [app.clientUri, ...redirectUris].filter((url): url is string => !!url);
}

export async function serveHub(server: RiMcpServer, runtime: IntegrationRuntime, app: HubAppRecord, options: { ownerId: string; redirectUris: readonly string[]; signal?: AbortSignal }): Promise<void> {
  const connections = (await runtime.listConnections({ ownerId: options.ownerId })).filter((c) => c.status === 'active');
  const toolkits = new Map(runtime.getToolkits().map((toolkit) => [toolkit.id, toolkit]));
  const urls = appUrls(app, options.redirectUris);

  // Each granted tool, with the accounts it was granted on that are still connected.
  const tools = new Map<string, { actionId: string; connections: string[]; toolkitId: string }>();
  for (const account of app.grant.accounts) {
    const toolkit = toolkits.get(account.toolkitId);
    const connection = connections.find((c) => c.id === account.connectionId);
    // Never another personal app, and nothing whose account or service is gone.
    if (!toolkit || isAppToolkitId(toolkit.id) || !connection || connection.providerId !== toolkit.providerId) continue;
    for (const action of toolkit.actions) {
      const name = toToolName(action.id);
      if (action.modelVisible === false || !account.tools.includes(name)) continue;
      const entry = tools.get(name) ?? { actionId: action.id, connections: [], toolkitId: toolkit.id };
      entry.connections.push(connection.id);
      tools.set(name, entry);
    }
  }

  // One entry per lent account, with every tool it backs across its services (one Google account's mail
  // and calendar are one account to the app). It reads nothing beyond the grant, so it isn't logged.
  const accounts: HubLentAccount[] = [];
  for (const connectionId of new Set(app.grant.accounts.map((account) => account.connectionId))) {
    const backs = [...tools].filter(([, entry]) => entry.connections.includes(connectionId)).map(([name]) => name);
    const connection = connections.find((c) => c.id === connectionId);
    if (!connection || !backs.length) continue;
    accounts.push({ id: hubAccountId(app.id, connectionId), name: accountDisplay(accountChoice(connection)) ?? null, provider: connection.providerId, tools: backs });
  }
  server.registerTool(LIST_ACCOUNTS_TOOL, {
    description: 'The person\'s accounts this app may use, each with the tools it backs. Pass an account\'s name as a tool\'s account argument when the tool offers one. An account keeps its id across its tools and while it stays connected.',
    annotations: { readOnlyHint: true },
  }, async () => text({ accounts }));

  for (const [name, entry] of tools) {
    const toolkit = toolkits.get(entry.toolkitId)!;
    const action = toolkit.actions.find((candidate) => candidate.id === entry.actionId)!;
    const choices: AccountChoice[] = connections.filter((c) => entry.connections.includes(c.id)).map(accountChoice);
    const several = choices.length > 1;
    const shape = (action.input as unknown as z.ZodObject<z.ZodRawShape>).shape;
    server.registerTool(name, {
      description: action.description + (action.mutating ? ' It changes something in the person\'s account, so Ri asks the person before every call.' : ''),
      inputSchema: {
        ...shape,
        ...(several ? { account: z.string().optional().describe(`Which account. Allowed: ${choices.map((c) => `"${accountDisplay(c)}"`).join(', ')}.`) } : {}),
      },
    }, async (args, context) => {
      const startedBy = startedByFor(urls, context.meta);
      const { account, ...input } = args as { account?: string } & Record<string, unknown>;
      const signals = [options.signal, context.signal].filter((signal): signal is AbortSignal => !!signal);
      const outcome = await runtime.runAction(action.id, input, {
        ownerId: options.ownerId,
        caller: hubCaller(app, startedBy),
        ...(several ? { allowedConnectionIds: entry.connections, ...(typeof account === 'string' ? { account } : {}) } : { connectionId: entry.connections[0] }),
        ...(signals.length ? { signal: signals.length === 1 ? signals[0] : AbortSignal.any(signals) } : {}),
      });
      if (outcome.ok) {
        audit(app, name, several ? null : entry.connections[0]!, startedBy, 'ok');
        return text(outcome.result);
      }
      audit(app, name, several ? null : entry.connections[0]!, startedBy, outcome.reason, 'message' in outcome ? String(outcome.message ?? '') : undefined);
      return text(modelSafeOutcome(outcome), outcome.reason === 'error');
    });
  }

  for (const service of app.grant.services as RiServiceName[]) {
    if (!(service in riServiceInputs)) continue;
    const tool = riServiceTool(service);
    server.registerTool(tool, {
      description: RI_SERVICE_DESCRIPTIONS[service],
      inputJsonSchema: z4.toJSONSchema(riServiceInputs[service], { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>,
    }, async (args, context) => {
      const startedBy = startedByFor(urls, context.meta);
      try {
        const result = await callRiService(service, args, { appId: app.id }, AbortSignal.any([context.signal, ...(options.signal ? [options.signal] : [])]));
        audit(app, tool, null, startedBy, 'ok');
        return text(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        audit(app, tool, null, startedBy, error instanceof RiServiceError ? error.code : 'error', message);
        return text({ status: 'error', code: error instanceof RiServiceError ? error.code : 'error', message }, true);
      }
    });
  }
}
