import { afterAll, beforeAll, expect, it } from 'vitest';
import { overlayFormsFixture } from '@/test/fixtures/overlay-forms';
let fixture: Awaited<ReturnType<typeof overlayFormsFixture>>;
beforeAll(async () => {
  fixture = await overlayFormsFixture();
}, 120_000);
afterAll(async () => {
  await fixture?.close();
});

for (const theme of ['light', 'dark'])
  for (const width of [360, 390])
    for (const surface of [
      'linked-folder',
      'agent',
      'schedule',
      'mcp',
      'connector',
    ]) {
      it(`keeps ${surface}'s primary action visible with body before footer at ${width}px (${theme})`, async () => {
        const page = await fixture.browser.newPage({
            viewport: { width, height: 844 },
          }),
          errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.route('**/api/trpc/**', (route) =>
          route.fulfill({
            json: {
              result: {
                data: { toolkits: [], providers: [], connections: [] },
              },
            },
          }),
        );
        try {
          await page.goto(`${fixture.url}/?surface=${surface}&theme=${theme}`);
          await page
            .getByRole('button', { name: 'Open form', exact: true })
            .click();
          if (surface === 'schedule')
            await page
              .getByRole('button', { name: 'New scheduled task', exact: true })
              .click();
          const dialog = page.getByRole('dialog');
          await dialog.waitFor();
          const primary = page.getByRole('button', {
            name:
              surface === 'linked-folder'
                ? 'Add'
                : surface === 'agent'
                  ? 'Create agent'
                  : surface === 'schedule'
                    ? 'Save'
                    : surface === 'mcp'
                      ? 'Add and connect'
                      : 'Connect Sentry',
            exact: true,
          });
          await primary.waitFor();
          // Inspect at the initial scroll position, before focus or scrolling can reveal the footer.
          const geometry = await primary.evaluate((el) => {
            const box = el.getBoundingClientRect(),
              frame = el.closest('[role="dialog"]')!.getBoundingClientRect();
            const hit = document.elementFromPoint(
              box.x + box.width / 2,
              box.y + box.height / 2,
            );
            return {
              visible:
                box.top >= frame.top &&
                box.bottom <= Math.min(frame.bottom, innerHeight) &&
                !!hit &&
                (hit === el || el.contains(hit)),
              overflow: frame.x < 0 || frame.right > innerWidth,
            };
          });
          expect(geometry).toEqual({ visible: true, overflow: false });
          // Even when the action is disabled, its DOM position follows the body's controls.
          expect(
            await primary.evaluate((el) => {
              const dialog = el.closest('[role="dialog"]')!;
              const controls = [
                ...dialog.querySelectorAll(
                  'input:not([type=hidden]),textarea,select,[role=switch],[role=radio]',
                ),
              ].filter((control) => control.getClientRects().length);
              return (
                controls.length > 0 &&
                controls.every(
                  (control) =>
                    !!(
                      control.compareDocumentPosition(el) &
                      Node.DOCUMENT_POSITION_FOLLOWING
                    ),
                )
              );
            }),
          ).toBe(true);
          expect(errors).toEqual([]);
        } finally {
          await page.close();
        }
      });
    }
