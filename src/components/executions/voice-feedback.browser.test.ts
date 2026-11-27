/**
 * Voice from Stop until the words arrive, in a real browser, through the real
 * voice hook (fixture: src/test/fixtures/voice-capture.tsx). Parakeet and Groq
 * record with a recorder that flushes its last audio for 500 ms after Stop,
 * then wait on a transcription request the test holds as long as it likes.
 * Browser speech finishes recognition on its own time after Stop. Through all
 * of it the chat composer and Quick Capture say Transcribing… where it can be
 * read, Cancel stays where it was, auto-send waits for the whole transcript,
 * and a canceled one never reaches the draft or a send.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Locator, Page, Route } from 'playwright-core';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`import './src/test/fixtures/voice-capture';`, [], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });

const PARAKEET = 'local/parakeet-tdt-0.6b-v3';
const GROQ = 'groq/whisper-large-v3-turbo';
const BROWSER = 'web/speech-recognition';

interface Opened { page: Page; held: Route[]; close(): Promise<void> }

/** Open a surface on a phone-sized screen, holding every transcription request. */
async function open(query: { surface?: 'composer' | 'capture'; model: string; autoSend?: boolean; width?: number }): Promise<Opened> {
  const width = query.width ?? 390;
  const context = await fixture.browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const held: Route[] = [];
  await page.route('**/api/transcribe', (route) => { held.push(route); });
  const search = new URLSearchParams({ surface: query.surface ?? 'composer', model: query.model, autoSend: query.autoSend === false ? '0' : '1' });
  await page.goto(`${fixture.url}/?${search}`);
  return { page, held, close: () => context.close() };
}

const answer = (route: Route, text: string) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify({ text }) }).catch(() => { /* canceled: the request was aborted */ });
const sent = (page: Page) => page.evaluate(() => window.voiceFixture.sent);
const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error('not drawn');
  return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
};

