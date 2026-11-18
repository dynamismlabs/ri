import { writeDesktopHomeIntent } from '../src/lib/service/desktop-role-intent';
/** Shared isolated-home fixture for packaged desktop acceptance checks.
 * No builds, OS login jobs, real accounts, tunnels or external providers. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import electron from 'electron';
import { _electron, type ElectronApplication, type Locator, type Page } from 'playwright-core';
import { demoEnvironment } from './config';
import { desktopPackageLayout } from './package-layout';
import { serviceStatus, stopService } from '../src/lib/service/client';
import { HOTKEYS, type Hotkey } from '../src/constants/commands';
import { desktopNeedsSignedBuild, type DesktopNotificationStatus } from '../src/lib/notifications/desktop-contract';
import { relayDesktopOutput, viewerPage } from './acceptance-surfaces';
import { FIRST_START_MS } from './first-run';
import { CAPTURE_DRAFT_PREFIX } from '../src/lib/client/capture-storage';
import { servicePaths } from '../src/lib/service/paths';
import { redactServiceLine } from '../src/lib/service/logging';
import { perfLogPaths } from '../src/lib/perf/recorder';
import { PAIRING_TOKEN_FRAGMENT_KEY } from '../src/constants/app';

/** How long a page may take to attach its own handlers after it shows. */
export const HYDRATION_MS = 60_000;

/** Waits for the layout's desktop effect to mark the page (data-ri-desktop),
 * which shows React has attached the page's own handlers. The sidebar is
 * server-rendered, so a slow runner shows a page, a reloaded one included,
 * well before a click or a key press there does anything. */
export async function hydrated(page: Page, timeout = HYDRATION_MS) {
  await page.waitForFunction(platform => document.documentElement.dataset.riDesktop === platform, process.platform, { timeout });
}

export async function bounded<T>(promise: Promise<T>, description: string, timeout = 30_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out: ${description}`)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

export async function eventually(check: () => Promise<boolean>, description: string, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await bounded(check(), description, Math.max(1, deadline - Date.now()))) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${description}`);
}

export async function hotkey(page: Page, name: keyof typeof HOTKEYS) {
  const key: Hotkey = HOTKEYS[name];
  await page.keyboard.press([key.meta && (process.platform === 'darwin' ? 'Meta' : 'Control'), key.shift && 'Shift', key.key].filter(Boolean).join('+'));
}

/** Press a shortcut until what it opens shows. A press that arrives before the
 * page has attached its key listener does nothing, and a slow runner shows the
 * server-rendered page well before that. The press repeats only while nothing
 * shows, so a toggle never closes what it opened. Extra presses are reported. */
export async function openWithHotkey(page: Page, name: keyof typeof HOTKEYS, opened: Locator, report: Record<string, unknown>, timeout = 60_000) {
  const started = Date.now();
  for (let presses = 1; ; presses++) {
    await hotkey(page, name);
    const shown = await opened.waitFor({ timeout: 5_000 }).then(() => true, async error => {
      if (await opened.isVisible()) return true;
      if (Date.now() - started >= timeout) throw error;
      return false;
    });
    if (!shown) continue;
    if (presses > 1) ((report.hotkeyRetries ??= []) as unknown[]).push({ name, presses, ms: Date.now() - started });
    return;
  }
}

/** Whether macOS would turn this build's alerts away. It shows them only from an app with an Apple-issued
 * signature, and CI and local packages have none, so Ri says so and won't turn them on (the same rule the
 * Settings page uses). A smoke checks that refusal there and leaves delivery to a build that can notify. */
export async function needsSignedBuild(page: Page): Promise<boolean> {
  const status = await bounded(page.evaluate(() => window.riDesktop!.notifications!('status')), 'desktop notification status', 15_000) as DesktopNotificationStatus;
  return desktopNeedsSignedBuild(process.platform, status);
}

