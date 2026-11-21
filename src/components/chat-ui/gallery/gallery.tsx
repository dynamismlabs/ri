'use client';
import { StatusBadge } from '@/components/system/status-badge';

import { MenuAction } from '@/components/system/menu-action';

import { useViewportTier } from '@/hooks/use-viewport-tier';

import { Field } from '@/components/system/field';
import { NativeSelect } from '@/components/system/native-select';

import { SegmentedControl } from '@/components/system/segmented-control';

import { IconButton } from '@/components/system/icon-button';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Copy, LayoutTemplate, Monitor, RotateCcw, Search, Smartphone } from 'lucide-react';
import { Button } from '@/components/system/button';

import { cn } from '@/lib/utils';
import { CHAT_UI_EXAMPLES, filterGalleryExamples, galleryExample, galleryPreviewUrl, GALLERY_ORIGINS, type ChatUiExample } from './catalog';

export function ChatUiGallery() {
  const compactFieldSize = useViewportTier() === 'phone' ? 'touch' : 'sm';

  const [selected, setSelected] = useState('email');
  const [state, setState] = useState('draft');
  const [search, setSearch] = useState('');
  const [origin, setOrigin] = useState('all');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [phone, setPhone] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const example = galleryExample(selected);
  const matches = filterGalleryExamples(search, origin);

  useEffect(() => {
    const read = () => {
      const [id, query] = window.location.hash.slice(1).split('?');
      const item = galleryExample(id);
      const requested = new URLSearchParams(query).get('state');
      setSearch('');
      setOrigin('all');
      setSelected(item.id);
      setState(item.states.some(state => state.id === requested) ? requested! : item.states[0].id);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const choose = (item: ChatUiExample, nextState = item.states[0].id) => {
    if (item.id === selected && nextState === state) return;
    setSelected(item.id);
    setState(nextState);
    setLoaded(false);
    window.history.pushState(null, '', `#${item.id}${nextState !== item.states[0].id ? `?state=${encodeURIComponent(nextState)}` : ''}`);
  };
  const filter = (nextSearch: string, nextOrigin: string) => {
    setSearch(nextSearch); setOrigin(nextOrigin);
    const next = filterGalleryExamples(nextSearch, nextOrigin);
    if (next.length && !next.some(item => item.id === selected)) choose(next[0]);
  };
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(value); }
    catch { setCopied(null); }
  };
  const previewKey = `${selected}:${state}:${theme}:${generation}`;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} />
            Back to Ri
          </Link>
          <span className="text-[11px] text-muted-foreground">A living reference</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-7 max-w-3xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <LayoutTemplate size={16} />
            Chat interfaces
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Chat UI gallery</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Explore the interfaces that turn a conversation into something you can act on. See what Ri
            includes and what connected apps supply.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            These examples use fictional data and simulated actions. You can try every example without
            installing an app or changing your accounts.
          </p>
        </div>

        <SegmentedControl
          mode="choice"
          className="mb-6"
          ariaLabel="Filter by source"
          value={origin}
          onChange={(value) => filter(search, value)}
          options={[
            { value: 'all', label: 'All sources', count: CHAT_UI_EXAMPLES.length },
            ...Object.entries(GALLERY_ORIGINS).map(([value, source]) => ({
              value,
              label: source.label,
              count: CHAT_UI_EXAMPLES.filter((example) => example.origin === value).length,
            })),
          ]}
        />

        <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="min-w-0 lg:sticky lg:top-6" aria-label="Gallery examples">
            <Field
              aria-label="Search chat interfaces"
              placeholder="Find an interface"
              value={search}
              onChange={(event) => filter(event.target.value, origin)}
              leading={<Search />}
              className="relative"
              size={compactFieldSize}
            />
            <p className="mt-2 text-[11px] text-muted-foreground" aria-live="polite">
              {matches.length} {matches.length === 1 ? 'example' : 'examples'}
            </p>
            {matches.length > 0 && (
              <NativeSelect
                value={selected}
                onChange={(event) => choose(galleryExample(event.target.value))}
                controlClassName="w-full"
                aria-label="Select an example"
                className="mt-3 block"
                size={compactFieldSize}
              >
                {matches.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </NativeSelect>
            )}
            <nav className="mt-4 hidden space-y-1 lg:block" aria-label="Chat UI examples">
              {matches.map((item) => (
                <MenuAction density="comfortable"

                  type="button"
                  key={item.id}
                  aria-current={selected === item.id ? 'page' : undefined}
                  onClick={() => choose(item)}
                  className="w-full text-left"
                >
                  <span className="block text-[13px] font-medium">{item.name}</span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {GALLERY_ORIGINS[item.origin].label}
                  </span>
                </MenuAction>
              ))}
            </nav>
          </aside>

          {matches.length === 0 ? (
            <section className="rounded-xl border border-dashed border-border p-8">
              <h2 className="text-sm font-medium">No matching interfaces</h2>
              <p className="mt-2 text-xs text-muted-foreground">Try another search or source.</p>
              <Button onClick={() => filter('', 'all')} variant="secondary" size="xs" className="mt-4">
                Clear filters
              </Button>
            </section>
          ) : (
            <article className="min-w-0 space-y-5" aria-labelledby="example-name">
              <div>
                <StatusBadge className="inline-flex">
                  {GALLERY_ORIGINS[example.origin].label}
                </StatusBadge>
                <h2 id="example-name" className="mt-2 text-xl font-semibold">
                  {example.name}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{example.description}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{example.availability}</p>
              </div>

              <section
                className="overflow-hidden rounded-xl border border-border"
                aria-label="Interactive preview"
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/25 px-3 py-2.5">
                  <NativeSelect
                    aria-label="Example state"
                    value={state}
                    onChange={(event) => choose(example, event.target.value)}
                    controlClassName={cn('max-w-48', 'w-auto')}
                    label={<>State</>}
                    orientation="horizontal"
                    className="w-auto"
                    size={compactFieldSize}
                  >
                    {example.states.map((state) => (
                      <option key={state.id} value={state.id}>
                        {state.label}
                      </option>
                    ))}
                  </NativeSelect>
                  <div className="flex items-center gap-1 sm:ml-auto" aria-label="Preview size">
                    <IconButton
                      aria-pressed={!phone}
                      onClick={() => setPhone(false)}
                      label="Desktop preview"
                      tooltip="Preview at full width"
                      variant="ghost"
                      size="xs"
                    >
                      <Monitor size={14} />
                    </IconButton>
                    <IconButton
                      aria-pressed={phone}
                      onClick={() => setPhone(true)}
                      label="Phone preview"
                      tooltip="Preview at phone width"
                      variant="ghost"
                      size="xs"
                    >
                      <Smartphone size={14} />
                    </IconButton>
                  </div>
                  <SegmentedControl
                    mode="choice"
                    ariaLabel="Preview theme"
                    value={theme}
                    onChange={(value) => {
                      if (theme !== value) {
                        setTheme(value);
                        setLoaded(false);
                      }
                    }}
                    options={[
                      { value: 'light', label: 'Light' },
                      { value: 'dark', label: 'Dark' },
                    ]}
                  />
                  <IconButton
                    onClick={() => {
                      setGeneration((value) => value + 1);
                      setLoaded(false);
                    }}
                    label="Reset example"
                    tooltip="Start this example again"
                    variant="ghost"
                    size="xs"
                  >
                    <RotateCcw size={14} />
                  </IconButton>
                </div>
                <div className="overflow-hidden bg-muted/15 p-2 sm:p-4">
                  {!loaded && (
                    <p role="status" className="px-2 py-1 text-xs text-muted-foreground">
                      Opening example…
                    </p>
                  )}
                  {/* Keep the viewport steady as forms, dialogs and receipts appear.
                  Changing its height during pointer input moves the controls. */}
                  <iframe
                    key={previewKey}
                    title={`${example.name} interactive example`}
                    sandbox="allow-scripts"
                    referrerPolicy="no-referrer"
                    src={`${galleryPreviewUrl(example.id)}#${new URLSearchParams({ example: example.id, state, theme })}`}
                    className={cn(
                      'mx-auto block h-[760px] w-full rounded-lg border border-border bg-background',
                      phone && 'max-w-[390px]',
                    )}
                    onLoad={() => setLoaded(true)}
                  />
                </div>
                <p className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
                  Production components · Fictional data · Actions stay inside this preview
                </p>
              </section>

              <dl className="grid gap-4 rounded-xl border border-border bg-muted/10 p-4 text-xs sm:grid-cols-2">
                <div>
                  <dt className="font-medium">How it appears</dt>
                  <dd className="mt-1.5 leading-relaxed text-muted-foreground">{example.trigger}</dd>
                </div>
                <div>
                  <dt className="font-medium">What is saved</dt>
                  <dd className="mt-1.5 leading-relaxed text-muted-foreground">{example.persistence}</dd>
                </div>
              </dl>
              <details className="rounded-xl border border-border px-4 py-3">
                <summary className="cursor-pointer text-xs font-medium">Where this UI lives</summary>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {GALLERY_ORIGINS[example.origin].description}
                </p>
                <ul className="mt-3 space-y-2">
                  {example.sources.map((source) => (
                    <li key={source} className="flex min-w-0 items-start gap-2 rounded-md bg-muted/40 p-2">
                      <code className="min-w-0 flex-1 break-all text-[10px] leading-relaxed">{source}</code>
                      <IconButton
                        type="button"
                        onClick={() => void copy(source)}
                        label={`Copy ${source}`}
                        tooltip="Copy the repository path"
                        variant="ghost"
                        size="xs"
                        className="shrink-0"
                      >
                        {copied === source ? <Check size={12} /> : <Copy size={12} />}
                      </IconButton>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  The catalog and preview fixtures live in <code>src/components/chat-ui/gallery/</code>.
                  Built-in interfaces live together in src/components/chat-ui/ and are reused here.
                  Connected-app hosts keep their own modules.
                </p>
              </details>
            </article>
          )}
        </div>
      </main>
    </div>
  );
}