describe('chat composer', () => {
  const transcribing = (page: Page) => page.locator('[data-voice-transcribing]');
  const cancel = (page: Page) => page.getByRole('button', { name: 'Cancel', exact: true });
  const editor = (page: Page) => page.locator('.ProseMirror');
  const draft = async (page: Page) => (await editor(page).innerText()).trim();

  it('says Transcribing… from Stop through the recorder flush and a slow Parakeet answer, then auto-sends the whole transcript', async () => {
    const { page, held, close } = await open({ model: PARAKEET });
    try {
      await page.getByRole('button', { name: 'Voice input', exact: true }).click();
      const stop = page.getByRole('button', { name: 'Stop recording', exact: true });
      await stop.waitFor();
      await expect.poll(() => editor(page).isVisible()).toBe(false);
      const cancelWhileRecording = await box(cancel(page));

      await stop.click();
      // Straight away, inside the 500 ms flush: nothing reads as idle.
      await transcribing(page).waitFor({ timeout: 300 });
      expect(await transcribing(page).innerText()).toBe('Transcribing…');
      expect(await box(cancel(page))).toEqual(cancelWhileRecording);
      expect(await page.getByRole('button', { name: 'Send message' }).count()).toBe(0);
      expect(await page.getByRole('button', { name: 'Recording stopped' }).isDisabled()).toBe(true);
      // The label sits inside the composer card, at a readable size.
      expect(await transcribing(page).evaluate(el => !!el.closest('[data-slot="chat-composer-card"]'))).toBe(true);
      expect(await transcribing(page).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13);

      // The flush ends and the request goes out. Still transcribing while it waits.
      await expect.poll(() => held.length).toBe(1);
      await page.waitForTimeout(400);
      expect(await transcribing(page).isVisible()).toBe(true);
      expect(await box(cancel(page))).toEqual(cancelWhileRecording);
      expect(await sent(page)).toEqual([]);

      await answer(held[0]!, 'call the dentist about Tuesday');
      await expect.poll(() => sent(page)).toEqual([{ text: 'call the dentist about Tuesday', viaVoice: true }]);
      await transcribing(page).waitFor({ state: 'detached' });
      expect(await cancel(page).count()).toBe(0);
      await page.getByRole('button', { name: 'Voice input', exact: true }).waitFor();
    } finally { await close(); }
  });

  it('puts a slow Groq transcript in at the cursor in manual mode, keeping the draft around it', async () => {
    const { page, held, close } = await open({ model: GROQ, autoSend: false });
    try {
      await editor(page).click();
      await page.keyboard.type('Remind me tomorrow');
      for (let i = 0; i < ' tomorrow'.length; i++) await page.keyboard.press('ArrowLeft');
      // The editor reads the moved cursor a moment later, as it would a tap.
      await expect.poll(() => page.evaluate(() =>
        (document.querySelector('.ProseMirror') as HTMLElement & { editor?: { state: { selection: { from: number } } } }).editor?.state.selection.from,
      )).toBe('Remind me'.length + 1);

      await page.getByRole('button', { name: 'Voice input', exact: true }).click();
      await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
      await transcribing(page).waitFor({ timeout: 300 });
      await expect.poll(() => held.length).toBe(1);
      expect((held[0]!.request().postDataBuffer() ?? Buffer.alloc(0)).toString('latin1')).toContain(GROQ);

      await answer(held[0]!, 'to call Sam');
      await transcribing(page).waitFor({ state: 'detached' });
      await expect.poll(() => draft(page)).toBe('Remind me to call Sam tomorrow');
      expect(await sent(page)).toEqual([]);
    } finally { await close(); }
  });

  it('cancels during the recorder flush and while waiting, and a late answer reaches neither the draft nor a send', async () => {
    const { page, held, close } = await open({ model: PARAKEET });
    try {
      // Canceled inside the flush: no request goes out at all.
      await page.getByRole('button', { name: 'Voice input', exact: true }).click();
      await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
      await cancel(page).click();
      await transcribing(page).waitFor({ state: 'detached' });
      await page.waitForTimeout(700);
      expect(held.length).toBe(0);

      // Canceled while the answer is on its way.
      await page.getByRole('button', { name: 'Voice input', exact: true }).click();
      await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
      await expect.poll(() => held.length).toBe(1);
      await cancel(page).click();
      await transcribing(page).waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Voice input', exact: true }).waitFor();
      await answer(held[0]!, 'never mind');
      await page.waitForTimeout(300);
      expect(await sent(page)).toEqual([]);
      expect(await draft(page)).toBe('');
    } finally { await close(); }
  });

  it('holds browser speech until recognition ends, so auto-send sends the whole transcript once', async () => {
    const { page, close } = await open({ model: BROWSER });
    try {
      await page.getByRole('button', { name: 'Voice input', exact: true }).click();
      const stop = page.getByRole('button', { name: 'Stop recording', exact: true });
      await stop.waitFor();
      await page.evaluate(() => window.voiceFixture.say(0, 'buy milk'));
      await page.waitForTimeout(100);
      expect(await sent(page)).toEqual([]);

      await stop.click();
      await transcribing(page).waitFor({ timeout: 300 });
      // The last words land after Stop, and a settled result can come again.
      await page.evaluate(() => { window.voiceFixture.say(0, 'buy milk', ' and eggs'); });
      await page.waitForTimeout(100);
      expect(await sent(page)).toEqual([]);
      expect(await transcribing(page).isVisible()).toBe(true);

      await page.evaluate(() => window.voiceFixture.end());
      await expect.poll(() => sent(page)).toEqual([{ text: 'buy milk and eggs', viaVoice: true }]);
      await transcribing(page).waitFor({ state: 'detached' });
    } finally { await close(); }
  });

  it('publishes nothing from browser speech canceled after Stop, or after an error', async () => {
    const { page, close } = await open({ model: BROWSER, autoSend: false });
    try {
      await page.getByRole('button', { name: 'Voice input', exact: true }).click();
      await page.evaluate(() => window.voiceFixture.say(0, 'secret words'));
      await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
      await transcribing(page).waitFor();
      await cancel(page).click();
      expect(await page.evaluate(() => window.voiceFixture.aborted)).toBe(1);
      await page.evaluate(() => { window.voiceFixture.say(1, 'late words'); window.voiceFixture.end(); });
      await page.waitForTimeout(200);
      expect(await draft(page)).toBe('');

      await page.getByRole('button', { name: 'Voice input', exact: true }).click();
      await page.evaluate(() => window.voiceFixture.say(0, 'half a'));
      await page.evaluate(() => window.voiceFixture.fail('network'));
      await page.getByRole('alert').filter({ hasText: 'Speech recognition error' }).waitFor();
      expect(await draft(page)).toBe('');
      expect(await sent(page)).toEqual([]);
    } finally { await close(); }
  });

  for (const width of [360, 390]) {
    it(`keeps the voice controls on one row of 40px targets, recording and transcribing (${width}px)`, async () => {
      const { page, close } = await open({ model: BROWSER, width });
      try {
        const row = page.locator('[data-composer-controls]');
        const check = async () => {
          const boxes = await row.locator('button, [role="switch"]').evaluateAll(controls => controls.map(el => { const r = el.getBoundingClientRect(); return { tag: el.getAttribute('role') ?? el.tagName, y: r.y + r.height / 2, h: r.height, x: r.x, right: r.right }; }));
          const buttons = boxes.filter(b => b.tag === 'BUTTON');
          expect(buttons.length).toBeGreaterThanOrEqual(2);
          for (const b of buttons) expect(b.h).toBe(40);
          for (const b of boxes) { expect(Math.abs(b.y - boxes[0]!.y)).toBeLessThanOrEqual(1); expect(b.x).toBeGreaterThanOrEqual(0); expect(b.right).toBeLessThanOrEqual(width); }
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        };
        // The composer keeps its size from the mic to the transcript (at
        // 360px the empty box's placeholder wraps to a second line).
        const card = page.locator('[data-slot="chat-composer-card"]');
        await editor(page).waitFor();
        const idle = await box(card);
        await page.getByRole('button', { name: 'Voice input', exact: true }).click();
        await page.getByRole('button', { name: 'Stop recording', exact: true }).waitFor();
        await check();
        const listening = await box(card);
        if (width >= 390) expect(listening).toEqual(idle);
        // Browser speech has no waveform to draw, so it says it's listening.
        expect(await card.getByRole('status').filter({ hasText: 'Listening…' }).isVisible()).toBe(true);
        // The composer sits on the screen's bottom edge in the app, so the
        // status line under it has to keep its height too.
        const block = card.locator('xpath=..');
        const blockWhileListening = await box(block);
        const recording = await box(cancel(page));
        await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
        await transcribing(page).waitFor();
        await check();
        expect(await box(card)).toEqual(listening);
        expect((await box(block)).height).toBe(blockWhileListening.height);
        expect(await box(cancel(page))).toEqual(recording);
        expect(await page.getByText('Auto-send', { exact: true }).isVisible()).toBe(true);
      } finally { await close(); }
    });
  }
});

