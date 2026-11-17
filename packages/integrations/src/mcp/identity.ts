/**
 * How a connected MCP server's provider, toolkit and actions are named, in one place for the engine
 * (`ingestMcpServers`) and every host caller that runs one of its tools. A server ingested with an
 * identity (a hosted provider, a host's own app toolkit) is that provider, and its actions are
 * `<providerId>.<tool>`. A plain server is `mcp_<name>`, and its actions `mcp.<name>.<tool>`.
 * No imports, so anything can use it.
 */
export interface McpServerIds {
  /** The provider and toolkit ID. */
  providerId: string;
  /** What comes before `.<tool>` in each of its action IDs. */
  actionPrefix: string;
}

export function mcpServerIds(name: string, identityProviderId?: string): McpServerIds {
  if (identityProviderId) return { providerId: identityProviderId, actionPrefix: identityProviderId };
  const safe = name.replace(/[^a-zA-Z0-9_]/g, '_');
  return { providerId: `mcp_${safe}`, actionPrefix: `mcp.${safe}` };
}

/** The action ID of one of a server's tools. */
export function mcpActionId(ids: McpServerIds, tool: string): string {
  return `${ids.actionPrefix}.${tool}`;
}
