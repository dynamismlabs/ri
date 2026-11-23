/** Exercise API skew through the actual Electron renderer and durable draft UI.
 * RI_DESKTOP_PACKAGE=... pnpm exec tsx desktop/version-smoke.ts */
import assert from 'node:assert/strict';
import path from 'node:path';
import type { Request, WebSocketRoute } from 'playwright-core';
import { acceptance, api, bounded, eventually, hydrated, type AcceptanceFixture } from './acceptance-fixture';
import { API_PROTOCOL, apiCompatibilityIssue } from '../src/lib/releases/api-contract';
import { noteTitleField } from './renderer-locators';

async function openCapture(fixture: AcceptanceFixture) {
  await bounded(fixture.app!.evaluate(({ Menu, BrowserWindow }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('ri-quick-capture');
    if (!item?.enabled) throw new Error('Native Quick Capture is unavailable');
    item.click(item, BrowserWindow.getAllWindows()[0], {} as never);
  }), 'open native capture');
  const capture = fixture.page!.getByRole('dialog', { name: 'Quick Capture', exact: true });
  await capture.waitFor();
  await capture.locator('textarea').waitFor();
  return capture;
}

void acceptance('version-smoke', async fixture => {
  const page = await fixture.launch();
  const note = await api<{ id: string }>(page, '/api/notes', 'POST', { title: 'Before Home update', body: 'Saved original body.' });
  // The Home is replaced under this view by one that speaks only a newer API. Its WebSocket drops, a
  // reconnect is refused, and the view saves over HTTP in the meantime, where the new Home answers 426.
  // The view's own reload brings the newer client, and the real Home serves it again.
  const newer = API_PROTOCOL + 1;
  const issue = apiCompatibilityIssue(String(API_PROTOCOL), [newer]);
  assert.equal(issue?.update, 'client');
  let homeUpdated = false;
  const sockets = new Set<WebSocketRoute>();
  // What the stand-in Home saw and decided, by time, for a failure report.
  const traceStart = Date.now();
  const trace: string[] = [];
  const mark = (line: string) => { if (trace.length < 200) trace.push(`${Date.now() - traceStart}ms ${line}`); };
  page.on('framenavigated', frame => mark(`framenavigated ${frame === page.mainFrame() ? 'main' : 'child'} ${frame.url()}`));
  fixture.report.trace = trace;
  // Once the Home is replaced, everything the old page sends is marked, and the newer Home refuses
  // exactly that: its requests carry a header and its sockets a query parameter. The new page
  // marks nothing. A real newer Home tells them apart by the API protocol a client sends, and both
  // pages here are the same build, so it goes by document instead. Going by navigation let old
  // saves through twice: the old page saves again as the reload hides it (desktop-chrome.tsx, on
  // visibilitychange), after `framenavigated` for the new document, and the Refresh itself makes
  // a same-document navigation first, which also fires `framenavigated`, so its WebSocket was
  // let through with the reload still to come.
  const OLD_CLIENT_HEADER = 'x-acceptance-old-client';
  const OLD_CLIENT_PARAM = 'acceptance-old-client';
  const UNLOADING_REFUSAL = '[acceptance] The unloading old client refused its own note save';
  // Console messages from a document being torn down rarely reach Playwright,
  // so the old page also counts its refusals where the new page can read them.
  const UNLOADING_REFUSALS_KEY = 'acceptance:unloading-refusals';
  let refusedWhileUnloading = 0;
  const fromOldClient = (request: Request) => request.headers()[OLD_CLIENT_HEADER] === '1';
  const oldSocket = (url: string) => new URL(url).searchParams.get(OLD_CLIENT_PARAM) === '1';
  // Routing applies to documents loaded after it, so it goes in before the note opens.
  await page.routeWebSocket(url => url.pathname === '/api/trpc/ws', ws => {
    const refused = homeUpdated && oldSocket(ws.url());
    mark(`websocket ${refused ? 'refused' : 'connected'} ${ws.url()}`);
    if (refused) { void ws.close({ code: 1012, reason: 'Ri was updated' }); return; }
    sockets.add(ws);
    ws.connectToServer();
  });
  const isNoteSave = (request: Request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/trpc/notes.update';
  let rejected = 0;
  await page.route(url => url.pathname === '/api/trpc/notes.update', async route => {
    if (homeUpdated) mark(`notes.update ${fromOldClient(route.request()) ? 'old client' : 'no header'} ${route.request().method()}`);
    if (homeUpdated && fromOldClient(route.request()) && isNoteSave(route.request())) {
      rejected++;
      await route.fulfill({ status: 426, contentType: 'application/json', body: JSON.stringify(issue) });
    } else await route.continue();
  });
  await page.route(url => url.pathname === '/api/version', async route => {
    if (homeUpdated && fromOldClient(route.request())) await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ release: { build: 'acceptance-api-next' }, apiProtocols: [newer] }) });
    else await route.continue();
  });
  await fixture.navigate(`/note/${note.id}`);
  const title = noteTitleField(page);
  await title.waitFor();
  const composer = page.locator('[contenteditable="true"][aria-label]').first();
  await composer.waitFor();
  // Tiptap focuses the body after mount. Do not race that deferred autofocus
  // while Playwright is inserting into the separate title textarea.
  await page.waitForFunction(() => document.activeElement?.classList.contains('rich-editor-body'));
  const retainedTitle = 'An edit retained across an incompatible Home update';
  assert(sockets.size > 0, 'The note view opened no Home WebSocket to drop');
  // From here on this page is the old client. Ri's API client calls the global fetch for each
  // request, and tRPC's WebSocket client the global WebSocket for each connection, so wrapping
  // both marks everything, the saves it sends while unloading included.
  //
  // Routing can't refuse what the old page sends while it unloads. Its save on visibilitychange
  // (desktop-chrome.tsx) comes after the new document has committed, and page.route never sees
  // it: no trace line, in passing and failing runs alike. Usually the navigation cancels it, but
  // on the macOS runners it sometimes reached the real Home, which saved the edit, and the old
  // page then discarded the retained draft as saved. A real newer Home refuses by protocol on the
  // server, so the old page stands in for it here: once it is unloading, its note saves get the
  // same 426 without leaving the page.
  page.on('console', message => { if (message.text() === UNLOADING_REFUSAL) { refusedWhileUnloading++; mark('notes.update old client refused in the unloading page'); } });
  await page.evaluate(({ header, param, refusal, body, countKey }) => {
    let unloading = false;
    window.addEventListener('pagehide', () => { unloading = true; }, { capture: true });
    const send = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set(header, '1');
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if ((unloading || document.visibilityState === 'hidden') && method === 'POST' && url.pathname === '/api/trpc/notes.update') {
        try { localStorage.setItem(countKey, String(Number(localStorage.getItem(countKey) ?? 0) + 1)); } catch { /* The refusal still stands. */ }
        console.info(refusal);
        return Promise.resolve(new Response(body, { status: 426, headers: { 'content-type': 'application/json' } }));
      }
      return send(input, { ...init, headers });
    };
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        const marked = new URL(url, window.location.href);
        marked.searchParams.set(param, '1');
        super(marked, protocols);
      }
    };
  }, { header: OLD_CLIENT_HEADER, param: OLD_CLIENT_PARAM, refusal: UNLOADING_REFUSAL, body: JSON.stringify(issue), countKey: UNLOADING_REFUSALS_KEY });
  homeUpdated = true;
  mark('home updated');
  for (const socket of sockets) await socket.close({ code: 1012, reason: 'Ri was updated' });
  sockets.clear();
  await title.fill(retainedTitle);
  assert.equal(await title.inputValue(), retainedTitle, 'Initial title input must land in the title, not a mounting editor');
  await composer.fill('Chat draft retained through the Home update.');
  let capture = await openCapture(fixture);
  await capture.locator('textarea').fill('Capture draft retained through the Home update.');
  await capture.getByText('Draft saved on this device.', { exact: true }).waitFor();
  await capture.getByRole('button', { name: 'Close', exact: true }).click();
  await capture.waitFor({ state: 'hidden' });
  // The notice that this view needs a newer Ri. Its Refresh keeps the drafts.
  const reload = page.getByRole('status').getByRole('button', { name: 'Refresh', exact: true });
  await reload.waitFor();
  await eventually(async () => rejected > 0, 'old API mutation rejected');
  const draftKeys = await page.evaluate(() => Object.keys(localStorage).filter(key => /^ri:(?:document-draft:v1:|chat-draft:|capture-draft:)/.test(key)));
  for (const prefix of ['ri:document-draft:v1:', 'ri:chat-draft:', 'ri:capture-draft:']) assert(draftKeys.some(key => key.startsWith(prefix)), `Missing durable ${prefix} draft`);
  const before = await page.evaluate(() => performance.timeOrigin);
  // A previous successful write is not proof that newer draft bytes can still
  // be persisted. Force the actual browser storage method to fail on retention.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreAcceptanceStorage: () => void }).restoreAcceptanceStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('ri:document-draft:')) throw new DOMException('Acceptance storage full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await reload.click();
  await page.getByRole('status').filter({ hasText: 'Acceptance storage full' }).waitFor();
  assert.equal(await page.evaluate(() => performance.timeOrigin), before);
  try { await eventually(async () => (await title.inputValue()) === retainedTitle, 'pending document title remains visible after rejected save', 5_000); }
  catch (error) {
    fixture.report.pendingDocument = await page.evaluate(id => ({
      title: document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note title"]')?.value,
      draft: localStorage.getItem(`ri:document-draft:v1:notes:${id}`),
    }), note.id);
    throw error;
  }
  assert.equal(await page.evaluate(() => document.body.inert), false);
  fixture.check('Unsupported mutations keep document/chat/capture drafts, and storage failure prevents reload');

  await page.evaluate(() => (window as unknown as { restoreAcceptanceStorage: () => void }).restoreAcceptanceStorage());
  // The old page's saves stay refused through the reload. The person explicitly
  // chooses to carry durable patches into the new view rather than lose them.
  await page.evaluate(() => {
    const events: Array<{ type: string; value: string | boolean }> = [];
    (window as unknown as { versionReloadEvents: typeof events }).versionReloadEvents = events;
    window.addEventListener('beforeunload', event => { events.push({ type: 'beforeunload-prevented', value: event.defaultPrevented }); });
    let last = '';
    new MutationObserver(() => {
      const message = [...document.querySelectorAll('[role="status"]')].map(element => element.textContent).join(' | ');
      if (message !== last && events.length < 100) { last = message; events.push({ type: 'status', value: message }); }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await fixture.app!.evaluate(({ BrowserWindow, dialog }) => {
    const state = { prevented: 0, prepareClose: 0, navigations: [] as Array<{ event: string; path: string }>, dialogs: [] as string[], loadErrors: [] as string[] };
    (globalThis as unknown as { versionReloadNative: typeof state }).versionReloadNative = state;
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    contents.on('will-prevent-unload', () => { state.prevented++; });
    contents.on('will-navigate', (_event, url) => { state.navigations.push({ event: 'will-navigate', path: new URL(url).pathname }); });
    contents.on('did-start-navigation', (_event, url, inPlace, mainFrame) => { if (mainFrame) state.navigations.push({ event: inPlace ? 'start-in-place' : 'start', path: new URL(url).pathname }); });
    contents.on('did-fail-load', (_event, code, description) => { state.loadErrors.push(`${code}: ${description}`); });
    const send = contents.send.bind(contents);
    contents.send = (channel, ...args) => { if (channel === 'desktop:prepare-close') state.prepareClose++; send(channel, ...args); };
    const show = dialog.showMessageBox.bind(dialog);
    dialog.showMessageBox = ((...args: unknown[]) => {
      state.dialogs.push((args.at(-1) as { message?: string }).message ?? '');
      return show(...args as Parameters<typeof show>);
    }) as typeof show;
  });
  const ordinarySave = page.waitForResponse(response => isNoteSave(response.request()) && response.status() === 426);
  await page.evaluate(() => {
    window.addEventListener('beforeunload', event => {
      (window as unknown as { ordinaryReloadPrevented: boolean }).ordinaryReloadPrevented = event.defaultPrevented;
    }, { once: true });
    window.location.reload();
  });
  mark('ordinary reload asked');
  await Promise.all([page.waitForFunction(() => (window as unknown as { ordinaryReloadPrevented?: boolean }).ordinaryReloadPrevented === true), ordinarySave]);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  assert.equal(await page.evaluate(() => performance.timeOrigin), before);
  fixture.check('Ordinary renderer reload remains blocked while unsupported edits are pending');
  // How long each part of the reload took, so a slow one says which part.
  const timings: Record<string, number> = {};
  const started = Date.now();
  mark('version reload clicked');
  await reload.click();
  timings.clickedMs = Date.now() - started;
  try { await page.waitForFunction(previous => performance.timeOrigin !== previous, before); }
  finally {
    timings.newDocumentMs = Date.now() - started;
    fixture.report.versionReload = {
      timings,
      refusedOldSaves: rejected,
      refusedWhileUnloading: {
        seenInConsole: refusedWhileUnloading,
        counted: await page.evaluate(key => Number(localStorage.getItem(key) ?? 0), UNLOADING_REFUSALS_KEY).catch(() => undefined),
      },
      renderer: await page.evaluate(() => (window as unknown as { versionReloadEvents?: unknown }).versionReloadEvents).catch(() => undefined),
      native: await fixture.app!.evaluate(() => (globalThis as unknown as { versionReloadNative?: unknown }).versionReloadNative).catch(() => undefined),
    };
  }
  // The new document fetches every script again (routing turns off the HTTP
  // cache), so give it the time a first launch gets to attach its handlers.
  await hydrated(page);
  timings.hydratedMs = Date.now() - started;
  await title.waitFor();
  timings.titleMs = Date.now() - started;
  // The newer Home refused every save the old page sent, so the edit is only in the retained draft.
  assert.equal((await api<{ title: string }>(page, `/api/notes/${note.id}`)).title, 'Before Home update');
  await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
  await eventually(async () => (await api<{ title: string }>(page, `/api/notes/${note.id}`)).title === retainedTitle, 'explicit document draft recovery');
  await eventually(async () => (await composer.innerText()).includes('Chat draft retained through the Home update.'), 'chat draft recovery');
  capture = await openCapture(fixture);
  await capture.getByRole('button', { name: 'Restore capture', exact: true }).click();
  await eventually(async () => (await capture.locator('textarea').inputValue()) === 'Capture draft retained through the Home update.', 'explicit capture draft recovery');
  fixture.check('Explicit version reload crosses native unload protection and restores all three draft kinds');
  await page.screenshot({ path: path.join(fixture.base, 'retained-drafts.png') });
  // Leave no unsent fixture input for the normal shutdown guard.
  await capture.getByRole('button', { name: 'Discard capture', exact: true }).click();
  await capture.getByRole('button', { name: 'Close', exact: true }).click();
  await capture.waitFor({ state: 'hidden' });
  await composer.fill('');
  fixture.report.exclusions = ['Simulates the Home API transition inside a real renderer. Signed N/N-1 installer qualification is separate.'];
}, { source: process.argv.includes('--source') }).catch(error => { console.error(error); process.exitCode = 1; });