describe('Quick Capture', () => {
  const panel = (page: Page) => page.locator('[data-voice-panel]');
  const text = (page: Page) => page.getByRole('textbox', { name: 'Quick capture' });
  const cancel = (page: Page) => panel(page).getByRole('button', { name: 'Cancel', exact: true });

  async function ready(page: Page) {
    await expect.poll(() => text(page).isEnabled(), { timeout: 10_000 }).toBe(true);
  }

  it('holds browser speech until recognition ends, then adds it after the typed draft', async () => {
    const { page, close } = await open({ surface: 'capture', model: BROWSER, width: 360 });
    try {
      await ready(page);
      await text(page).fill('Groceries:');
      await page.getByRole('button', { name: 'Voice capture' }).click();
      await panel(page).getByText('Listening…').waitFor();
      const cancelWhileListening = await box(cancel(page));
      await page.evaluate(() => window.voiceFixture.say(0, 'milk'));
      await page.waitForTimeout(100);
      expect(await text(page).inputValue()).toBe('Groceries:');

      await panel(page).getByRole('button', { name: 'Stop', exact: true }).click();
      await panel(page).getByRole('status').filter({ hasText: 'Transcribing…' }).waitFor({ timeout: 300 });
      expect(await box(cancel(page))).toEqual(cancelWhileListening);
      expect(await panel(page).getByRole('button', { name: 'Stop', exact: true }).isDisabled()).toBe(true);
      expect(await page.getByRole('button', { name: 'Capture', exact: true }).isDisabled()).toBe(true);
      await page.evaluate(() => window.voiceFixture.say(1, 'eggs'));
      expect(await text(page).inputValue()).toBe('Groceries:');

      await page.evaluate(() => window.voiceFixture.end());
      await expect.poll(() => text(page).inputValue()).toBe('Groceries: milk eggs');
      await panel(page).waitFor({ state: 'detached' });
      // The row fits a narrow phone: nothing past the dialog's edge.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
    } finally { await close(); }
  });

  it('keeps a canceled Parakeet transcript out of the draft, during the flush and while waiting', async () => {
    const { page, held, close } = await open({ surface: 'capture', model: PARAKEET, width: 360 });
    try {
      await ready(page);
      await text(page).fill('Note to self');
      await page.getByRole('button', { name: 'Voice capture' }).click();
      await panel(page).getByRole('button', { name: 'Stop', exact: true }).click();
      // Transcribing straight away, inside the recorder's flush.
      await panel(page).getByText('Transcribing…').waitFor({ timeout: 300 });
      const right = await box(cancel(page));
      expect(right.x + right.width).toBeLessThanOrEqual(360);
      await expect.poll(() => held.length).toBe(1);
      expect(await panel(page).getByText('Transcribing…').isVisible()).toBe(true);

      await cancel(page).click();
      await panel(page).waitFor({ state: 'detached' });
      await answer(held[0]!, 'should not appear');
      await page.waitForTimeout(300);
      expect(await text(page).inputValue()).toBe('Note to self');

      // The next one goes through, after what's typed.
      await page.getByRole('button', { name: 'Voice capture' }).click();
      await panel(page).getByRole('button', { name: 'Stop', exact: true }).click();
      await expect.poll(() => held.length).toBe(2);
      await answer(held[1]!, 'pick up the dry cleaning');
      await expect.poll(() => text(page).inputValue()).toBe('Note to self pick up the dry cleaning');
    } finally { await close(); }
  });
});
