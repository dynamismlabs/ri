import { afterAll, beforeAll, expect, it } from 'vitest';
import { testTimeouts } from '@/test/fixtures/browser-timeouts';
import { overlayFormsFixture } from '@/test/fixtures/overlay-forms';
let fixture: Awaited<ReturnType<typeof overlayFormsFixture>>;
beforeAll(async () => {
  fixture = await overlayFormsFixture({
    builder: true,
    baselineShell: process.env.RI_OVERLAY_BASELINE === '1',
    baselinePicker: process.env.RI_OVERLAY_BASELINE_PICKER === '1',
  });
}, 120_000);
afterAll(async () => {
  await fixture?.close();
});
for (const width of [390, 1440]) {
  it(`traps Schedules focus and returns it to its trigger at ${width}px`, async () => {
    const page = await fixture.browser.newPage({
      viewport: { width, height: 844 },
    });
    try {
      testTimeouts(page, 4000);
      await page.goto(fixture.url + '/?surface=schedule');
      const trigger = page.getByRole('button', { name: 'Open form' });
      await trigger.click();
      const dialog = page.getByRole('dialog', {
        name: 'Schedules and Triggers',
      });
      await dialog.waitFor();
      expect(
        await page.locator('body').getAttribute('data-scroll-locked'),
      ).not.toBe(null);
      expect(await trigger.count()).toBe(0);
      await page
        .getByRole('button', { name: 'New scheduled task', exact: true })
        .click();
      const editor = page.getByRole('textbox', { name: 'Schedule builder' });
      await editor.waitFor();
      await editor.focus();
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(
          () => !!document.activeElement?.closest('[role=dialog]'),
        ),
      ).toBe(true);
      await page
        .getByRole('textbox', { name: 'Name', exact: false })
        .first()
        .focus();
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      await expect
        .poll(() => trigger.evaluate((el) => document.activeElement === el))
        .toBe(true);
      expect(
        await page.locator('body').getAttribute('data-scroll-locked'),
      ).toBe(null);
    } finally {
      await page.close();
    }
  });
  for (const kind of ['@', '/'])
    it(`keeps the builder ${kind} popup readable, clickable and first on Escape at ${width}px`, async () => {
      const page = await fixture.browser.newPage({
          viewport: { width, height: 844 },
        }),
        errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      try {
        testTimeouts(page, 4000);
        await page.goto(fixture.url + '/?surface=schedule');
        await page.getByRole('button', { name: 'Open form' }).click();
        await page
          .getByRole('button', { name: 'New scheduled task', exact: true })
          .click();
        const dialog = page.getByRole('dialog', {
            name: 'Schedules and Triggers',
          }),
          editor = page.getByRole('textbox', { name: 'Schedule builder' });
        await editor.click();
        await page.keyboard.type(kind);
        const popup = page.locator('.slash-command-popup'),
          pick =
            kind === '@'
              ? popup.getByText('index.ts', { exact: true })
              : popup.getByRole('button', { name: /review/ });
        await pick.waitFor();
        expect(
          await popup.evaluate(
            (el) =>
              !!el.closest('[role=dialog]') &&
              !el.closest('[aria-hidden=true]'),
          ),
        ).toBe(true);
        await page.keyboard.press('Escape');
        await popup.waitFor({ state: 'detached' });
        expect(await dialog.isVisible()).toBe(true);
        expect(await editor.innerText()).toBe(kind);
        await editor.press('ControlOrMeta+A');
        await editor.press('Backspace');
        await expect
          .poll(async () => (await editor.innerText()).trim())
          .toBe('');
        await page.keyboard.type(kind);
        await pick.waitFor();
        await pick.click();
        await popup.waitFor({ state: 'detached' });
        expect(await dialog.isVisible()).toBe(true);
        expect(
          await page.evaluate(() =>
            (
              window as unknown as { builderDraft: () => string }
            ).builderDraft(),
          ),
        ).toContain(kind === '@' ? 'index.ts' : '/review');
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached' });
        expect(errors).toEqual([]);
      } finally {
        await page.close();
      }
    });
  it(`dismisses a nested builder layer before Schedules at ${width}px`, async () => {
    const page = await fixture.browser.newPage({
      viewport: { width, height: 844 },
    });
    try {
      testTimeouts(page, 4000);
      await page.goto(fixture.url + '/?surface=schedule');
      await page.getByRole('button', { name: 'Open form' }).click();
      await page
        .getByRole('button', { name: 'New scheduled task', exact: true })
        .click();
      const dialog = page.getByRole('dialog', {
        name: 'Schedules and Triggers',
      });
      for (const kind of ['popup', 'menu', 'sheet']) {
        const trigger = page.getByRole('button', {
          name: 'Builder ' + kind,
          exact: true,
        });
        await trigger.click();
        const child =
          kind === 'menu'
            ? page.getByRole('menu')
            : kind === 'sheet'
              ? page.getByRole('dialog', { name: 'Builder details' })
              : page.getByRole('button', { name: 'Popup action' });
        await child.waitFor();
        await page.keyboard.press('Escape');
        await child.waitFor({ state: 'detached' });
        expect(await dialog.isVisible()).toBe(true);
        await expect
          .poll(() => trigger.evaluate((el) => document.activeElement === el))
          .toBe(true);
        expect(
          await page.locator('body').getAttribute('data-scroll-locked'),
        ).not.toBe(null);
      }
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      expect(
        await page.locator('body').getAttribute('data-scroll-locked'),
      ).toBe(null);
    } finally {
      await page.close();
    }
  });
}

for (const width of [390, 1440])
  it(`dismisses the actual schedule agent picker before the window at ${width}px`, async () => {
    const page = await fixture.browser.newPage({
      viewport: { width, height: 844 },
    });
    testTimeouts(page, 4000);
    try {
      await page.goto(fixture.url + '/?surface=schedule');
      await page.getByRole('button', { name: 'Open form' }).click();
      await page
        .getByRole('button', { name: 'New scheduled task', exact: true })
        .click();
      const dialog = page.getByRole('dialog', {
          name: 'Schedules and Triggers',
        }),
        trigger = page.getByRole('button', { name: 'Agent', exact: true });
      await trigger.click();
      const pick = page.getByRole('button', {
        name: 'Current agent',
        exact: true,
      });
      await pick.waitFor();
      await page.keyboard.press('Escape');
      await pick.waitFor({ state: 'detached' });
      expect(await dialog.isVisible()).toBe(true);
      await expect
        .poll(() => trigger.evaluate((el) => el === document.activeElement))
        .toBe(true);
      await trigger.click();
      await pick.click();
      expect(await trigger.innerText()).toContain('Current agent');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
    } finally {
      await page.close();
    }
  });
