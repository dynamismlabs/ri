'use client';
import { InlineAction } from '@/components/system/inline-action';
import { MenuAction } from '@/components/system/menu-action';

import { useViewportTier } from '@/hooks/use-viewport-tier';

import { SegmentedControl } from '@/components/system/segmented-control';

import { IconButton } from '@/components/system/icon-button';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BookOpen, LayoutGrid, MoreHorizontal, Plug, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/system/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/system/menu';
import { Tip } from '@/components/ui/tip';
import { INTEGRATION_LABELS } from '@/constants/integrations';
import { AppLibrary } from '../../app-library';
import { AddAppDialog } from '../../add-app-dialog';
import { HubAccessList } from '../../hub-access';
import { NewAppDialog } from '../../new-app-dialog';
import { AppBuildsList } from '../../app-builds-list';
import { installedApps, YourAppsList } from '../../app-status';
import { useOpenApp } from '../../use-open-app';
import { trpc } from '@/lib/trpc/client';
import { isSetupOpen, NO_SETUP, type LibraryFilter } from '../../library-model';
import { useReview } from '../context';
import { ItemDetails } from '../details';
import { ItemMark, ItemStatus, ManageButton, PrimaryButton } from '../items';
import { collectionItems, matchesReview, POPULAR_LIMIT, popularItems, type ReviewFilter, type ReviewItem } from '../catalog';
import { SkillTry } from '../live-surfaces';
import { CatalogSkeleton, LibraryRowsSkeleton } from '../loading';
import { Cards, CollectionTiles, Empty, SearchBox, SectionTitle } from '../shared';
import s from '../review.module.css';

const GROUPS = [
  { kind: 'apps', label: 'Apps', description: 'Interfaces you work in.', Icon: LayoutGrid },
  { kind: 'connectors', label: INTEGRATION_LABELS.plural, description: 'Accounts and services Ri can access.', Icon: Plug },
  { kind: 'skills', label: 'Skills', description: 'Instructions and workflows you maintain.', Icon: BookOpen },
] as const;
const LIBRARY_FILTERS = [{ value: 'all', label: 'All' }, ...GROUPS.map(group => ({ value: group.kind, label: group.label }))];

export function SplitLibrary() {
  const tier = useViewportTier();
  const review = useReview();
  const library = useRef<HTMLElement>(null);
  const pane = useRef<HTMLElement>(null);
  const libraryFilter = GROUPS.find(group => group.kind === review.query.libraryType)?.kind ?? 'all';
  useEffect(() => {
    if (review.query.browse === 'yours') library.current?.focus({ preventScroll: false });
  }, [review.query.browse]);
  const setup = !!review.query.provider || !!review.query.application || !!review.query.mcp;
  useEffect(() => {
    if (!(setup || review.trySkill)) return;
    const root = pane.current?.closest('[data-apps-library]');
    if (root && root.clientWidth <= 760) pane.current?.scrollIntoView({ block: 'start' });
  }, [review.query.provider, review.query.application, review.query.mcp, setup, review.trySkill]);
  return (
    <>
      <LibraryHeader />
      <div className={s.libraryColumns}>
        <section ref={library} tabIndex={-1} className={s.libraryPane} aria-label="Your library">
          <div className={`${s.libraryTabs} flex flex-col`}>
            <div className={s.libraryToolbar}>
              <SectionTitle
                count={Object.values(review.libraryLoading).some(Boolean) ? undefined : review.library.length}
              >
                Your library
              </SectionTitle>
              <SegmentedControl
                mode="choice"
                stretch
                distribution="natural"
                ariaLabel="Filter your library"
                size={tier === 'phone' ? 'touch' : 'compact'}
                value={libraryFilter}
                onChange={(value) => {
                  review.patch({ libraryType: value === 'all' ? undefined : value });
                  library.current?.scrollTo({ top: 0 });
                }}
                options={LIBRARY_FILTERS}
              />
            </div>
            <div className={`${s.libraryContents} flex-1 text-sm outline-none`}>
              <GroupedLibrary filter={libraryFilter} />
            </div>
          </div>
        </section>
        <section
          ref={pane}
          className={setup || review.trySkill ? s.workspacePane : s.discoveryPane}
          aria-label={setup ? 'Connection settings' : 'Discover and details'}
        >
          {setup ? (
            <AppLibrary query={review.query} navigate={review.navigate} />
          ) : review.trySkill ? (
            <SkillTry item={review.trySkill} />
          ) : review.selected ? (
            <ItemDetails item={review.selected} />
          ) : review.collection ? (
            <GoalBundle />
          ) : (
            <Discover />
          )}
        </section>
      </div>
    </>
  );
}

