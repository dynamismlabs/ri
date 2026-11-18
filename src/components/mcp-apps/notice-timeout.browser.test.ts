/**
 * An app view's notice clears itself, but not out from under the keyboard
 * (`useNoticeTimeout`). Removing a focused Dismiss button dropped focus to the
 * page's body, and with an app view on the page focus then stayed there: a
 * Tab toward the app in view-focus.browser.test.ts waited on it and timed out.
 */
import { it, expect } from 'vitest';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import http from 'node:http';
import { testTimeouts } from '@/test/fixtures/browser-timeouts';

it('keeps a notice while its Dismiss button has focus, and clears it as focus moves on', async () => {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useNoticeTimeout } from '@/components/mcp-apps/notice-timeout';
function Fixture() {
  const [notice, setNotice] = useState(null);
  const clear = useCallback(() => setNotice(null), []);
  const ref = useNoticeTimeout(notice, clear, 300);
  return <main>
    <button onClick={() => setNotice('Thief wrote a message for you.')}>Show</button>
    {notice && <p ref={ref} role="status">{notice}<button onClick={clear}>Dismiss</button></p>}
    <button>After</button>
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' } });
  const server = http.createServer((req, res) => {
    if (req.url === '/fixture.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
    res.setHeader('content-type', 'text/html'); res.end('<html><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: chromium.executablePath(), headless: true });
  try {
    const page = testTimeouts(await browser.newPage(), 10_000);
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
    const notice = page.getByRole('status');
    const focused = () => page.evaluate(() => document.activeElement?.textContent ?? null);
    // Left alone, it clears itself.
    await page.getByRole('button', { name: 'Show', exact: true }).click();
    await notice.waitFor();
    await notice.waitFor({ state: 'detached' });
    // With the keyboard on its Dismiss button it stays past its time, and the person keeps their place.
    await page.getByRole('button', { name: 'Show', exact: true }).click();
    await page.keyboard.press('Tab');
    expect(await focused()).toBe('Dismiss');
    await page.waitForTimeout(900);
    expect(await notice.isVisible()).toBe(true);
    expect(await focused()).toBe('Dismiss');
    // Moving on clears it, and focus is where it went.
    await page.keyboard.press('Tab');
    await notice.waitFor({ state: 'detached' });
    expect(await focused()).toBe('After');
  } finally { await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}, 30_000);
