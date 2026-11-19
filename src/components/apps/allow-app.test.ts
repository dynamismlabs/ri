/** What Ri says when an app's own page has to ask, and can't open on this device (docs/personal-apps.md "Allowing Ri in an app"). */
import { expect, it, vi } from 'vitest';

vi.mock('@/lib/trpc/client', () => ({ trpc: {}, trpcClient: {} }));

it('names the computer to allow it on, and says to update an app made before Ri could ask itself', async () => {
  const { elsewhereMessage } = await import('./allow-app');
  const base = { appName: 'People', placeName: 'Ri', homeComputer: 'AI Mac Mini' };
  expect(elsewhereMessage({ ...base, reason: 'no_endpoint' })).toBe('People’s permission page only opens on AI Mac Mini. Update People, or allow it there.');
  expect(elsewhereMessage({ ...base, reason: 'not_installed_by_ri' })).toBe('People’s permission page only opens on AI Mac Mini. Allow it there.');
  expect(elsewhereMessage({ ...base, placeName: 'Family', reason: 'sign_in_required' }))
    .toBe('People asks you to sign in before it allows Family, and its page only opens on AI Mac Mini. Allow it there.');
  expect(elsewhereMessage({ ...base, homeComputer: null, reason: 'unavailable' })).toBe('People’s permission page only opens on the computer Ri runs on. Allow it there.');
  for (const reason of ['no_endpoint', 'not_installed_by_ri', 'sign_in_required', 'unavailable'] as const) {
    expect(elsewhereMessage({ ...base, reason })).not.toMatch(/—|;/);
  }
});
