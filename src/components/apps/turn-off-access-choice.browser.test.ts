/**
 * Remove's confirmation for an app Ri can't uninstall offers to turn off its hub access too,
 * ticked to start with, and Remove reads the choice the person left (src/lib/apps/remove.ts).
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;

beforeAll(async () => {
  fixture = await browserFixture(`
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { ConfirmProvider, useConfirm } from './src/components/ui/confirm-dialog';
    import { TurnOffAccessChoice } from './src/components/apps/turn-off-access-choice';

    function Remove() {
      const confirm = useConfirm();
      const [result, setResult] = useState('');
      const run = async () => {
        const choice = { turnOffAccess: true };
        const ok = await confirm({ title: 'Remove Tide Log from Ri?', description: 'Tide Log may keep running.', confirmLabel: 'Remove', tone: 'destructive',
          content: <TurnOffAccessChoice name="Tide Log" onChange={(on) => { choice.turnOffAccess = on; }} /> });
        setResult(ok ? 'removed, turnOffAccess=' + choice.turnOffAccess : 'kept');
      };
      return <main><button onClick={run}>Remove</button><p role="status">{result}</p></main>;
    }
    createRoot(document.getElementById('root')).render(<ConfirmProvider><Remove /></ConfirmProvider>);
  `, [], { css: true });
}, 120_000);

afterAll(async () => {
  await fixture?.close();
});

it('starts ticked, and Remove takes whichever choice the person left', async () => {
  const context = await fixture.browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  try {
    await page.goto(fixture.url);
    const remove = async () => { await page.getByRole('button', { name: 'Remove', exact: true }).first().click(); return page.getByRole('alertdialog'); };
    let dialog = await remove();
    const box = dialog.getByRole('checkbox', { name: 'Also turn off Tide Log’s access to your accounts' });
    expect(await box.getAttribute('aria-checked')).toBe('true');
    await dialog.getByText('Requests waiting for you and approvals it hasn’t used yet are dropped.').waitFor();
    await dialog.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('status').getByText('removed, turnOffAccess=true').waitFor();

    dialog = await remove();
    await dialog.getByRole('checkbox').click();
    expect(await dialog.getByRole('checkbox').getAttribute('aria-checked')).toBe('false');
    await dialog.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('status').getByText('removed, turnOffAccess=false').waitFor();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}, 60_000);
