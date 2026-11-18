/** Real Electron + real Home routes in disposable roots.
 * Default: packaged first-run Home, source development companion over loopback HTTP.
 * --source-home runs both shells from the current build before packaging.
 * The HTTP proxy trusts only the disposable Home certificate. No OS trust edits,
 * packaged certificate bypass, production Home, login job or harness is used. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Page } from 'playwright-core';
import type { Notification } from 'electron';
import Database from 'better-sqlite3';
import { AcceptanceFixture, api, assertNoAlertsWithoutSignature, bounded, eventually, needsSignedBuild } from './acceptance-fixture';
import { desktopPackageLayout } from './package-layout';
import { FIRST_START_MS } from './first-run';
import { assertLocalIsolation, assertSameNativeWindow, localPage, nativeWindowSnapshot } from './acceptance-surfaces';
import { ensureServiceStatus, serviceRequest, serviceStatus, stopService, type ServiceSession } from '../src/lib/service/client';
import { hasLoginSupervision } from '../src/lib/service/install';

const sourceHome = process.argv.includes('--source-home');
const home = new AcceptanceFixture('companion-home', { chooseHome: false, source: sourceHome });
const connected = new AcceptanceFixture('companion-worker', { chooseHome: false, source: true });
const report: Record<string, unknown> = { startedAt: new Date().toISOString(), home: home.base, connected: connected.base, sourceHome, package: home.report.package, runtimeId: home.report.runtimeId, asarSha256: home.report.asarSha256, checks: [] };
const passed = (name: string) => { (report.checks as string[]).push(name); console.info(`[companion] ${name}`); };
let proxy: http.Server | undefined;
let offline = false;
let proxyOrigin = '';
const seenCapabilities: string[] = [];
let failure: unknown;

async function companion(fixture: AcceptanceFixture) {
  const page = await localPage(fixture.app!, 'companion');
  await page.locator('#heading').waitFor();
  return page;
}
/** The page's first look at this computer runs a setup helper on the app's own
 * Node, with a 45 s limit (desktop/setup-client.ts), and then asks the service.
 * On CI's Intel Mac a click's 30 s ran out first. Wait for the choice itself and
 * record how long the page took. */
const FIRST_CHECK_MS = 120_000;
async function firstRunChoice(page: Page) {
  const started = Date.now();
  await page.locator('#welcome').waitFor({ timeout: FIRST_CHECK_MS });
  await page.waitForFunction(() => !(document.getElementById('create-home') as HTMLButtonElement).disabled, undefined, { timeout: FIRST_CHECK_MS });
  report.firstRunChoiceMs = Date.now() - started;
  return page.locator('#create-home');
}
/** What a companion page shows and the state it loaded, for a failed run. */
async function companionDiagnostics(fixture: AcceptanceFixture) {
  if (!fixture.app) return undefined;
  const page = await bounded(localPage(fixture.app, 'companion'), 'companion page for diagnostics', 5_000).catch(() => undefined);
  if (!page) return undefined;
  // One expression in the page's own scope: it keeps what it loaded in a
  // top-level `let state`, and a compiled function would carry tsx helpers.
  return bounded(page.evaluate(`(() => {
    const text = id => document.getElementById(id)?.textContent?.trim() || undefined;
    const loaded = typeof state === 'undefined' || !state ? null : state;
    return {
      sections: [...document.querySelectorAll('section[id]')].filter(section => !section.hidden).map(section => section.id),
      error: text('error'), progress: document.getElementById('progress')?.hidden ? undefined : text('progress'),
      createHomeDisabled: document.getElementById('create-home')?.disabled,
      state: loaded && { role: loaded.role, homeSelected: loaded.homeSelected, reason: loaded.reason, connecting: loaded.connecting, connectionError: loaded.connectionError, service: !!loaded.service },
    };
  })()`), 'companion page diagnostics', 5_000).catch(error => ({ unreadable: String(error) }));
}
/** Where a viewer window was and whether it was frozen for a close check
 * (the app logs why it asked before closing as "Asked before closing"). */
