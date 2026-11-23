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
          if (surface === 'agent')
            await page
              .getByRole('textbox', { name: 'Agent name', exact: true })
              .fill('Design');
          if (surface === 'linked-folder') {
            await page
              .getByRole('textbox', { name: /Where it is/ })
              .fill('/Users/example/backend');
            await page
              .getByRole('textbox', { name: 'Alias', exact: true })
              .fill('backend');
          }
          if (surface === 'schedule') {
            await page
              .getByRole('textbox', { name: /^Name/ })
              .fill('Daily review');
            await page
              .getByRole('textbox', { name: 'Message', exact: true })
              .fill('Review the changes.');
          }
          if (surface === 'mcp') {
            await page
              .getByRole('textbox', { name: 'Header name', exact: true })
              .fill('X-API-Key');
            await page
              .getByLabel('Secret', { exact: true })
              .fill('synthetic-secret');
          }
          if (surface === 'connector')
            for (const key of ['organization', 'project', 'apiKey'])
              await page
                .locator(`[id="cred-sentry-${key}"]`)
                .fill('synthetic-' + key);
          expect(await primary.isEnabled()).toBe(true);
          const expected = await primary.evaluate((el) => {
            const footer =
              el.closest(
                '[data-slot="form-actions"],[data-slot="dialog-footer"]',
              ) ?? el.parentElement!;
            const dialog = el.closest('[role="dialog"]')!;
            const tabbable = (node: Element) => {
              const element = node as HTMLElement;
              return (
                element.tabIndex >= 0 &&
                !!element.getClientRects().length &&
                !element.hasAttribute('disabled') &&
                getComputedStyle(element).visibility !== 'hidden'
              );
            };
            const body = [
              ...dialog.querySelectorAll(
                'button,input,textarea,select,a[href],[tabindex]',
              ),
            ].filter(
              (node) =>
                tabbable(node) &&
                !footer.contains(node) &&
                !!(
                  node.compareDocumentPosition(footer) &
                  Node.DOCUMENT_POSITION_FOLLOWING
                ),
            );
            (body.at(-1) as HTMLElement).focus();
            return [...footer.querySelectorAll('button,a[href]')]
              .filter(tabbable)
              .map((node) => node.textContent?.trim());
          });
          for (const label of expected) {
            await page.keyboard.press('Tab');
            expect(
              await page.evaluate(() =>
                document.activeElement?.textContent?.trim(),
              ),
            ).toBe(label);
          }
          await primary.click();
          await expect
            .poll(() =>
              page.evaluate(
                () =>
                  (window as unknown as { fixtureCalls: unknown[] })
                    .fixtureCalls.length,
              ),
            )
            .toBe(1);
          expect(errors).toEqual([]);
        } finally {
          await page.close();
        }
      });
    }

for (const surface of ['mcp', 'connector'])
  it(`submits the actual ${surface} form through its pinned native action`, async () => {
    const page = await fixture.browser.newPage({
      viewport: { width: 360, height: 844 },
    });
    await page.route('**/api/trpc/**', (route) =>
      route.fulfill({
        json: {
          result: { data: { toolkits: [], providers: [], connections: [] } },
        },
      }),
    );
    try {
      await page.goto(`${fixture.url}/?surface=${surface}`);
      await page
        .getByRole('button', { name: 'Open form', exact: true })
        .click();
      if (surface === 'mcp') {
        await page
          .getByRole('textbox', { name: 'Header name', exact: true })
          .fill('X-API-Key');
        await page
          .getByLabel('Secret', { exact: true })
          .fill('synthetic-secret');
      } else
        for (const key of ['organization', 'project', 'apiKey'])
          await page
            .locator(`[id="cred-sentry-${key}"]`)
            .fill('synthetic-' + key);
      const button = page.getByRole('button', {
        name: surface === 'mcp' ? 'Add and connect' : 'Connect Sentry',
        exact: true,
      });
      expect(await button.isEnabled()).toBe(true);
      await button.click();
      const calls = await page.evaluate(
        () =>
          (window as unknown as { fixtureCalls: Record<string, string>[] })
            .fixtureCalls,
      );
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject(
        surface === 'mcp'
          ? { name: 'Sentry', header: 'X-API-Key', secret: 'synthetic-secret' }
          : {
              organization: 'synthetic-organization',
              project: 'synthetic-project',
              apiKey: 'synthetic-apiKey',
            },
      );
    } finally {
      await page.close();
    }
  });
