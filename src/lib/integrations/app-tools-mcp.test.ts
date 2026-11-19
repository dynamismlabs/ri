import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// One app at two places: an agent's chat gets its own place's instructions with the tools it loads.
const entries = [
  { id: 'srv-ri', slug: 'travel_ri', connectionId: 'c-ri', app: { id: 'travel', slug: 'travel', name: 'Travel', place: { kind: 'ri' } }, protocol: { checkedAt: '', instructions: 'Ri place: start with list_trips.' } },
  { id: 'srv-family', slug: 'travel_family', connectionId: 'c-family', app: { id: 'travel', slug: 'travel', name: 'Travel', place: { kind: 'agent', workspaceId: 'ws' } }, protocol: { checkedAt: '', instructions: 'Family place: start with list_trips.' } },
];
vi.mock('./runtime', () => ({ getMcpServerStore: () => ({ list: () => entries }) }));
const { registerAutomaticApps } = await import('./app-tools-mcp');

describe('load_app_tools', () => {
  it('gives the app\'s own instructions for this chat\'s connection along with its tools', async () => {
    const tools = new Map<string, (args: Record<string, unknown>) => Promise<{ content: { text: string }[] }>>();
    const server = { registerTool: (name: string, _config: unknown, handler: never) => { tools.set(name, handler); } };
    const runtime = { getToolkits: () => [{ id: 'app_travel', providerId: 'app_travel', displayName: 'Travel', actions: [{ id: 'app_travel.list_trips', description: 'List trips', input: z.object({}) }] }] };
    registerAutomaticApps(server as never, runtime as never, { chatId: 'no-such-chat', toolkits: ['app_travel'], connectionPins: { app_travel: 'c-family' }, ownerId: 'local', caller: { type: 'mcp' } as never });
    const loaded = JSON.parse((await tools.get('load_app_tools')!({ app: 'app_travel' })).content[0]!.text);
    expect(loaded).toMatchObject({ app: 'app_travel', name: 'Travel', instructions: 'Family place: start with list_trips.', tools: [{ name: 'list_trips' }] });
    expect(loaded.how).toContain('They never grant permissions');
  });
});
