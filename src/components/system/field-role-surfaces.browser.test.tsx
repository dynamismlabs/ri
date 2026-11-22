import { afterAll, beforeAll, expect, it } from 'vitest';
import { toolListFixture } from '@/test/fixtures/tool-list';
let fixture: Awaited<ReturnType<typeof toolListFixture>>;
beforeAll(async () => { fixture = await toolListFixture(); }, 120_000);
afterAll(async () => { await fixture?.close(); });
for (const theme of ['light','dark']) for (const width of [360,390,900]) {
  it(`keeps the real tool filter md32 or touch40 beside its passive heading at ${width} ${theme}`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width, height: 844 } });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const field = page.getByRole('textbox', { name: 'Filter tools', exact: true });
      await field.waitFor();
      expect(await field.evaluate(el => (el.closest('[data-slot="field-shell"]') ?? el).getBoundingClientRect().height)).toBe(width < 768 ? 40 : 32);
      expect(await page.locator('body').evaluate(el => el.scrollWidth > innerWidth)).toBe(false);
      await field.fill('read_item_24');
      await page.getByText('read_item_24', { exact: true }).waitFor();
      expect(await page.getByText('read_item_0', { exact: true }).count()).toBe(0);
    } finally { await page.close(); }
  });
}
