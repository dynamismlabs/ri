/**
 * Lore (https://github.com/dynamismlabs/lore), a family-memories app each person deploys for
 * themselves: listed in Discover as a self-hosted service at the person's own address, signed in
 * with public OAuth discovery like any MCP server, and an app because it has screens.
 */
import { describe, expect, it, vi } from 'vitest';
import { getHostedMcpProvider, PROVIDER_CATALOG } from '@integrations/engine/providers';
import { INTEGRATION_ICONS } from '@/components/integrations/integration-icon-data';
import { INTEGRATION_META } from '@/components/integrations/integration-meta';
import { discoverable, itemType, matchesReview, primaryLabel, reviewItems } from '@/components/apps/layout-review/catalog';
import { filterLibrary, libraryItems } from '@/components/apps/library-model';
import { hostedMcpEndpointSetup, resolveHostedMcpUrl, trustHostedMcpAnnotations } from './hosted-endpoint';

vi.mock('@/lib/db/queries', () => ({ getWorkspace: vi.fn() }));

const lore = getHostedMcpProvider('lore')!;

describe('Lore', () => {
  it('is a self-hosted service at the person\'s own address, with public OAuth discovery', () => {
    expect(PROVIDER_CATALOG.find((provider) => provider.id === 'lore')).toMatchObject({ displayName: 'Lore', method: 'mcp' });
    expect(lore).toMatchObject({ displayName: 'Lore', endpoint: { kind: 'instance', label: 'Your Lore address', placeholder: 'https://lore.example.com', path: '/mcp' } });
    // No auth profile: Ri finds Lore's OAuth server from its own 401, registers dynamically and uses PKCE.
    expect(lore.auth).toBeUndefined();
    expect(lore.url).toBeUndefined();
    // Someone's own deployment: its tools' read-only hints aren't vouched for by a vendor.
    expect(trustHostedMcpAnnotations(lore)).toBe(false);
    expect(INTEGRATION_META.lore).toMatchObject({ category: 'Personal', docsUrl: 'https://github.com/dynamismlabs/lore', screens: true });
    expect(INTEGRATION_META.lore!.description).not.toMatch(/—|;/);
    for (const step of INTEGRATION_META.lore!.setup!) expect(step).not.toMatch(/—|;/);
    expect(INTEGRATION_ICONS.lore).toMatchObject({ title: 'Lore', hex: '111111' });
  });

  it('takes the address the person deployed it at, with or without /mcp, and only https away from this computer', () => {
    expect(resolveHostedMcpUrl(lore, { instanceUrl: 'https://lore.example.com' })).toBe('https://lore.example.com/mcp');
    expect(resolveHostedMcpUrl(lore, { instanceUrl: 'https://lore.example.com/' })).toBe('https://lore.example.com/mcp');
    expect(resolveHostedMcpUrl(lore, { instanceUrl: 'https://lore.example.com/mcp' })).toBe('https://lore.example.com/mcp');
    expect(resolveHostedMcpUrl(lore, { instanceUrl: 'https://family.example.workers.dev' })).toBe('https://family.example.workers.dev/mcp');
    expect(resolveHostedMcpUrl(lore, { instanceUrl: 'http://localhost:3000' })).toBe('http://localhost:3000/mcp');
    expect(() => resolveHostedMcpUrl(lore, { instanceUrl: 'http://lore.example.com' })).toThrow();
    expect(() => resolveHostedMcpUrl(lore, {})).toThrow(/instance URL is required/);
    expect(hostedMcpEndpointSetup(lore)).toEqual({ kind: 'instance', label: 'Your Lore address', placeholder: 'https://lore.example.com', locked: false });
    expect(hostedMcpEndpointSetup(lore, { url: 'https://lore.example.com/mcp' })).toMatchObject({ selectedUrl: 'https://lore.example.com', locked: true });
  });

  it('shows in Discover as an app, under All and Apps, and a search for Lore finds it', () => {
    const providers = [{ id: 'lore', displayName: 'Lore', method: 'mcp' as const, configured: true }, { id: 'linear', displayName: 'Linear', method: 'mcp' as const, configured: true }];
    const item = reviewItems({ providers }).find((candidate) => candidate.key === 'provider:lore')!;
    expect(item).toMatchObject({ kind: 'apps', view: true, added: false, target: { kind: 'provider', id: 'lore' } });
    expect(discoverable(item)).toBe(true);
    expect(itemType(item)).toBe('App');
    expect(primaryLabel(item)).toBe('Connect');
    for (const filter of ['All', 'Apps'] as const) expect(matchesReview(item, '', filter)).toBe(true);
    expect(matchesReview(item, 'lore')).toBe(true);
    expect(matchesReview(item, 'family memories')).toBe(true);
    // A service without screens stays a connector.
    expect(reviewItems({ providers }).find((candidate) => candidate.key === 'provider:linear')).toMatchObject({ kind: 'connectors', view: false });
    // The older Apps list's discovery still offers it.
    expect(filterLibrary(libraryItems({ providers }), 'discover', 'all', 'lore').map((row) => row.key)).toEqual(['provider:lore']);
  });
});
