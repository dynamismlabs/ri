import { writeDesktopHomeIntent } from '../src/lib/service/desktop-role-intent';
/** Real native failed-service recovery and advanced local association. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import electron from 'electron';
import { _electron, type ElectronApplication } from 'playwright-core';
import { waitForHome } from './first-run';
import { demoEnvironment } from './config';
import { installationEnvironment, localInstallation } from './installation';
import { ensureService, serviceStatus, stopService } from '../src/lib/service/client';
import { installedRuntime } from '../src/lib/service/runtime';
import { desktopPackageLayout } from './package-layout';
import { assertLocalIsolation, assertSameNativeWindow, localPage, nativeWindowSnapshot, viewerPage } from './acceptance-surfaces';

const repo = path.resolve(__dirname, '..');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-recovery-smoke-'));
const root = path.join(base, 'home');
const advanced = localInstallation({ root: path.join(base, 'associated'), database: path.join(base, 'separate.db'), config: path.join(base, 'settings'), work: path.join(base, 'work') });
const testHome = path.join(base, 'os-home');
fs.mkdirSync(testHome, { recursive: true });
const desktopState = path.join(base, 'desktop-state');
const env = demoEnvironment(repo, { ...process.env, HOME: testHome, XDG_CONFIG_HOME: path.join(testHome, '.config'), RI_DESKTOP_STATE_DIR: desktopState, RI_DESKTOP_ROOT: root, RI_INSTALL_ROOT: path.join(base, 'runtime'), RI_DESKTOP_NODE: process.execPath }, 'production');
const packageFile = process.env.RI_DESKTOP_PACKAGE;
const executablePath = packageFile ? desktopPackageLayout(packageFile).executable : electron as unknown as string;
const args = packageFile ? [] : [path.join(repo, 'dist/desktop/main.cjs')];
let instance: ElectronApplication | undefined;
// The packaged app first stages its bundled release: hashing and copying it
// took about 4 minutes on CI's Apple-chip Mac and 8 on its Intel one. Only then
// does the controller try the broken endpoint and say why.
const FIRST_START_MS = 15 * 60_000;
const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)} s`;
function select(environment: NodeJS.ProcessEnv) { for (const name of ['RI_DB_PATH', 'RI_CONFIG_DIR', 'RI_WORK_DIR']) delete process.env[name]; Object.assign(process.env, environment); }
async function close() {
  if (!instance) return;
  const current = instance; instance = undefined;
  await Promise.all([current.waitForEvent('close', { timeout: 30_000 }), current.evaluate(({ app }) => app.quit())]);
}
async function openRecovery() {
  await instance!.evaluate(({ Menu, BrowserWindow }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('ri-recovery');
    if (!item?.enabled) throw new Error('The service and recovery menu is unavailable');
    item.click(item, BrowserWindow.getAllWindows()[0], {} as never);
  });
  const page = await localPage(instance!, 'maintenance');
  await page.locator('#status').waitFor();
  return page;
}
async function mainSmoke() {
try {
  select(env);
  writeDesktopHomeIntent();
  fs.mkdirSync(path.join(root, '.config'), { recursive: true });
  fs.writeFileSync(path.join(root, '.config/local-service.json'), JSON.stringify({ version: 1, port: 0 }));
  const launched = Date.now();
  instance = await _electron.launch({ executablePath, args, env: { ...env, RI_DESKTOP_SMOKE: '1', RI_DESKTOP_RECOVERY_SMOKE: '1' }, timeout: 240_000 });
  await instance.firstWindow();
  const main = await viewerPage(instance);
  const initialWindow = await nativeWindowSnapshot(instance);
  const setup = await localPage(instance, 'companion');
  // The controller never gives up on a failed start (docs/always-on-spec.md
  // 6.2). The app says why while it keeps trying, and its database stays unopened.
  await setup.waitForFunction(() => document.getElementById('connection-error')?.textContent?.includes('endpoint configuration'), undefined, { timeout: FIRST_START_MS });
  console.info(`The failed first start was reported ${seconds(launched)} after launch`);
  select(env);
  const failed = await serviceStatus();
  assert.match(failed?.phase ?? '', /^(restarting|starting)$/, `A failed first start keeps trying, not ${failed?.phase}`);
  assert(failed?.restarts?.count, 'A failed first start counts its tries');
  assert.equal(fs.existsSync(path.join(root, 'data.db')), false, 'A failed first start must not open a database');
  let recovery = await openRecovery();
  recovery.on('console', message => { if (message.type() === 'error') console.error('[recovery-ui]', message.text()); });
  console.info('Recovery view loaded inside Ri');
  assertSameNativeWindow(initialWindow, await nativeWindowSnapshot(instance));
  await assertLocalIsolation(instance, recovery, 'maintenance');
  assert.match(await recovery.locator('#reason').innerText(), /endpoint configuration/);
  // Recovery from an update record is for a stopped, failed backend. A start that keeps trying needs none.
  assert.equal(await recovery.getByRole('button', { name: 'Recover service', exact: true }).isVisible(), false);
  assert.equal(await recovery.evaluate(() => typeof (window as unknown as { require?: unknown }).require), 'undefined');
  assert.equal(await recovery.evaluate(() => typeof window.riDesktop), 'undefined');
  assert.equal(main.url(), 'about:blank', 'Failed startup must not replace the viewer with privileged recovery content');
  // Read-only verification must not create a mistyped path.
  const absent = path.join(base, 'does-not-exist');
  await recovery.locator('#choose-installation > summary').click();
  await recovery.locator('#root').fill(absent);
  await recovery.getByRole('button', { name: 'Verify installation', exact: true }).click();
  await recovery.locator('#error').filter({ hasText: /ENOENT/ }).waitFor();
  assert.equal(fs.existsSync(absent), false);
  // Repair only the deliberately broken fixture. Retrying from the recovery
  // view asks the controller for its next try now, instead of at its schedule.
  fs.unlinkSync(path.join(root, '.config/local-service.json'));
  const repaired = Date.now();
  await recovery.getByRole('button', { name: 'Connect or retry startup', exact: true }).click();
  await waitForHome(main, FIRST_START_MS);
  console.info(`Ri opened ${seconds(repaired)} after the fix`);
  assertSameNativeWindow(initialWindow, await nativeWindowSnapshot(instance));
  const running = await serviceStatus();
  assert.equal(running?.phase, 'running');
  assert.equal(running?.runId, failed?.runId, 'The same controller kept trying until it started');
  assert(fs.existsSync(path.join(root, 'data.db')), 'The first successful start opens the database');
  for (const dir of [advanced.root, advanced.config, advanced.work]) fs.mkdirSync(dir, { recursive: true });
  const database = new Database(path.join(root, 'data.db'), { readonly: true });
  try { await database.backup(advanced.database); } finally { database.close(); }
  const associationEnv = demoEnvironment(repo, { ...env, ...installationEnvironment(advanced) }, 'production');
  select(associationEnv);
  // Deliberately start an existing source/CLI owner. Connecting a packaged
  // viewer must not select the bundled runtime for its future restarts.
  await ensureService({ repo, node: process.execPath, env: { ...associationEnv, RI_RUNTIME_REPO: repo } });
  assert.equal(installedRuntime(), null);
  select(env);
  const viewerBeforeRecovery = { url: main.url(), timeOrigin: await main.evaluate(() => performance.timeOrigin) };
  recovery = await openRecovery();
  assertSameNativeWindow(initialWindow, await nativeWindowSnapshot(instance));
  assert.equal(main.url(), viewerBeforeRecovery.url);
  assert.equal(await main.evaluate(() => performance.timeOrigin), viewerBeforeRecovery.timeOrigin);
  await recovery.locator('#choose-installation > summary').click();
  await recovery.getByText('Separate database, configuration or work folders', { exact: true }).click();
  for (const [key, value] of Object.entries(advanced)) await recovery.locator(`#${key}`).fill(value);
  await recovery.getByRole('button', { name: 'Verify installation', exact: true }).click();
  await recovery.getByRole('button', { name: 'Use verified installation', exact: true }).waitFor({ state: 'visible' });
  await recovery.waitForFunction(() => !(document.getElementById('use') as HTMLButtonElement).disabled);
  assert.match(await recovery.locator('#inspection').innerText(), /Ready to connect/);
  await recovery.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await recovery.getByText('Service running', { exact: true }).waitFor();
  await recovery.screenshot({ path: path.join(base, 'recovery.png'), fullPage: true });
  let savedSelectionVerified = false;
  {
    await instance.evaluate(({ app, dialog }) => {
      // Playwright owns the replacement launch, so it can track and clean up
      // both processes. Exercise the real selection/save/quit path first.
      app.relaunch = () => {};
      const original = dialog.showMessageBox;
      dialog.showMessageBox = ((...parameters: unknown[]) => {
        const options = parameters.at(-1) as { message?: string };
        if (options.message === 'Use this local installation?') return Promise.resolve({ response: 1, checkboxChecked: false });
        return original(...parameters as Parameters<typeof original>);
      }) as typeof original;
    });
    await Promise.all([instance.waitForEvent('close', { timeout: 30_000 }), recovery.getByRole('button', { name: 'Use verified installation', exact: true }).click()]);
    instance = undefined;
    const saved = JSON.parse(fs.readFileSync(path.join(desktopState, packageFile ? 'desktop-installation.json' : 'installation.json'), 'utf8'));
    assert.deepEqual(saved.identity, advanced);
    savedSelectionVerified = true;
  }
  assert.equal((await serviceStatus())?.runId, running?.runId, 'Quitting recovery stopped the shared service');
  instance = await _electron.launch({ executablePath, args: [...args, '--ri-use-saved-installation'],
    env: { ...env, RI_DESKTOP_SMOKE: '1' }, timeout: 240_000 });
  await instance.firstWindow();
  const associatedPage = await viewerPage(instance);
  await waitForHome(associatedPage);
  select(associationEnv);
  const associated = await serviceStatus();
  assert.deepEqual(associated?.identity, advanced);
  assert.equal(associated?.repo, repo);
  assert.equal(installedRuntime(), null, 'Attaching a viewer silently selected a different runtime');
  assert.equal(fs.existsSync(path.join(advanced.root, 'data.db')), false, 'Desktop created an unintended second database');
  assert.equal(await associatedPage.evaluate(async () => (await fetch('/api/user-state')).status), 200);
  await close();
  assert.equal((await serviceStatus())?.runId, associated?.runId);
  console.info(JSON.stringify({ passed: true, failedStartRetried: true, advancedIdentity: advanced, savedSelectionVerified, guiQuitPreservesService: true, artifacts: base }, null, 2));
} finally {
  await close().catch(() => {});
  for (const environment of [env, demoEnvironment(repo, { ...env, ...installationEnvironment(advanced) }, 'production')]) {
    select(environment); await stopService().catch(() => {});
  }
}
}
void mainSmoke().catch(error => { console.error(error); process.exitCode = 1; });