function LibraryHeader() {
  const review = useReview();
  const skillInput = useRef<HTMLInputElement>(null);
  const [addingApp, setAddingApp] = useState(false);
  const [newApp, setNewApp] = useState(false);
  const newServer = () => {
    review.setTrySkill(null);
    review.patch({ ...NO_SETUP, mcp: 'new', item: undefined, panel: undefined });
  };
  return <header className={s.libraryHeader}>
    <div className={s.libraryHeading}><span className={s.mark}><LayoutGrid size={18} /></span><div><h1>Apps</h1><p>Apps, {INTEGRATION_LABELS.plural.toLowerCase()}, and skills for your work.</p></div></div>
    <div className={s.creationActions} aria-label="Create and connect">
      <Button
        onClick={() => setNewApp(true)}
        variant="secondary"
        size="sm"
      ><Plus size={13} />New app</Button>
      <Button
        onClick={() => setAddingApp(true)}
        variant="secondary"
        size="sm"
      ><Plus size={13} />Add app</Button>
      <Button
        disabled={review.busy}
        onClick={review.buildSkill}
        variant="secondary"
        size="sm"
      ><Plus size={13} />New skill</Button>
      <Button
        onClick={newServer}
        variant="secondary"
        size="sm"
      ><Plus size={13} />Add MCP server</Button>
      <DropdownMenu><DropdownMenuTrigger asChild><IconButton
        label="Import options"
        tooltip="Import a skill"
        variant="ghost"
        size="sm"
        className={s.importButton}
      ><MoreHorizontal size={16} /></IconButton></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <MenuAction kind="menu" disabled={review.busy} onSelect={() => skillInput.current?.click()}><Upload size={14} />Import SKILL.md</MenuAction>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div className={s.librarySearch}><SearchBox placeholder="Search your library or find something new" /></div>
    <input type="file" ref={skillInput} className="sr-only" accept=".md" aria-label="Import SKILL.md" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) review.importSkill(file); }} />
    <AddAppDialog open={addingApp} onOpenChange={setAddingApp} />
    <NewAppDialog open={newApp} onOpenChange={setNewApp} onCreated={(id) => review.navigate(`build/${id}`)} />
  </header>;
}

function GroupedLibrary({ filter }: { filter: LibraryFilter }) {
  const review = useReview();
  const openApp = useOpenApp(review.navigate);
  // The apps Ri installed lead Your apps as cards that open them. Each is listed once, there.
  const sources = useQuery(trpc.appBuilds.list.queryOptions(undefined, { staleTime: 10_000 }));
  const installed = installedApps(sources.data ?? []).filter(source => matchesReview({ name: source.name, description: '', keywords: 'personal app', kind: 'apps' }, review.search));
  const installedIds = new Set(installed.flatMap(source => source.personalAppId ? [`app:${source.personalAppId}`] : []));
  // Catalog type filters never hide the other things a person already owns.
  const matching = review.library.filter(item => matchesReview(item, review.search) && !installedIds.has(item.key));
  const drafts = review.drafts.filter(item => matchesReview(item, review.search) && (filter === 'all' || item.kind === filter));
  return <>
    {GROUPS.filter(group => filter === 'all' || group.kind === filter).map(({ kind, label, description, Icon }) => {
      const items = matching.filter(item => item.kind === kind);
      const cards = kind === 'apps' ? installed.length : 0;
      const loading = review.libraryLoading[kind];
      return <section className={s.libraryGroup} key={kind} aria-label={`Your ${label.toLowerCase()}`}>
        <div className={s.groupHeading}><Icon size={13} /><h3>{label}</h3>{!loading && <span>{items.length + cards}</span>}</div>
        <p className={s.groupDescription}>{description}</p>
        {kind === 'apps' && <YourAppsList only={installed.map(source => source.id)} onOpen={openApp} onDetails={(id) => review.navigate(`build/${id}`)} />}
        {loading ? <LibraryRowsSkeleton label={label} /> : items.length ? items.map(item => <LibraryEntry key={item.key} item={item} />)
          : !cards && <p className={s.groupEmpty}>{review.search ? 'No matches.' : kind === 'apps' ? 'No apps yet. Find one in Discover, or make one with New app.' : `No ${label.toLowerCase()} yet.`}</p>}
      </section>;
    })}
    {(filter === 'all' || filter === 'apps') && <div className={s.libraryGroup}><AppBuildsList onOpen={(id) => review.navigate(`build/${id}`)} /></div>}
    {(filter === 'all' || filter === 'apps') && <div className={s.libraryGroup}><HubAccessList /></div>}
    {!!drafts.length && <section className={s.libraryGroup} aria-label="In progress"><div className={s.groupHeading}><h3>In progress</h3><span>{drafts.length}</span></div>
      {drafts.map(item => <LibraryEntry key={item.key} item={item} />)}
    </section>}
  </>;
}