async function viewerDiagnostics(fixture: AcceptanceFixture) {
  const page = fixture.page;
  if (!page || page.isClosed()) return undefined;
  return bounded(page.evaluate(() => ({ url: location.href, readyState: document.readyState, inert: document.body.inert,
    hydrated: !!document.documentElement.dataset.riDesktop, dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].map(dialog => dialog.getAttribute('aria-label') ?? dialog.textContent?.trim().slice(0, 80)) })),
  'viewer page diagnostics', 5_000).catch(error => ({ unreadable: String(error) }));
}
async function openDesktopSettings(fixture: AcceptanceFixture) {
  await fixture.app!.evaluate(({ Menu, BrowserWindow }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('ri-desktop-preferences');
    if (!item?.enabled) throw new Error('The local companion menu is unavailable');
    item.click(item, BrowserWindow.getAllWindows()[0], {} as never);
  });
  const controls = fixture.page!.getByRole('region', { name: 'Agents on this computer', exact: true });
  await controls.waitFor();
  return controls;
}
async function mainPage(fixture: AcceptanceFixture, origin?: string) {
  const page = fixture.page!;
  await page.waitForURL(url => origin ? url.origin === origin : url.protocol === 'https:', { timeout: FIRST_START_MS });
  await page.waitForFunction(() => window.riDesktop?.platform);
  fixture.origin = new URL(page.url()).origin;
  return page;
}
async function proxyToHome(session: ServiceSession) {
  const target = new URL(session.origin);
  proxy = http.createServer((request, response) => {
    if (request.headers['x-ri-desktop-client']) seenCapabilities.push(String(request.headers['x-ri-desktop-client']));
    if (offline) { response.writeHead(503); response.end('Fixture network unavailable'); return; }
    const headers = { ...request.headers, host: target.host };
    if (headers.origin === proxyOrigin) headers.origin = session.origin;
    if (headers.referer?.startsWith(`${proxyOrigin}/`)) headers.referer = headers.referer.replace(proxyOrigin, session.origin);
    const upstream = https.request(new URL(request.url!, session.origin), { method: request.method, headers,
      ca: session.certificate, allowPartialTrustChain: true, agent: false }, remote => {
      const output = { ...remote.headers };
      if (output.location?.startsWith(session.origin)) output.location = output.location.replace(session.origin, proxyOrigin);
      response.writeHead(remote.statusCode!, output); remote.pipe(response);
    });
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    response.on('close', () => upstream.destroy());
    request.pipe(upstream);
  });
  await new Promise<void>((resolve, reject) => { proxy!.once('error', reject); proxy!.listen(0, '127.0.0.1', resolve); });
  proxyOrigin = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
}
interface RemoteDelivery { id: string; status: string; attempts: number; receipt: string | null }
type NotificationFixtureGlobal = typeof globalThis & { companionAlerts: Notification[]; consentQuestions: string[] };
function remoteDeliveries(deviceId: string): RemoteDelivery[] {
  const db = new Database(path.join(home.root, 'data.db'), { readonly: true, fileMustExist: true });
  try { return db.prepare('SELECT id, status, attempts, provider_message_id AS receipt FROM notification_deliveries WHERE channel_id = ? ORDER BY id').all(`desktop:device:${deviceId}`) as RemoteDelivery[]; }
  finally { db.close(); }
}
/**
 * A connected Home's page turns this computer's alerts on in place: the app
 * asks the person in a native dialog over its window, and only Allow turns
 * them on. Turning them off needs no dialog (desktop/notification-consent.ts).
 */
