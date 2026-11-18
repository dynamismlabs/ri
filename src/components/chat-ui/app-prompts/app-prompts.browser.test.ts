/**
 * An app's prompts in the composer's `/` menu (src/lib/integrations/app-prompts.ts): picking one
 * takes the typed `/query` out, a prompt with arguments asks for them in a small form, and the
 * app's text lands in the draft to edit. Nothing is sent, and no command badge is made.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;

beforeAll(async () => {
  fixture = await browserFixture(`
    import React, { useEffect, useRef, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
    import { ChatInputEditor } from './src/components/chat/editor/chat-input-editor';
    import { AppPromptDialog } from './src/components/chat-ui/app-prompts/app-prompt-dialog';
    import { appPromptCommand } from './src/hooks/use-app-prompts';
    import { TipProvider } from './src/components/ui/tip';

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const app = { serverId: 'srv-people', toolkitId: 'app_people', app: 'People' };
    const prompts = [
      { ...app, command: 'people:weekly-review', name: 'weekly-review', title: 'Weekly review', arguments: [] },
      { ...app, command: 'people:prepare-for-a-meeting', name: 'prepare-for-a-meeting', title: 'Prepare for a meeting', description: 'Get ready to talk to someone.',
        arguments: [{ name: 'person', title: 'Person', description: 'Who you are meeting.', required: true }, { name: 'focus', required: false }] },
    ];
    const skill = { id: 'review', name: 'review', description: 'Review the diff', source: 'installed-user', userInvocable: true, available: true, execution: { kind: 'provider-slash', provider: 'claude', commandText: '/review' } };

    function Fixture() {
      const ref = useRef(null);
      const [open, setOpen] = useState(null);
      const [opened, setOpened] = useState(0);
      useEffect(() => { Object.assign(window, { testComposer: { text: () => ref.current?.getMarkerOutput().text ?? '', clear: () => ref.current?.clear(), opened: () => opened } }); }, [opened]);
      // What the app answers, as the composer's picker gets it: text, then an embedded resource.
      const fill = async (prompt, args) => {
        if (args.person === 'Nobody') throw new Error('No one called "Nobody" is in People.');
        const text = prompt.name === 'weekly-review' ? 'Review my week.' : 'Prepare me for my meeting with ' + args.person + (args.focus ? ', about ' + args.focus : '') + '.';
        ref.current?.insertAppPrompt(null, [{ type: 'text', text }, { type: 'snippet', title: 'people://week', text: 'Three meetings' }]);
      };
      return (
        <QueryClientProvider client={client}>
          <TipProvider>
            <div style={{ margin: '320px 16px 0', width: 560 }}>
              <ChatInputEditor ref={ref} ariaLabel="Composer" slashCommands={[skill, ...prompts.map(appPromptCommand)]}
                onSlashMenuOpen={() => setOpened(count => count + 1)}
                onAppPrompt={(prompt) => { if (prompt.arguments.length) setOpen(prompt); else void fill(prompt, {}); }} />
              <AppPromptDialog prompt={open} onOpenChange={(next) => { if (!next) setOpen(null); }}
                onFill={async (args) => { await fill(open, args); setOpen(null); }} />
            </div>
          </TipProvider>
        </QueryClientProvider>
      );
    }
    createRoot(document.getElementById('root')).render(<Fixture />);
  `, [], { css: true });
}, 120_000);

afterAll(async () => {
  await fixture?.close();
});

type TestComposer = { text(): string; clear(): void; opened(): number };

it('lists app prompts after skills, and puts a picked prompt in the draft as text, asking for its arguments first', async () => {
  const context = await fixture.browser.newContext({ viewport: { width: 900, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  try {
    await page.goto(fixture.url);
    const editor = page.locator('.ProseMirror[contenteditable="true"]');
    const popup = page.locator('.slash-command-popup');
    await editor.click();

    // The menu lists the skill, then each prompt by app, and asks for the list again as it opens.
    await page.keyboard.type('/');
    await popup.getByRole('button', { name: /people:weekly-review.*People · Weekly review/ }).waitFor();
    await popup.getByRole('button', { name: /review.*Review the diff/ }).first().waitFor();
    expect(await page.evaluate(() => (window as unknown as { testComposer: TestComposer }).testComposer.opened())).toBeGreaterThan(0);

    // A prompt with no arguments goes straight in: the typed query is gone, and no command badge is made.
    await page.keyboard.type('people:week');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => (window as unknown as { testComposer: TestComposer }).testComposer.text())).toBe('Review my week. Three meetings');
    expect(await editor.locator('[data-slash-command]').count()).toBe(0);
    expect(await popup.count()).toBe(0);

    // One with arguments asks first. Its required field must be filled, and the app's refusal is shown.
    await page.evaluate(() => (window as unknown as { testComposer: TestComposer }).testComposer.clear());
    await editor.click();
    await page.keyboard.type('/people:prep');
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Prepare for a meeting' });
    await dialog.getByText('Get ready to talk to someone. People writes the request, and it goes in your draft to edit before you send it.').waitFor();
    await dialog.getByText('Who you are meeting.').waitFor();
    await dialog.getByText('(optional)').waitFor();
    await dialog.getByRole('button', { name: 'Add to draft' }).click();
    expect(await dialog.isVisible()).toBe(true);
    await dialog.getByLabel('Person').fill('Nobody');
    await dialog.getByRole('button', { name: 'Add to draft' }).click();
    await dialog.getByRole('alert').getByText('No one called "Nobody" is in People.').waitFor();
    await dialog.getByLabel('Person').fill('Ada');
    // An argument with no title is named in words.
    await dialog.getByLabel('Focus').fill('the launch');
    await dialog.getByRole('button', { name: 'Add to draft' }).click();
    await dialog.waitFor({ state: 'detached' });
    await expect.poll(() => page.evaluate(() => (window as unknown as { testComposer: TestComposer }).testComposer.text())).toBe('Prepare me for my meeting with Ada, about the launch. Three meetings');

    // Typing a prompt's name by hand stays text: only the menu fills one in.
    await page.evaluate(() => (window as unknown as { testComposer: TestComposer }).testComposer.clear());
    await editor.click();
    await page.keyboard.type('/people:weekly-review ');
    expect(await editor.locator('[data-slash-command]').count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}, 60_000);
