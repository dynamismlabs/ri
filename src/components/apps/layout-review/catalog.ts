import { APP_NAME } from '@/constants/app';
import { INTEGRATION_LABELS } from '@/constants/integrations';
import { versionLabel } from '@/lib/apps/version-label';
import { libraryItems, type LibraryItem, type LibrarySources, type LibraryTarget } from '../library-model';

export type CatalogApp = NonNullable<LibrarySources['catalogApps']>[number];

export type Purpose = 'Work' | 'Life' | 'Create';
export type ReviewFilter = 'All' | 'Apps' | 'Skills' | typeof INTEGRATION_LABELS.plural;
export type ReviewItem = Omit<LibraryItem, 'target'> & {
  target: LibraryTarget | { kind: 'catalog-skill'; id: string } | { kind: 'catalog-app'; id: string };
  purpose: Purpose;
  starter?: typeof STARTER_SKILLS[number];
  /** An app from Ri's catalog: Add builds and runs it on this computer. */
  catalogApp?: CatalogApp;
  /** Where the catalog lists it. The catalog's order comes first wherever additions are listed. */
  rank?: number;
  enabled?: boolean;
};

/** Small, local starter catalog. These are editable drafts until the person installs them. */
export const STARTER_SKILLS = [
  { id: 'weekly-review', name: 'Weekly review', purpose: 'Life', description: 'Turn a busy week into a clear plan.',
    body: '# Weekly review\n\nUse when the user wants to review their week or plan the next one.\n\n1. Ask which period to review if it is unclear. Read the tasks, notes, and calendar the user has made available.\n2. Separate completed work, unfinished commitments, and decisions waiting on the user. Link back to the original records.\n3. Suggest at most three priorities for the coming week, explaining deadlines and dependencies.\n4. Ask what should change before updating dates, moving work, or creating commitments.\n5. End with a short proposed plan and unresolved questions. Do not invent activity or silently mark work complete.\n' },
  { id: 'proposal-writer', name: 'Proposal writer', purpose: 'Work', description: 'Write proposals that sound like you.',
    body: '# Proposal writer\n\nUse when the user asks to draft or refine a project proposal.\n\n1. Establish the audience, desired outcome, scope, schedule, and known constraints. Ask only for missing information that changes the proposal.\n2. Use supplied examples for voice. Separate confirmed facts from proposed terms.\n3. Draft an opening tied to the client goal, followed by deliverables, approach, milestones, assumptions, exclusions, and next steps.\n4. Leave fees, dates, and legal terms as explicit placeholders unless the user provided them. Never invent credentials or client results.\n5. Offer a concise revision pass for clarity. Keep the proposal a draft until the user asks to share it.\n' },
  { id: 'presentations', name: 'Presentations', purpose: 'Create', description: 'Make a clear story out of your ideas.',
    body: '# Presentations\n\nUse when the user wants a presentation, slide outline, or narrative for a talk.\n\n1. Identify the audience, decision or takeaway, available time, and source material.\n2. Propose a narrative with one message per slide. Use informative slide titles that state the point.\n3. Ground every number and claim in provided or verified sources. Mark missing evidence clearly.\n4. Draft slide text and speaker notes separately. Keep slide text short and suggest visuals only where they explain the message.\n5. If a slide creation tool is available, produce the deck and inspect the rendered slides. Otherwise deliver a complete editable outline and say what format was produced.\n' },
  { id: 'research-brief', name: 'Research brief', purpose: 'Create', description: 'Go from a question to a useful brief.',
    body: '# Research brief\n\nUse when the user wants to investigate a question, compare options, or summarize evidence.\n\n1. Define the decision the research should support, its scope, and the relevant date range.\n2. Search available sources. Prefer original documentation and primary evidence. Do not claim to have searched when no search tool was used.\n3. Track the origin and date of each important claim. Separate observations, estimates, and your own inferences.\n4. Compare options against the user’s criteria, including tradeoffs and missing evidence.\n5. Deliver a brief with the answer first, supporting evidence and links, uncertainty, and concrete next steps. Never fabricate sources.\n' },
] as const;

function purpose(item: Pick<LibraryItem, 'name' | 'description' | 'keywords' | 'kind'>): Purpose {
  const text = `${item.name} ${item.description} ${item.keywords}`.toLowerCase();
  if (/finance|money|travel|calendar|weekly|budget|trip/.test(text)) return 'Life';
  if (item.kind === 'skills' || /research|design|document|presentation|writing|publish/.test(text)) return 'Create';
  return 'Work';
}