/** Whether this computer could show the connected Home's alerts (an unsigned Mac build can't). */
async function remoteNotificationConsent(page: Page, deviceId: string): Promise<boolean> {
  await connected.app!.evaluate(({ Notification, dialog }) => {
    const shown: Notification[] = [];
    const questions: string[] = [];
    Object.assign(globalThis, { companionAlerts: shown, consentQuestions: questions });
    Notification.isSupported = () => true;
    Notification.getHistory = async () => [];
    Notification.prototype.show = function () { shown.push(this); queueMicrotask(() => this.emit('show')); };
    // The person's answer in the native dialog. The page can neither draw nor answer it.
    const original = dialog.showMessageBox;
    dialog.showMessageBox = ((...args: unknown[]) => {
      const options = args.at(-1) as { message?: string };
      if (options.message === 'Show notifications from Ri on this computer?') {
        questions.push(options.message);
        return Promise.resolve({ response: 0, checkboxChecked: false });
      }
      return original(...args as Parameters<typeof original>);
    }) as typeof original;
  });
  const shown = () => connected.app!.evaluate(() => (globalThis as NotificationFixtureGlobal).companionAlerts.map(alert => ({ id: alert.id, title: alert.title })));
  const questions = () => connected.app!.evaluate(() => [...(globalThis as NotificationFixtureGlobal).consentQuestions]);
  await connected.navigate('/?settings=notifications');
  if (await needsSignedBuild(page)) {
    await assertNoAlertsWithoutSignature(page, { askBridge: false });
    assert.deepEqual(await questions(), [], 'An unsigned Mac build asked to show notifications it cannot show');
    assert.deepEqual(remoteDeliveries(deviceId), []);
    passed('A connected Home on an unsigned Mac build says why this computer cannot notify, and asks nothing');
    return false;
  }
  const deviceCard = page.getByRole('region', { name: 'Desktop notifications on this computer', exact: true });
  const state = deviceCard.getByRole('status');
  await state.filter({ hasText: 'Off' }).waitFor();
  const viewerIdentity = await page.evaluate(() => performance.timeOrigin);
  // The dialog opens only over a focused window, so a page in the background
  // can't raise it. A person clicking the button has focused it.
  await connected.app!.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.focus(); });
  await deviceCard.getByRole('button', { name: 'Enable desktop notifications', exact: true }).click();
  await state.filter({ hasText: 'On' }).waitFor();
  assert.deepEqual(await questions(), ['Show notifications from Ri on this computer?']);
  assert.equal(await page.evaluate(() => performance.timeOrigin), viewerIdentity, 'Turning alerts on must not reload the viewer');
  // The Desktop channel's Test, on the row for this desktop app.
  await page.locator('div.rounded-xl', { has: page.getByText('This desktop app') }).getByRole('button', { name: 'Test', exact: true }).click();
  await eventually(async () => remoteDeliveries(deviceId).length === 1 && remoteDeliveries(deviceId)[0].status === 'sent', 'remote native claim and acknowledgement');
  const first = remoteDeliveries(deviceId)[0];
  assert.equal(first.attempts, 1); assert(first.receipt);
  assert.deepEqual(await shown(), [{ id: `desktop:device:${deviceId}:${first.id}`, title: 'Ri notifications are ready' }]);
  passed('A connected Home turns alerts on in place, only with the person’s Allow in a native dialog, and its test uses the per-device outbox, real claim and acknowledgement, and native presentation');

  await deviceCard.getByRole('button', { name: 'Disable desktop notifications', exact: true }).click();
  await state.filter({ hasText: 'Off' }).waitFor();
  assert.equal((await questions()).length, 1, 'Turning alerts off asks nothing');
  // A Home-side routing change must never override this computer's consent.
  const channel = `desktop:device:${deviceId}`;
  await api(page, `/api/notifications/channels/${encodeURIComponent(channel)}`, 'PATCH', { enabled: true });
  await api(page, `/api/notifications/channels/${encodeURIComponent(channel)}/test`, 'POST', {});
  await eventually(async () => remoteDeliveries(deviceId).length === 2, 'queued alert while local consent is disabled');
  assert.equal(remoteDeliveries(deviceId)[1].status, 'pending');
  assert.equal(remoteDeliveries(deviceId)[1].attempts, 0);
  assert.equal((await shown()).length, 1);
  await assert.rejects(page.evaluate(() => window.riDesktop!.notifications!('test')), /Turn on desktop notifications/);
  await state.filter({ hasText: 'Off' }).waitFor();
  assert.equal(await page.evaluate(() => performance.timeOrigin), viewerIdentity, 'Turning alerts off must not reload the viewer');
  passed('Home channel re-enable cannot override local native notification refusal');
  return true;
}

