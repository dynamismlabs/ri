import { describe, expect, it } from 'vitest';
import { mcpActionId, mcpServerIds } from '../mcp/identity';

describe('how a connected MCP server is named', () => {
  it('is the provider it is ingested as, actions and all', () => {
    expect(mcpServerIds('bookmarks_at_ri', 'app_bookmarks')).toEqual({ providerId: 'app_bookmarks', actionPrefix: 'app_bookmarks' });
    expect(mcpActionId(mcpServerIds('bookmarks_at_ri', 'app_bookmarks'), 'open_bookmarks')).toBe('app_bookmarks.open_bookmarks');
    expect(mcpActionId(mcpServerIds('linear', 'linear'), 'list_issues')).toBe('linear.list_issues');
  });

  it('is mcp_<name> with actions under mcp.<name> for a server added by address', () => {
    expect(mcpServerIds('todoist')).toEqual({ providerId: 'mcp_todoist', actionPrefix: 'mcp.todoist' });
    expect(mcpActionId(mcpServerIds('my-tools.v2'), 'find-tasks')).toBe('mcp.my_tools_v2.find-tasks');
  });
});
