import { describe, expect, it } from 'vitest';
import type { LibrarySources } from '../library-model';
import { collectionItems, discoverable, inLibrary, itemType, matchesReview, popularItems, POPULAR_PROVIDERS, primaryLabel, reviewItems, type CatalogApp } from './catalog';

const sources: LibrarySources = {
  providers: [{ id: 'google', displayName: 'Google', method: 'oauth2', configured: true }, { id: 'linear', displayName: 'Linear', method: 'api_key', configured: true }],
  connections: [{ id: 'work', providerId: 'google', accountId: 'work', email: 'work@example.test', status: 'active', scopes: [], ownerId: 'local', createdAt: '2026-10-01', updatedAt: '2026-10-01' }],
  servers: [{ id: 'company', slug: 'company-data', displayName: 'Company data', url: 'https://example.test/mcp', enabled: false, auth: { kind: 'none' }, lastStatus: 'ok', createdAt: '2026-10-01', updatedAt: '2026-10-01' }],
  skills: [
    { ref: 'ri:private-workflow', name: 'Private workflow', description: 'Our internal process', location: { kind: 'ri' }, hasErrors: false },
    { ref: 'draft:work-in-progress', name: 'Work in progress', description: 'Not installed yet', location: { kind: 'draft' }, hasErrors: false },
  ] as LibrarySources['skills'],
};

describe('one library across Apps', () => {
  it('includes custom MCPs and installed skills without publishing private additions in discovery', () => {
    const items = reviewItems(sources);
    expect(items.filter(item => item.added && !item.draft).map(item => item.key).sort()).toEqual(['mcp:company', 'provider:google', 'skill:ri:private-workflow']);
    expect(items.filter(discoverable).some(item => item.target.kind === 'mcp' || item.key === 'skill:ri:private-workflow')).toBe(false);
    expect(items.find(item => item.key === 'skill:draft:work-in-progress')).toMatchObject({ draft: true });
    expect(items.filter(discoverable).some(item => item.kind === 'skills')).toBe(true);
    expect(itemType(items.find(item => item.key === 'mcp:company')!)).toBe('Connector');
    expect(itemType(items.find(item => item.key === 'skill:ri:private-workflow')!)).toBe('Skill');
    expect(primaryLabel(items.find(item => item.key === 'skill:ri:private-workflow')!)).toBe('Edit skill');
    expect(primaryLabel(items.find(item => item.key === 'provider:google')!)).toBe('Manage connection');
  });
  it('never pretends that a paused server is ready to use', () => {
    const item = reviewItems(sources).find(item => item.key === 'mcp:company')!;
    expect(item.enabled).toBe(false);
    expect(primaryLabel(item)).toBe('Manage');
  });
  it('offers starter skills as previews and unconnected services to connect', () => {
    const items = reviewItems(sources);
    const starter = items.find(item => item.name === 'Research brief')!;
    expect(starter).toMatchObject({ added: false, target: { kind: 'catalog-skill', id: 'research-brief' } });
    expect(primaryLabel(starter)).toBe('Preview skill');
    expect(primaryLabel(items.find(item => item.key === 'provider:linear')!)).toBe('Connect');
  });
  it('offers familiar services first, in their order, leaving out what is connected and what Ri lacks', () => {
    const provider = (id: string) => ({ id, displayName: id[0].toUpperCase() + id.slice(1), method: 'oauth2' as const, configured: true });
    const some = reviewItems({ ...sources, providers: [...sources.providers!, provider('slack'), provider('microsoft')] });
    // Google is connected and Linear isn't one of them.
    expect(popularItems(some).map(item => item.key)).toEqual(['provider:microsoft', 'provider:slack']);
    const every = reviewItems({ ...sources, connections: [], providers: POPULAR_PROVIDERS.map(provider) });
    expect(popularItems(every).map(item => item.key)).toEqual(['provider:google', 'provider:microsoft', 'provider:slack', 'provider:notion']);
  });
  it('finds additions by name, purpose and type', () => {
    const items = reviewItems(sources);
    const brief = items.find(item => item.name === 'Research brief')!;
    expect(matchesReview(brief, 'help me with a research question')).toBe(true);
    expect(matchesReview(brief, '', 'Skills')).toBe(true);
    expect(matchesReview(brief, '', 'Apps')).toBe(false);
    expect(matchesReview(items.find(item => item.key === 'mcp:company')!, 'company', 'Connectors')).toBe(true);
  });
  it('promotes a connection with an interface to an app', () => {
    const items = reviewItems({ ...sources, connectedApps: [{ id: 'company', name: 'Company data', toolkitName: 'Company data', available: true, account: 'Company data', sourceRef: null, icons: [], standalone: true, entrypoints: [{ name: 'home', title: 'Company data', icons: [] }], threads: [], files: [], settings: false, mentions: false, views: [], recent: [] }] });
    const app = items.find(item => item.key === 'mcp:company')!;
    expect(app).toMatchObject({ kind: 'apps', view: true, connectedAppId: 'company' });
    expect(itemType(app)).toBe('App');
    expect(matchesReview(app, '', 'Apps')).toBe(true);
  });
  it('curates small goal collections instead of copying the entire provider catalog', () => {
    const items = reviewItems({ ...sources, providers: [...sources.providers!, { id: 'hubspot', displayName: 'HubSpot', method: 'oauth2', configured: true }] });
    const business = collectionItems(items, 'business');
    expect(business.map(item => item.name)).toContain('Google');
    expect(business.map(item => item.name)).toContain('Proposal writer');
    // A CRM fits the people a small business keeps. A project tracker does not.
    expect(business.map(item => item.name)).toContain('HubSpot');
    expect(business.map(item => item.name)).not.toContain('Linear');
    expect(new Set(business.map(item => item.kind))).toEqual(new Set(['connectors', 'skills']));
    expect(business.length).toBeLessThanOrEqual(4);
    expect(business.some(item => item.target.kind === 'mcp')).toBe(false);
  });
});