async function consentToExecution(fixture: AcceptanceFixture) {
  await fixture.app!.evaluate(({ dialog }) => {
    const original = dialog.showMessageBox;
    dialog.showMessageBox = ((...args: unknown[]) => {
      const options = args.at(-1) as { message?: string };
      if (options.message === 'Run agents on this device?' || options.message === 'Stop execution on this device?') return Promise.resolve({ response: 1, checkboxChecked: false });
      return original(...args as Parameters<typeof original>);
    }) as typeof original;
  });
}
async function waitWorker(state: string) {
  connected.select();
  await eventually(async () => (await serviceStatus())?.worker?.state === state, `worker ${state}`, 60_000);
}

void (async () => {
  try {
    home.select();
    await home.launchRaw();
    const initial = await companion(home);
    const initialWindow = await nativeWindowSnapshot(home.app!);
    await assertLocalIsolation(home.app!, initial, 'companion');
    await initial.screenshot({ path: path.join(home.base, 'first-run.png') });
    assert.equal(fs.existsSync(path.join(home.root, 'data.db')), false);
    assert.equal(await serviceStatus(), null);
    await (await firstRunChoice(initial)).click();
    const homePage = await mainPage(home);
    assertSameNativeWindow(initialWindow, await nativeWindowSnapshot(home.app!));
    await homePage.screenshot({ path: path.join(home.base, 'home.png') });
    assert.equal(await homePage.evaluate(() => typeof window.riDesktop?.settings), 'function');
    assert.equal((await serviceStatus())?.role, 'home');
    // A packaged app keeps a new Home running with a login job, which this check
    // never installs. The app is refused one and opens the Home all the same.
    assert.equal(hasLoginSupervision(), false, 'The check installed a login job');
    await api(homePage, '/api/user-state', 'PATCH', { onboardedAt: new Date().toISOString() });
    const pair = await api<{ plaintext: string; device: { id: string } }>(homePage, '/api/devices', 'POST', { name: 'Companion fixture laptop', kind: 'computer' });
    const sharedNote = await api<{ id: string }>(homePage, '/api/notes', 'POST', { title: 'Companion acceptance', body: 'Stored only on the disposable Home.' });
    const expectedHome = await api<{ id: string }>(homePage, '/api/home');
    const session = await serviceRequest<ServiceSession>('/session');
    passed(`${sourceHome ? 'Source' : 'Packaged'} first-run requires explicit Home choice before creating the task database`);
    await home.quit();
    assert.equal((await serviceStatus())?.runId, session.runId);
    passed('Quitting Home GUI leaves the shared Home service available');
    await proxyToHome(session);

    connected.env.RI_DESKTOP_MODE = 'development';
    connected.env.RI_DESKTOP_RECOVERY_SMOKE = '1';
    if (!sourceHome && process.env.RI_DESKTOP_PACKAGE) {
      const resources = desktopPackageLayout(process.env.RI_DESKTOP_PACKAGE).resources;
      connected.env.RI_DESKTOP_RESOURCES = resources;
      connected.env.RI_DESKTOP_NODE = path.join(resources, 'node/bin/node');
    }
    connected.select();
    if (sourceHome) {
      const empty = await ensureServiceStatus({ repo: path.resolve(__dirname, '..'), node: process.execPath, env: { ...connected.env, NODE_ENV: 'production' } });
      assert.equal(empty.role, 'first-run');
      assert.equal(fs.existsSync(path.join(connected.root, 'data.db')), false);
    }
    await connected.launchRaw();
    const setup = await companion(connected);
    const connectedWindow = await nativeWindowSnapshot(connected.app!);
    await assertLocalIsolation(connected.app!, setup, 'companion');
    assert.equal(fs.existsSync(path.join(connected.root, 'data.db')), false);
    assert.equal((await serviceStatus())?.role ?? null, sourceHome ? 'first-run' : null);
    if (sourceHome) passed('Existing unchosen control service still opens first-run setup without a database');
    // A remote Home using the local generated certificate must fail ordinary
    // Node trust before releasing the browser credential or starting a worker.
    // A pasted link is checked first, which shows where it leads, and its button
    // says Continue until then. Only a link that checks out offers Connect.
    await setup.locator('#choose-connect').click();
    const link = setup.getByLabel('Ri link', { exact: true });
    await link.fill(`${session.origin}/#token=${pair.plaintext}`);
    await setup.getByRole('button', { name: 'Continue', exact: true }).click();
    await setup.getByRole('alert').filter({ hasText: /certificate.*trust/i }).waitFor();
    assert.equal(fs.existsSync(path.join(connected.root, '.config/connection.json')), false);
    passed('Remote Home pairing rejects an untrusted local TLS certificate without altering OS trust');
    await link.fill(`${proxyOrigin}/#token=${pair.plaintext}`);
    await setup.locator('#link-destination').filter({ hasText: 'Pairing link for ' }).waitFor();
    await setup.getByRole('button', { name: 'Connect', exact: true }).click();
    const page = await mainPage(connected, proxyOrigin);
    assertSameNativeWindow(connectedWindow, await nativeWindowSnapshot(connected.app!));
    assert.equal((await api<{ id: string }>(page, '/api/home')).id, expectedHome.id);
    assert.equal((await api<{ body: string }>(page, `/api/notes/${sharedNote.id}`)).body, 'Stored only on the disposable Home.');
    await page.locator('aside:visible').first().waitFor();
    await page.screenshot({ path: path.join(connected.base, 'viewer.png') });
    const bridge = await page.evaluate(() => ({ settings: typeof window.riDesktop?.settings, notifications: typeof window.riDesktop?.notifications, deviceSettings: typeof window.riDesktop?.deviceSettings,
      require: typeof (window as unknown as { require?: unknown }).require, companion: typeof (window as unknown as { riCompanion?: unknown }).riCompanion }));
    assert.deepEqual(bridge, { settings: 'undefined', notifications: 'function', deviceSettings: 'function', require: 'undefined', companion: 'undefined' });
    assert.equal((await serviceStatus())?.role, 'viewer');
    assert.equal(fs.existsSync(path.join(connected.root, '.config/worker.json')), false);
    assert.equal(fs.existsSync(path.join(connected.root, 'data.db')), false);
    assert.deepEqual(seenCapabilities, []);
    passed('First-run setup and remote Home share one native window with consent-mediated settings, no local task database and no arbitrary native bridge');

    const alertsShown = await remoteNotificationConsent(page, pair.device.id);

    // Control only the human consent dialog response. Enrollment, service,
    // worker stream, stop, persisted preference and reconnect are real.
    await consentToExecution(connected);
    const viewerBeforeSettings = { url: page.url(), timeOrigin: await page.evaluate(() => performance.timeOrigin) };
    const controls = await openDesktopSettings(connected);
    assertSameNativeWindow(connectedWindow, await nativeWindowSnapshot(connected.app!));
    assert.equal(new URL(page.url()).searchParams.get('settings'), 'this-computer');
    assert.equal(await page.evaluate(() => performance.timeOrigin), viewerBeforeSettings.timeOrigin);
    await controls.getByRole('button', { name: 'Enable local execution', exact: true }).click();
    await waitWorker('connected');
    const worker = await serviceStatus();
    await controls.getByRole('status').filter({ hasText: 'This computer can run agents' }).waitFor();
    await controls.screenshot({ path: path.join(connected.base, 'worker.png') });
    assert.equal(worker?.role, 'worker');
    const enrollment = JSON.parse(fs.readFileSync(path.join(connected.root, '.config/worker.json'), 'utf8'));
    assert.equal(enrollment.deviceId, pair.device.id);
    assert.equal(fs.existsSync(path.join(connected.root, 'data.db')), false);
    passed('Separate local consent enrolls the same device and starts one supervised worker');

    offline = true; proxy!.closeAllConnections();
    await waitWorker('disconnected');
    offline = false;
    await waitWorker('connected');
    passed('Worker survives temporary Home transport loss and reconnects');
    await connected.quit();
    assert.equal((await serviceStatus())?.runId, worker?.runId);
    assert.equal((await serviceStatus())?.worker?.pid, worker?.worker?.pid);
    passed('Quitting connected GUI leaves the same worker running');
    await connected.launchRaw();
    await mainPage(connected, proxyOrigin);
    await consentToExecution(connected);
    await connected.navigate('/?settings=this-computer');
    await connected.page!.getByRole('region', { name: 'Agents on this computer', exact: true }).waitFor();
    const reopened = await openDesktopSettings(connected);
    await reopened.getByRole('button', { name: 'Stop local execution', exact: true }).click();
    await waitWorker('stopped');
    const stopped = await serviceStatus();
    assert.equal(stopped?.worker?.enabled, false);
    await connected.quit();
    await stopService();
    const restarted = await ensureServiceStatus({ repo: stopped!.repo, node: stopped!.node!, env: { ...connected.env, NODE_ENV: 'production' } });
    assert.equal(restarted.worker?.enabled, false);
    assert.equal(restarted.worker?.state, 'stopped');
    home.select();
    assert.equal((await serviceStatus())?.runId, session.runId);
    assert.deepEqual(seenCapabilities, []);
    assert.equal(fs.existsSync(path.join(connected.root, 'data.db')), false);
    if (alertsShown) {
      // The Home's queued test from the notification step is still waiting for this computer's consent.
      assert.equal(remoteDeliveries(pair.device.id)[1].status, 'pending');
      assert.equal(remoteDeliveries(pair.device.id)[1].attempts, 0);
    }
    passed('Local stop survives controller restart without stopping Home or creating worker task data');
    report.limits = ['The connected journey uses the source Electron shell with explicit loopback development HTTP and a certificate-validating fixture proxy. Production trusted-HTTPS remote viewing still needs deployment qualification.', 'Native consent dialog answers and OS notification presentation/history/support are controlled. No OS login job, real harness, real account or production data was used.'];
  } catch (error) {
    failure = error;
    report.error = error instanceof Error ? error.stack : String(error);
    report.companionPages = { home: await companionDiagnostics(home), connected: await companionDiagnostics(connected) };
    report.viewerPages = { home: await viewerDiagnostics(home), connected: await viewerDiagnostics(connected) };
    for (const fixture of [home, connected]) await fixture.page?.screenshot({ path: path.join(fixture.base, 'failure.png'), timeout: 3000 }).catch(() => {});
  } finally {
    offline = false;
    for (const fixture of [connected, home]) {
      try { fixture.select(); await fixture.cleanup(); }
      catch (error) { failure ??= error; ((report.cleanupErrors ??= []) as string[]).push(String(error)); }
    }
    proxy?.closeAllConnections();
    if (proxy) await new Promise<void>(resolve => proxy!.close(() => resolve()));
    report.passed = !failure; report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(home.base, 'companion-report.json'), JSON.stringify(report, null, 2));
    console.info(JSON.stringify(report, null, 2));
  }
  if (failure) process.exitCode = 1;
})();
