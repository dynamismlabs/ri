/** The real review bar with the app's styles, against a stubbed review context. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { browserFixture } from '@/test/fixtures/browser-fixture';
import { testTimeouts } from '@/test/fixtures/browser-timeouts';

let fixture: Awaited<ReturnType<typeof browserFixture>>;

beforeAll(async () => {
  fixture = await browserFixture(`
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
    import {TipProvider} from '@/components/ui/tip';
    import {ExecutionReviewBar} from '@/components/executions/execution-review-bar';
    const width = Number(new URLSearchParams(location.search).get('width') || 768);
    createRoot(document.getElementById('root')).render(
      <QueryClientProvider client={new QueryClient()}>
        <TipProvider>
          <main style={{width}} data-testid="column"><ExecutionReviewBar executionId="execution" /></main>
        </TipProvider>
      </QueryClientProvider>,
    );
  `, [{
    name: 'review-context',
    setup(api) {
      api.onResolve({ filter: /^@\/lib\/query\/entity-keys$/ }, () => ({ path: 'keys', namespace: 'fixture' }));
      api.onResolve({ filter: /^@\/lib\/trpc\/client$/ }, () => ({ path: 'trpc', namespace: 'fixture' }));
      api.onLoad({ filter: /^keys$/, namespace: 'fixture' }, () => ({ loader: 'tsx', contents: `export const entityKeys = { tasks: { all: ['tasks'] } };` }));
      api.onLoad({ filter: /^trpc$/, namespace: 'fixture' }, () => ({
        loader: 'tsx', resolveDir: process.cwd(), contents: `
          const key = name => () => ['fixture', name];
          export const trpc = { executions: { reviewContextGet: { queryKey: key('review') }, tasksGet: { queryKey: key('tasks') } } };
          export const trpcClient = { executions: {
            reviewContextGet: { query: async () => ({ latestOutputEventId: 'output', associatedTaskCount: 1, hasUnreviewedOutput: true, latestDisposition: null }) },
            tasksGet: { query: async () => [{ id: 'task', title: 'Fix offline sync', status: 'in_progress' }] },
            reviewPost: { mutate: async () => ({}) },
          } };
        `,
      }));
    },
  }], { css: true });
}, 60_000);

afterAll(async () => { await fixture?.close(); });

async function open(width: number): Promise<Page> {
  const page = await fixture.browser.newPage({ viewport: { width: 1200, height: 400 } });
  testTimeouts(page, 10_000);
  await page.goto(`${fixture.url}/?width=${width}`);
  await page.getByRole('button', { name: 'Accept & complete', exact: true }).waitFor();
  return page;
}

/** The top of the title and of every action, so a wrap shows as a second row. */
const rows = (page: Page) => page.locator('[data-slot="review-bar"]').evaluate(bar => {
  const tops = [bar.querySelector('[data-slot="review-bar-title"]')!, ...bar.querySelectorAll('button')]
    .map(el => Math.round(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2));
  return new Set(tops).size;
});

it('keeps the title and every action on one row in the chat column', async () => {
  // The composer's column: max-w-3xl, the same width the bar sits in beside a normal chat.
  const page = await open(768);
  try {
    expect(await page.getByText('Review the latest output', { exact: true }).isVisible()).toBe(true);
    expect(await rows(page)).toBe(1);
  } finally { await page.close(); }
});

it('drops the actions below the title on a narrow chat without squeezing a label', async () => {
  const page = await open(420);
  try {
    expect(await rows(page)).toBeGreaterThan(1);
    for (const name of ['Request changes', 'Dismiss', 'Accept', 'Accept & complete']) {
      const lines = await page.getByRole('button', { name, exact: true }).evaluate(el => Math.round(el.getBoundingClientRect().height));
      expect(lines).toBeLessThanOrEqual(28);
    }
  } finally { await page.close(); }
});