describe('Ri\'s own apps in Discover', () => {
  const catalogApp = (over: Partial<CatalogApp>): CatalogApp => ({
    id: 'people', name: 'People', description: 'The people you know, and what you last talked about.', reaches: ['your Gmail through Ri (read only)'],
    git: 'https://github.com/dynamismlabs/app-people.git', version: 'v0.1.4', checksum: `sha256-${'a'.repeat(64)}`,
    sourceId: null, personalAppId: null, installedVersion: null, updateAvailable: false, ...over,
  });
  const catalogApps = [catalogApp({}), catalogApp({ id: 'bookmarks', name: 'Bookmarks', reaches: [], sourceId: 's1', personalAppId: 'a1', installedVersion: 'v0.1.5' })];

  it('lists them first, in the catalog\'s order, under Apps and All, with Add', () => {
    const items = reviewItems({ ...sources, catalogApps });
    expect(items.filter(discoverable).slice(0, 2).map(item => item.key)).toEqual(['catalog:people', 'catalog:bookmarks']);
    const people = items.find(item => item.key === 'catalog:people')!;
    expect(people).toMatchObject({ kind: 'apps', added: false, view: true, target: { kind: 'catalog-app', id: 'people' } });
    expect(itemType(people)).toBe('App');
    expect(primaryLabel(people)).toBe('Add');
    expect(matchesReview(people, '', 'Apps')).toBe(true);
    expect(matchesReview(people, '', 'All')).toBe(true);
    expect(matchesReview(people, 'gmail')).toBe(true);
    expect(matchesReview(people, '', 'Skills')).toBe(false);
  });

  it('keeps the library to what the person has: an added catalog app is listed there as the app it became', () => {
    const items = reviewItems({ ...sources, catalogApps });
    const bookmarks = items.find(item => item.key === 'catalog:bookmarks')!;
    expect(bookmarks).toMatchObject({ added: true, status: 'Added, v0.1.5' });
    expect(primaryLabel(bookmarks)).toBe('Manage');
    expect(items.filter(inLibrary).some(item => item.target.kind === 'catalog-app')).toBe(false);
  });

  it('puts People in the bundle for running a small business', () => {
    expect(collectionItems(reviewItems({ ...sources, catalogApps }), 'business').map(item => item.key)).toContain('catalog:people');
  });
});
