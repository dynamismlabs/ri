import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/mcp-apps/catalog', () => ({ connectedAppsQuery: () => ({ queryKey: ['connected'] }) }));
const { openAppRoute } = await import('./use-open-app');

describe('opening a connected app', () => {
  const app = { id: 'people', available: true, entrypoints: [{ name: 'open_people' }, { name: 'open_pipeline' }] };
  it('opens its first screen of its own', () => {
    expect(openAppRoute('people', [app])).toBe('~connected/people?open=open_people');
  });
  it('opens its page when it has no screen, can’t open now, or isn’t listed yet', () => {
    expect(openAppRoute('people', [{ ...app, entrypoints: [] }])).toBe('~connected/people');
    expect(openAppRoute('people', [{ ...app, available: false }])).toBe('~connected/people');
    expect(openAppRoute('people', undefined)).toBe('~connected/people');
  });
});