export function reviewItems(sources: LibrarySources): ReviewItem[] {
  const items: ReviewItem[] = libraryItems(sources).map(item => {
    const target = item.target;
    const server = target.kind === 'mcp' ? sources.servers?.find(server => server.id === target.id) : undefined;
    return { ...item, purpose: purpose(item), enabled: server?.enabled };
  });
  for (const starter of STARTER_SKILLS) {
    const existing = items.find(item => item.kind === 'skills' && [starter.id, starter.name.toLowerCase()].includes(item.name.toLowerCase()));
    if (existing) { existing.starter = starter; existing.purpose = starter.purpose; continue; }
    items.push({ key: `starter:${starter.id}`, name: starter.name, description: starter.description, keywords: `${starter.id} workflow`,
      kind: 'skills', target: { kind: 'catalog-skill', id: starter.id }, chat: true, view: false,
      status: 'Starter skill', attention: false, added: false, purpose: starter.purpose, starter });
  }
  // Ri's own apps, in the catalog's order. One already added belongs to the library, as the app it became.
  for (const [rank, app] of (sources.catalogApps ?? []).entries()) {
    const words = { name: app.name, description: app.description, keywords: `${app.id} personal app ${APP_NAME} app ${app.reaches.join(' ')}`, kind: 'apps' as const };
    // Ri's own connection to it, once it's added and allowed: Open opens it, and its page in Apps holds the rest.
    const connected = app.personalAppId ? sources.connectedApps?.find(candidate => candidate.app?.id === app.personalAppId && candidate.app.place.kind === 'ri') : undefined;
    items.push({ ...words, key: `catalog:${app.id}`, target: { kind: 'catalog-app', id: app.id }, chat: true, view: true, connectedAppId: connected?.id,
      status: !app.sourceId ? `${APP_NAME} app` : app.installedVersion ? `Added, ${versionLabel(app.installedVersion)}` : 'Not installed yet',
      // Added, but its install never finished: its page says why and offers it again.
      attention: !!app.sourceId && !app.installedVersion, added: !!app.sourceId, purpose: purpose(words), catalogApp: app, rank });
  }
  return items.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
}

/** Additions the person has, which the library lists. A catalog app they added is listed as the app it became. */
export function inLibrary(item: ReviewItem) {
  return item.added && !item.draft && item.target.kind !== 'catalog-app';
}

export function itemType(item: Pick<ReviewItem, 'kind'>) {
  return item.kind === 'skills' ? 'Skill' : item.kind === 'apps' ? 'App' : INTEGRATION_LABELS.singular;
}
export function primaryLabel(item: ReviewItem) {
  if (item.target.kind === 'catalog-app') return !item.added ? 'Add' : item.connectedAppId && !item.attention ? 'Open' : 'Manage';
  if (item.draft) return 'Continue setup';
  if (!item.added) return item.kind === 'skills' ? 'Preview skill' : 'Connect';
  if (item.enabled === false || item.attention || item.usable === false) return 'Manage';
  if (item.kind === 'skills') return 'Edit skill';
  if (item.kind === 'connectors') return 'Manage connection';
  return item.view ? 'Open' : 'Try in chat';
}
const STOP_WORDS = new Set(['help', 'me', 'i', 'want', 'to', 'my', 'the', 'a', 'an', 'with', 'and', 'do', 'manage']);
export function matchesReview(item: Pick<ReviewItem, 'name' | 'description' | 'keywords' | 'kind'>, search: string, filter: ReviewFilter = 'All') {
  const words = search.toLowerCase().split(/\s+/).filter(word => word && !STOP_WORDS.has(word));
  const text = `${item.name} ${item.description} ${item.keywords} ${itemType(item)}`.toLowerCase();
  return words.every(word => text.includes(word)) && (filter === 'All' ||
    (filter === 'Apps' && item.kind === 'apps') || (filter === 'Skills' && item.kind === 'skills') ||
    (filter === INTEGRATION_LABELS.plural && item.kind === 'connectors'));
}
export function discoverable(item: ReviewItem) {
  // Private servers and authored skills belong to the library, never the public catalog.
  return item.target.kind === 'provider' || item.target.kind === 'catalog-app' || !!item.starter;
}
/**
 * Services most people already use, in the order Discover offers them first. Discover opens with the
 * ones not connected yet, so someone new starts from names they know (Gmail, Outlook, Slack) before
 * Ri's own apps and the long tail.
 */
export const POPULAR_PROVIDERS = ['google', 'microsoft', 'slack', 'notion', 'github', 'zoom', 'dropbox', 'todoist'] as const;
/** One row of cards on a wide screen. */
export const POPULAR_LIMIT = 4;
export function popularItems(items: ReviewItem[]) {
  return POPULAR_PROVIDERS.flatMap(id => items.filter(item => item.target.kind === 'provider' && item.target.id === id && (!item.added || !!item.draft)))
    .slice(0, POPULAR_LIMIT);
}
export const COLLECTIONS = [
  { id: 'business', name: 'Run a small business', description: 'People, conversations, and your next proposal.', purpose: 'Work' },
  { id: 'life', name: 'Get life organized', description: 'Money, plans, and a weekly reset.', purpose: 'Life' },
  { id: 'ideas', name: 'Bring ideas to life', description: 'Research, a clear story, and the work to make it real.', purpose: 'Create' },
] as const;
export function collectionItems(items: ReviewItem[], collectionId: string) {
  const group = COLLECTIONS.find(group => group.id === collectionId) ?? COLLECTIONS[0];
  const priorities = group.id === 'business' ? [/people|crm/i, /google|gmail/i, /proposal/i]
    : group.id === 'life' ? [/financ|budget/i, /calendar|google/i, /weekly.review/i, /travel/i]
    : [/research/i, /presentation/i, /linear|project/i];
  const candidates = items.filter(discoverable).sort((a, b) => Number(a.kind === 'connectors') - Number(b.kind === 'connectors'));
  const curated = priorities.flatMap(pattern => {
    const item = candidates.find(item => pattern.test(`${item.name} ${item.keywords}`));
    return item ? [item] : [];
  });
  return [...new Map((curated.length ? curated : candidates.filter(item => item.purpose === group.purpose).slice(0, 4)).map(item => [item.key, item])).values()];
}