/** Notifications settings on a build macOS won't let notify: the card says why and offers no way to turn
 * them on. A local viewer's bridge refuses if asked anyway. A connected Home's would ask the person first. */
export async function assertNoAlertsWithoutSignature(page: Page, options: { askBridge: boolean }) {
  const card = page.getByRole('region', { name: 'Desktop notifications on this computer', exact: true });
  await card.getByRole('status').filter({ hasText: 'Not in this build' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Enable desktop notifications', exact: true }).count(), 0, 'An unsigned Mac build offered to turn on notifications');
  if (options.askBridge) {
    const refusal = await page.evaluate(async () => {
      try { await window.riDesktop!.notifications!('enable'); return 'turned on'; }
      catch (error) { return error instanceof Error ? error.message : String(error); }
    });
    assert.match(refusal, /unavailable/, 'An unsigned Mac build turned on notifications');
  }
  const status = await bounded(page.evaluate(() => window.riDesktop!.notifications!('status')), 'desktop notification status', 15_000) as DesktopNotificationStatus;
  assert.equal(status.enabled, false, 'An unsigned Mac build reports notifications on');
}

export async function api<T>(page: Page, route: string, method = 'GET', body?: unknown): Promise<T> {
  return bounded(page.evaluate(async ({ route, method, body }) => {
    const response = await fetch(route, {
      method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${await response.text()}`);
    return response.json();
  }, { route, method, body }), `${method} ${route} renderer request`, 20_000);
}

/** Navigate through a real renderer link and Electron's save guard. */
export async function nativeNavigate(page: Page, target: string, report: Record<string, unknown> = {}) {
  await hydrated(page);
  assert.equal(new URL(target).origin, new URL(page.url()).origin, 'Acceptance navigation must stay on the fixture origin');
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.waitForFunction(() => !document.body.inert);
    // CDP Page.navigate can abort/stopLoading the guard's replacement loadURL.
    await bounded(page.evaluate(target => {
      const link = document.createElement('a');
      link.href = target; document.body.append(link); link.click(); link.remove();
    }, target), 'renderer navigation dispatch', 10_000);
    try { await page.waitForURL(target, { timeout: 20_000 }); break; }
    catch (error) {
      if (attempt === 1) throw error;
      const retries = (report.navigationRetries ??= []) as unknown[];
      retries.push(await bounded(page.evaluate(() => ({ url: location.href, bodyInert: document.body.inert,
        readyState: document.readyState, desktop: document.documentElement.dataset.riDesktop,
        draftKeys: Object.keys(localStorage).filter(key => key.startsWith('ri:document-draft:v1:')) })), 'navigation diagnostics', 5_000));
    }
  }
  await page.waitForLoadState('domcontentloaded');
  await hydrated(page);
}

/** Invoke native Reload, allowing one recorded retry if pending saves veto it. */
export async function nativeReload(app: ElectronApplication, page: Page, report: Record<string, unknown> = {}) {
  await hydrated(page);
  const previous = await bounded(page.evaluate(() => performance.timeOrigin), 'reload document identity', 5_000);
  for (let attempt = 0; attempt < 2; attempt++) {
    await bounded(app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.reload()), 'native reload dispatch', 10_000);
    try { await page.waitForFunction(prior => performance.timeOrigin !== prior, previous, { timeout: 10_000 }); break; }
    catch (error) {
      if (attempt === 1) throw error;
      const retries = (report.reloadRetries ??= []) as unknown[];
      retries.push(await bounded(page.evaluate(() => ({ url: location.href, bodyInert: document.body.inert,
        draftKeys: Object.keys(localStorage).filter(key => key.startsWith('ri:document-draft:v1:')) })), 'reload diagnostics', 5_000));
    }
  }
  await page.waitForLoadState('domcontentloaded');
  await hydrated(page);
}

/** CI stages the packaged release once (desktop/stage-acceptance-release.ts)
 * and every Home here finds it in that shared store, as a later Home on one
 * computer does. Otherwise each fixture installs into its own folder. */
function acceptanceInstallRoot(base: string) {
  return process.env.RI_ACCEPTANCE_INSTALL_ROOT || path.join(base, 'runtime');
}

export class AcceptanceFixture {
  readonly base: string;
  readonly root: string;
  readonly env: Record<string, string>;
  readonly executable: string;
  readonly source: boolean;
  readonly report: Record<string, unknown>;
  app?: ElectronApplication;
  page?: Page;
  origin?: string;
  /** What the viewer's pages threw or logged as errors, latest last, for a
   * failure report. A page that never finishes starting usually says why. */
  readonly rendererErrors: string[] = [];

  constructor(name: string, options: { chooseHome?: boolean; source?: boolean; development?: boolean } = {}) {
    this.source = options.source === true;
    assert(!options.development || this.source, 'Development acceptance requires a source viewer');
    const packaged = process.env.RI_DESKTOP_PACKAGE;
    assert(packaged || this.source, 'Set RI_DESKTOP_PACKAGE to an already built package directory (.app on macOS, linux-unpacked on Linux).');
    const layout = packaged ? desktopPackageLayout(packaged) : undefined;
    this.executable = this.source ? electron as unknown as string : layout!.executable;
    assert(fs.existsSync(this.executable), `No packaged executable at ${this.executable}`);
    this.base = fs.mkdtempSync(path.join(os.tmpdir(), `ri-${name}-`));
    this.root = path.join(this.base, 'home');
    const home = path.join(this.base, 'os-home');
    fs.mkdirSync(home);
    const inherited = { ...process.env };
    // Keep test controls out of child application state. A packaged app has no
    // access to the contributor's dotfiles or harnesses through HOME/PATH.
    for (const key of Object.keys(inherited)) {
      if (/^(?:RI_|OPENAI_|ANTHROPIC_|GROQ_|BEAMD_|CLAUDE_|CODEX_|CURSOR_|OPENCODE_)/.test(key)) delete inherited[key];
    }
    this.env = Object.fromEntries(Object.entries(demoEnvironment(path.resolve(__dirname, '..'), {
      ...inherited, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local/share'),
      ...(process.platform === 'win32' ? { USERPROFILE: home, APPDATA: path.join(home, 'AppData/Roaming'), LOCALAPPDATA: path.join(home, 'AppData/Local') } : {}),
      PATH: process.platform === 'win32' ? `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0` : '/usr/bin:/bin:/usr/sbin:/sbin',
      RI_DESKTOP_STATE_DIR: path.join(this.base, 'desktop-state'), RI_DESKTOP_ROOT: this.root,
      RI_INSTALL_ROOT: acceptanceInstallRoot(this.base), RI_DESKTOP_SMOKE: '1',
    }, options.development ? 'development' : 'production')).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    // Empty values prevent Next from filling provider secrets back from a
    // source checkout's .env.local during isolated acceptance.
    for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'CODEX_API_KEY', 'BEAMD_API_KEY']) this.env[key] = '';
    if (options.development) {
      // These are functional acceptance checks, not typography checks. Keep
      // Next's development compiler independent of the Google Fonts CDN.
      // Packaged acceptance still uses the real font embedded by its build.
      const fonts = path.join(this.base, 'font-responses.cjs');
      fs.writeFileSync(fonts, `module.exports = ${JSON.stringify({
        'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap':
          '@font-face { font-family: "Inter"; src: local("Arial"); font-style: normal; font-weight: 100 900; font-display: swap; }',
      })};\n`);
      this.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = fonts;
    }
    if (this.source) this.env.RI_DESKTOP_NODE = process.execPath;
    const manifest = layout && !this.source ? JSON.parse(fs.readFileSync(path.join(layout.resources, 'runtime-manifest.json'), 'utf8')) : undefined;
    this.report = {
      name, artifacts: this.base, platform: process.platform, startedAt: new Date().toISOString(),
      package: this.source ? 'source Electron and runtime' : path.resolve(packaged!), runtimeId: manifest?.id,
      asarSha256: layout && !this.source ? createHash('sha256').update(fs.readFileSync(path.join(layout.resources, 'app.asar'))).digest('hex') : undefined,
      checks: [],
    };
    this.select();
    if (options.chooseHome !== false) writeDesktopHomeIntent();
  }

  select() {
    for (const key of ['RI_ROOT', 'RI_DB_PATH', 'RI_CONFIG_DIR', 'RI_WORK_DIR', 'RI_INSTALL_ROOT']) delete process.env[key];
    Object.assign(process.env, this.env);
  }

  async launchRaw(args: string[] = [], options: { source?: boolean; executable?: string; chromiumSandbox?: boolean } = {}) {
    this.select();
    assert(!this.app, 'Quit the current viewer before reopening it');
    console.info(`[acceptance] Launching ${this.source || options.source ? 'source' : 'packaged'} viewer with temporary home ${this.root}`);
    this.app = await _electron.launch({ executablePath: options.executable ?? (options.source || this.source ? electron as unknown as string : this.executable), args: options.source || this.source ? [path.resolve(__dirname, '../dist/desktop/main.cjs'), ...args] : args, cwd: this.base, env: this.env, chromiumSandbox: options.chromiumSandbox, timeout: 240_000 });
    relayDesktopOutput(this.app, this.report.name as string);
    await this.app.firstWindow({ timeout: 30_000 });
    const page = await viewerPage(this.app);
    page.setDefaultTimeout(30_000);
    // Electron can cancel beforeunload before Chromium's CDP dialog reply.
    // Playwright's automatic handler otherwise turns that benign race into
    // an unhandled "No dialog is showing" rejection outside our cleanup.
    page.on('dialog', dialog => { void dialog.dismiss().catch(() => {}); });
    const noteError = (error: string) => {
      this.rendererErrors.push(`${new Date().toISOString().slice(11, 23)} ${error.slice(0, 400)}`);
      if (this.rendererErrors.length > 20) this.rendererErrors.shift();
    };
    page.on('pageerror', error => noteError(`pageerror: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') noteError(`console: ${message.text()}`); });
    // Refuse renderer requests to external services during these checks.
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      return /^https?:$/.test(url.protocol) && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? route.abort() : route.continue();
    });
    this.page = page;
    return page;
  }

  async launch(args: string[] = [], options: { executable?: string; chromiumSandbox?: boolean } = {}) {
    const started = Date.now();
    const page = await this.launchRaw(args, options);
    await page.waitForURL(url => url.protocol === 'https:', { timeout: FIRST_START_MS });
    this.origin = new URL(page.url()).origin;
    await page.locator('aside:visible').first().waitFor();
    // The sidebar shows before React runs, and a check that presses keys or
    // clicks needs the page's own handlers.
    await hydrated(page);
    assert.equal(await page.evaluate(() => window.riDesktop?.platform), process.platform);
    assert.equal(await page.evaluate(() => typeof window.riDesktop?.settings), 'function', 'Local Home viewer requires its settings bridge');
    assert.equal(await page.evaluate(() => typeof window.riDesktop?.notifications), 'function', 'Local Home viewer requires its notification bridge');
    assert.equal((await serviceStatus())?.phase, 'running');
    const launches = (this.report.launches ??= []) as unknown[];
    launches.push({ readyMs: Date.now() - started, origin: this.origin });
    console.info('[acceptance] Viewer and local service are ready');
    return page;
  }

  async navigate(route: string) {
    assert(this.page && this.origin, 'Launch before navigating');
    await nativeNavigate(this.page, new URL(route, this.origin).href, this.report);
  }

  async reload() {
    assert(this.app && this.page, 'Launch before reloading');
    await nativeReload(this.app, this.page, this.report);
  }

  /** The Home's own account of a failed check: the end of its service log and
   * the longest stalls its perf log recorded (docs/server-perf-log.md). With
   * the page's side of the report it shows whether the server or the page
   * stopped. Reads files only, so it works when the Home doesn't answer. */
  homeEvidence() {
    this.select();
    const { log, identity } = servicePaths();
    const redact = (line: string) => redactServiceLine(line, []).replace(new RegExp(`#${PAIRING_TOKEN_FRAGMENT_KEY}=[^\\s]+`, 'g'), '#[pairing token redacted]').slice(0, 300);
    const tail = (file: string, bytes: number) => {
      const size = fs.statSync(file).size;
      const handle = fs.openSync(file, 'r');
      try {
        const buffer = Buffer.alloc(Math.min(size, bytes));
        fs.readSync(handle, buffer, 0, buffer.length, size - buffer.length);
        // The first line may start mid-way, unless the whole file fit.
        return buffer.toString('utf8').split('\n').slice(size > bytes ? 1 : 0).filter(Boolean);
      } finally { fs.closeSync(handle); }
    };
    type PerfRecord = { t?: string; type?: string; ms?: number; db?: { ms?: number }; inFlight?: Array<{ label: string; ms: number }>; loop?: { maxMs?: number } };
    const perfLog = perfLogPaths(identity.work).current;
    const records = fs.existsSync(perfLog) ? tail(perfLog, 512 * 1024).flatMap(line => {
      try { return [JSON.parse(line) as PerfRecord]; } catch { return []; }
    }) : [];
    return {
      serviceLog: fs.existsSync(log) ? tail(log, 32 * 1024).slice(-40).map(redact) : 'No service log',
      stalls: records.filter(record => record.type === 'stall').sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0)).slice(0, 8).map(record => ({
        t: record.t, ms: Math.round(record.ms ?? 0), dbMs: Math.round(record.db?.ms ?? 0),
        inFlight: record.inFlight?.slice(0, 4).map(work => `${work.label} ${Math.round(work.ms)}ms`),
      })),
      longestLoopDelayMs: Math.round(Math.max(0, ...records.map(record => record.loop?.maxMs ?? 0))),
    };
  }

  check(name: string, detail?: unknown) {
    (this.report.checks as unknown[]).push({ name, ...(detail === undefined ? {} : { detail }) });
    console.info(`[acceptance] ${name}`);
  }

  async quit() {
    if (!this.app) return;
    const app = this.app;
    await bounded(Promise.all([app.waitForEvent('close', { timeout: 30_000 }), app.evaluate(({ app }) => app.quit())]), 'native viewer quit', 35_000);
    this.app = undefined;
    this.page = undefined;
  }

  async cleanup() {
    // Failed assertions must not strand a renderer or its detached service.
    if (this.page && !this.page.isClosed()) await bounded(this.page.context().setOffline(false), 'cleanup network reset', 5_000).catch(() => {});
    try { await this.quit(); }
    catch { this.app?.process().kill('SIGKILL'); this.app = undefined; }
    this.select();
    await stopService();
    assert.equal(await serviceStatus(), null, 'Acceptance service was left running');
    // Preserve the small data home, logs and screenshots for investigation.
    // The immutable runtime is identified in the report and remains in the
    // input package, so repeated acceptance runs need not keep duplicate GBs.
    // A shared install root (CI) stays for the next smoke's Home.
    fs.rmSync(path.join(this.base, 'runtime'), { recursive: true, force: true });
  }
}

export async function acceptance(name: string, run: (fixture: AcceptanceFixture) => Promise<void>, options: { source?: boolean; development?: boolean; chooseHome?: boolean } = {}) {
  const fixture = new AcceptanceFixture(name, options);
  let failure: unknown;
  try { await run(fixture); }
  catch (error) {
    failure = error;
    fixture.report.error = error instanceof Error ? error.stack : String(error);
    fixture.report.renderer = fixture.page ? await bounded(fixture.page.evaluate(async capturePrefix => ({
      // Null when React never attached the page's handlers (see hydrated()).
      url: location.href, readyState: document.readyState, desktop: document.documentElement.dataset.riDesktop ?? null,
      bridge: typeof window.riDesktop,
      // How far this document got and how long each part took: a slow server
      // shows in the response, a slow script in the resources, a page that
      // threw in rendererErrors below.
      documentAgeMs: Math.round(performance.now()),
      navigation: (performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]).map(entry => ({
        type: entry.type, responseStart: Math.round(entry.responseStart), responseEnd: Math.round(entry.responseEnd),
        domContentLoaded: Math.round(entry.domContentLoadedEventEnd), load: Math.round(entry.loadEventEnd),
      }))[0],
      slowestResources: (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
        .sort((a, b) => b.duration - a.duration).slice(0, 5)
        .map(entry => `${new URL(entry.name).pathname.slice(-80)} ${Math.round(entry.duration)}ms`),
      body: document.body.innerText.trim().replace(/\s+/g, ' ').slice(0, 300),
      bodyInert: document.body.inert, activeElement: document.activeElement?.tagName,
      visibility: document.visibilityState, hasFocus: document.hasFocus(),
      editors: [...document.querySelectorAll('[contenteditable]')].map(element => ({ editable: element.getAttribute('contenteditable'), label: element.getAttribute('aria-label'), disabled: element.getAttribute('aria-disabled') })),
      activeInputs: [...document.querySelectorAll('[data-active-input]')].map(element => element.getAttribute('data-active-input')),
      draftKeys: Object.keys(localStorage).filter(key => key.startsWith('ri:document-draft:v1:')),
      // Open dialogs and what they say: one hidden under another modal drops
      // out of role queries, and a status line names a save that failed.
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map(dialog => ({
        title: dialog.getAttribute('aria-labelledby') ? document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent : dialog.getAttribute('aria-label'),
        hidden: !!dialog.closest('[aria-hidden="true"]'),
        said: [...dialog.querySelectorAll('[role="status"],[role="alert"]')].map(element => element.textContent?.trim().slice(0, 200)).filter(Boolean),
      })),
      captureDrafts: Object.keys(localStorage).filter(key => key.startsWith(capturePrefix)).map(key => {
        try {
          const record = JSON.parse(localStorage.getItem(key)!) as { deleted?: boolean; text?: string; files?: unknown[]; submission?: string };
          return { id: key.slice(-8), deleted: !!record.deleted, textLength: record.text?.length ?? 0, images: record.files?.length ?? 0, submission: record.submission };
        } catch { return { id: key.slice(-8), unreadable: true }; }
      }),
      locks: await navigator.locks?.query().then(state => ({ held: state.held?.map(lock => lock.name), pending: state.pending?.map(lock => lock.name) })).catch(() => undefined),
    }), CAPTURE_DRAFT_PREFIX), 'failed renderer diagnostics', 5_000).catch(() => undefined) : undefined;
    fixture.report.rendererErrors = fixture.rendererErrors;
    try { fixture.report.home = fixture.homeEvidence(); }
    catch (error) { fixture.report.home = { unreadable: String(error) }; }
    await fixture.page?.screenshot({ path: path.join(fixture.base, 'failure.png'), timeout: 5_000 }).catch(() => {});
  }
  finally {
    try { await fixture.cleanup(); fixture.report.serviceStopped = true; }
    catch (error) { failure ??= error; fixture.report.cleanupError = String(error); }
    fixture.report.passed = !failure;
    fixture.report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(fixture.base, 'report.json'), JSON.stringify(fixture.report, null, 2));
    console.info(JSON.stringify(fixture.report, null, 2));
  }
  if (failure) throw failure;
}
