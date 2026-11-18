import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const action = (id: string) => ({ id, description: id, input: z.object({}) });
const toolkits = [
  { id: 'gmail', providerId: 'google', displayName: 'Gmail', actions: [action('gmail.search_messages')] },
  { id: 'google_calendar', providerId: 'google', displayName: 'Google Calendar', actions: [action('google_calendar.list_events')] },
];
const connections = [{ id: 'c-home', providerId: 'google', accountId: 'home', email: 'me@example.com', status: 'active' }];
vi.mock('../runtime', () => ({
  getIntegrationRuntime: async () => ({ getToolkits: () => toolkits, listConnections: async () => connections }),
  getIntegrationOwnerId: () => 'local',
  getMcpServerStore: () => ({ list: () => [] }),
}));
const q = await import('@/lib/db/queries');
const { getHubAppView, narrowHubApp } = await import('./manage');

describe('the hub panel with one Google account behind Gmail and Calendar', () => {
  it('labels each row by its own service, and takes back one service without the other', async () => {
    const app = q.upsertHubApp({ clientId: 'client-people', name: 'People', clientUri: 'http://127.0.0.1:4311',
      grant: { accounts: [
        { connectionId: 'c-home', toolkitId: 'gmail', tools: ['gmail__search_messages'] },
        { connectionId: 'c-home', toolkitId: 'google_calendar', tools: ['google_calendar__list_events'] },
      ], services: [] } });
    const view = await getHubAppView(app.id);
    expect(view?.accounts.map(a => [a.toolkitId, a.service, a.account, a.connected])).toEqual([
      ['gmail', 'Gmail', 'me@example.com', true],
      ['google_calendar', 'Google Calendar', 'me@example.com', true],
    ]);
    // Remove on the Gmail row leaves Calendar, on the same connection.
    expect(narrowHubApp(app.id, { connectionId: 'c-home', toolkitId: 'gmail' })?.accounts).toEqual([
      { connectionId: 'c-home', toolkitId: 'google_calendar', tools: ['google_calendar__list_events'] },
    ]);
  });
});