function LibraryEntry({ item }: { item: ReviewItem }) {
  const review = useReview();
  const action = item.draft ? 'Continue setup' : item.kind === 'skills' ? 'Edit skill' : item.view ? 'Open' : 'Manage connection';
  const open = () => item.draft || item.kind === 'skills' || !item.view ? review.manage(item) : review.primary(item);
  const selected = review.selected?.key === item.key || isSetupOpen(review.query, item.target);
  return <div className={s.libraryEntry} data-item={item.key} data-selected={selected || undefined}>
    <Tip label={item.name} onlyWhenTextHidden><InlineAction   type="button" className={s.ownedButton} onClick={open} aria-label={`${action} ${item.name}`} aria-current={selected ? 'true' : undefined}>
      <ItemMark item={item} small /><span><strong>{item.name}</strong><small className={item.attention ? s.attention : undefined}>{item.enabled === false ? 'Off' : item.attention ? 'Needs attention' : item.target.kind === 'mcp' ? 'Custom MCP' : item.status}</small></span>
    </InlineAction></Tip>
    <ManageButton item={item} />
  </div>;
}

function Discover() {
  const tier = useViewportTier();
  const review = useReview();
  const types: ReviewFilter[] = ['All', 'Apps', INTEGRATION_LABELS.plural, 'Skills'];
  const showGoals = !review.search && review.filter === 'All';
  // Familiar services lead, so the catalog below doesn't open with names only Ri uses. Each is listed once.
  const popular = showGoals ? popularItems(review.discovery) : [];
  const shown = new Set(popular.map(item => item.key));
  const sorted = review.discovery.filter(item => !shown.has(item.key)).sort((a, b) => Number(a.kind === 'connectors') - Number(b.kind === 'connectors'));
  return (
    <>
      <div className={s.discoverHeading}>
        <h2>Discover</h2>
        <p>Find your next useful addition.</p>
      </div>
      <div className={s.typeTabs} aria-label="Discover types">
        <SegmentedControl
          mode="choice"
          ariaLabel="Discover types"
          size={tier === 'phone' ? 'touch' : 'compact'}
          value={review.filter}
          onChange={(type) => review.patch({ filter: type === 'All' ? undefined : type, browse: undefined })}
          options={types.map((type) => ({ value: type, label: type }))}
        />
      </div>
      {showGoals && (review.loading || !!popular.length) && (
        <section className={s.goalSection} aria-label="Popular">
          <SectionTitle>Popular</SectionTitle>
          {review.loading ? <CatalogSkeleton count={POPULAR_LIMIT} label="Loading popular services" /> : <Cards items={popular} />}
        </section>
      )}
      {showGoals && (
        <section className={s.goalSection} aria-label="Goal bundles">
          <SectionTitle>Start with a goal</SectionTitle>
          <CollectionTiles />
        </section>
      )}
      <SectionTitle count={review.loading ? undefined : sorted.length}>
        {review.search ? 'Search results' : showGoals ? 'Explore the catalog' : review.filter}
      </SectionTitle>
      {review.loading ? (
        <CatalogSkeleton />
      ) : !sorted.length && !review.search ? (
        <Empty>
          You have everything in this part of the catalog. Try another type or create something of your own.
        </Empty>
      ) : (
        <Cards items={sorted} />
      )}
    </>
  );
}

function GoalBundle() {
  const review = useReview();
  if (review.loading) return <CatalogSkeleton />;
  const collection = review.collection!;
  const items = collectionItems(review.items, collection.id);
  const added = items.filter(item => item.added && !item.draft).length;
  const back = () => review.patch({ collection: undefined, item: undefined, panel: undefined });
  return <div className={s.goalContents}>
    <Button
      onClick={back}
      variant="ghost"
      size="xs"
    ><ArrowLeft size={13} />Back to Discover</Button>
    <div className={s.goalHeading}><h2>{collection.name}</h2><p>{collection.description}</p><span>{added} of {items.length} in your library</span></div>
    <p className={`${s.muted} mb-4`}>Choose the pieces that help. Each has its own setup and access.</p>
    {items.map(item => <div className={s.bundleItem} key={item.key}>
      <InlineAction   className={s.flatMain} type="button" onClick={() => review.details(item)} aria-label={`Details for ${item.name}`}><ItemMark item={item} /><span><h3>{item.name}</h3><p>{item.description}</p><small>{item.kind === 'skills' ? 'Skill' : item.kind === 'apps' ? 'App' : INTEGRATION_LABELS.singular}</small></span></InlineAction>
      <div className={s.bundleItemActions}>{item.added && !item.draft ? <ItemStatus item={item} /> : <span className={s.muted}>Not added</span>}<PrimaryButton item={item} /></div>
    </div>)}
    {!items.length && <Empty>No additions in this bundle are available yet.</Empty>}
    {added === items.length && !!items.length && <p className={`${s.muted} mt-5`}>Everything in this bundle is already in your library.</p>}
    <Button
      onClick={back}
      variant="ghost"
      size="xs"
      className="mt-5"
    >Browse all additions<ArrowRight size={12} /></Button>
  </div>;
}
