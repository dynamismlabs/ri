/**
 * Notarizes the signed Mac app with Apple and staples the ticket to it (docs/publishing.md).
 * desktop/package.mjs calls this from electron-builder's afterSign hook, which runs after
 * the app is signed and before the dmg and zip are made, so both hold the stapled app.
 *
 * electron-builder's own notarization is off. It waits on Apple in one long notarytool
 * request, and GitHub's Mac runners drop the network often enough to fail builds Apple
 * went on to accept. Here the upload is retried until Apple returns a submission id,
 * which is printed so a stuck run can be looked up. Then that one submission is checked
 * on, riding out timeouts and lost connections, for up to an hour. It is never sent again.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

/**
 * @typedef {{ code: number | null, stdout: string, stderr: string, timedOut?: boolean }} CommandResult
 * @typedef {(command: string, args: string[], options: { timeout: number }) => Promise<CommandResult>} Runner
 * @typedef {{
 *   appPath: string,
 *   env?: Record<string, string | undefined>,
 *   run?: Runner,
 *   sleep?: (ms: number) => Promise<void>,
 *   now?: () => number,
 *   log?: (line: string) => void,
 * }} NotarizeOptions
 */

/** How long notarizing may take, and how often it tries again. */
export const NOTARIZE_TIMING = {
  /** For the upload and Apple's verdict together. Apple usually answers in minutes. */
  deadline: 60 * 60_000,
  uploadAttempts: 4,
  stapleAttempts: 4,
  logAttempts: 3,
  /** Between status checks while Apple is still working. */
  poll: 30_000,
  /** The first wait after a failure, doubling up to `maxRetry`. An upload waits twice as long. */
  retry: 15_000,
  maxRetry: 2 * 60_000,
};

/** How long each command may run before it is stopped and counted as a failure. */
const LIMITS = { zip: 20 * 60_000, upload: 30 * 60_000, info: 3 * 60_000, log: 3 * 60_000, staple: 5 * 60_000, validate: 2 * 60_000 };

/** The Apple secrets whose values are never printed, whichever way is signing in. GitHub
 * hides them in the log too. APPLE_API_KEY is only the key file's path. */
const SECRET_NAMES = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'];

/**
 * notarytool's sign-in arguments, chosen as package-preflight.mjs checked them: the Apple ID
 * when it is set, otherwise the App Store Connect API key (APPLE_API_KEY is the .p8 file's
 * path).
 * @param {Record<string, string | undefined>} env
 */
export function notaryCredentials(env) {
  const set = (/** @type {string} */ name) => Boolean(env[name]?.trim());
  const value = (/** @type {string} */ name) => /** @type {string} */ (env[name]);
  if (set('APPLE_ID') || set('APPLE_APP_SPECIFIC_PASSWORD')) {
    if (!['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'].every(set)) throw new Error('Notarizing with an Apple ID needs APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID.');
    return { label: 'the Apple ID in APPLE_ID', args: ['--apple-id', value('APPLE_ID'), '--password', value('APPLE_APP_SPECIFIC_PASSWORD'), '--team-id', value('APPLE_TEAM_ID')] };
  }
  if (!['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'].every(set)) throw new Error('Notarizing needs APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID, or an App Store Connect API key in APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER.');
  return { label: 'the App Store Connect API key in APPLE_API_KEY', args: ['--key', value('APPLE_API_KEY'), '--key-id', value('APPLE_API_KEY_ID'), '--issuer', value('APPLE_API_ISSUER')] };
}

/**
 * Runs a command and collects what it prints, stopping it after `timeout` milliseconds.
 * @param {string} command
 * @param {string[]} args
 * @param {{ timeout?: number }} [options]
 * @returns {Promise<CommandResult>}
 */
export function runCommand(command, args, { timeout } = {}) {
  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    const timer = timeout ? setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout) : undefined;
    child.on('error', error => { clearTimeout(timer); resolve({ code: null, stdout, stderr: `${stderr}${error.message}`, timedOut }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut }); });
  });
}

const wait = (/** @type {number} */ ms) => new Promise(resolve => { setTimeout(resolve, ms); });
const backoff = (/** @type {number} */ failures, /** @type {number} */ first, /** @type {number} */ cap) => Math.min(first * 2 ** (failures - 1), cap);
const duration = (/** @type {number} */ ms) => ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)} min`;
const printed = (/** @type {CommandResult} */ result) => `${result.stderr}\n${result.stdout}`;

/**
 * One short line saying why notarytool or stapler failed. A dropped connection reads as
 * its NSURLError, as in `The request timed out. (-1001)`.
 * @param {CommandResult} result
 */
export function failureReason(result) {
  if (result.timedOut) return 'no answer in time, so it was stopped';
  const output = printed(result);
  const network = output.match(/Code=(-\d+) "([^"]+)"/);
  if (network) return `${network[2]} (${network[1]})`;
  const lines = output.split('\n').map(line => line.trim()).filter(Boolean);
  const line = lines.find(text => /error|fail|refused|invalid|denied/i.test(text)) ?? lines[0];
  return line ? line.slice(0, 300) : `exit code ${result.code}`;
}

/** Apple refused the credentials, which no amount of waiting fixes. */
const refused = (/** @type {CommandResult} */ result) => /(?:status code|statusCode)[:=]? *(?:Optional\()?(?:401|403)\b|Invalid credentials/i.test(printed(result));

/** notarytool's JSON answer, or null when it printed something else. */
function parseJson(/** @type {string} */ stdout) {
  const text = stdout.trim();
  for (const candidate of [text, ...text.split('\n').reverse()]) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object') return value;
    } catch { /* not JSON */ }
  }
  return null;
}

/**
 * Zips the signed app, submits it to Apple's notary service, waits for Apple's verdict and
 * staples the ticket to the app. Throws, with Apple's reasons, when Apple doesn't accept
 * it, and when Apple can't be reached for an hour.
 * @param {NotarizeOptions} options
 */
export async function notarizeApp({ appPath, env = process.env, run = runCommand, sleep = wait, now = Date.now, log = console.info }) {
  const credentials = notaryCredentials(env);
  // Longest first, so a secret holding another is hidden whole.
  const secrets = [...new Set(SECRET_NAMES.flatMap(name => [env[name] ?? '', env[name]?.trim() ?? '']))].filter(secret => secret.length >= 3).sort((a, b) => b.length - a.length);
  const clean = (/** @type {string} */ text) => secrets.reduce((out, secret) => out.split(secret).join('***'), text);
  const started = now();
  const ctx = {
    name: path.basename(appPath),
    label: credentials.label,
    started,
    deadline: started + NOTARIZE_TIMING.deadline,
    run, sleep, now,
    say: (/** @type {string} */ line) => log(clean(line)),
    fail: (/** @type {string} */ message) => new Error(clean(message)),
    notarytool: (/** @type {string} */ command, /** @type {string[]} */ args, /** @type {number} */ timeout) =>
      run('xcrun', ['notarytool', command, ...args, ...credentials.args], { timeout }),
  };
  // Outside the release folder, whose zips are uploaded.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-notarize-'));
  try {
    const zip = path.join(dir, `${path.parse(appPath).name}.zip`);
    const zipped = await run('ditto', ['-c', '-k', '--keepParent', appPath, zip], { timeout: LIMITS.zip });
    if (zipped.code !== 0) throw ctx.fail(`Couldn't zip ${ctx.name} for notarization (${failureReason(zipped)}).`);
    const id = await upload(ctx, zip);
    ctx.say(`Apple's notary service has ${ctx.name} as submission ${id}. Look it up with xcrun notarytool info ${id} and the same credentials.`);
    await verdict(ctx, id);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  await staple(ctx, appPath);
}

/** @typedef {{ name: string, label: string, deadline: number, started: number, run: Runner, sleep: (ms: number) => Promise<void>, now: () => number, say: (line: string) => void, fail: (message: string) => Error, notarytool: (command: string, args: string[], timeout: number) => Promise<CommandResult> }} Context */

/**
 * Uploads until Apple returns a submission id. Once it has, it never uploads again.
 * @param {Context} ctx
 * @param {string} zip
 * @returns {Promise<string>}
 */
async function upload(ctx, zip) {
  for (let attempt = 1; ; attempt++) {
    ctx.say(`Uploading ${ctx.name} to Apple's notary service with ${ctx.label}${attempt > 1 ? `, attempt ${attempt} of ${NOTARIZE_TIMING.uploadAttempts}` : ''}.`);
    const result = await ctx.notarytool('submit', [zip, '--no-wait', '--output-format', 'json'], LIMITS.upload);
    const answer = parseJson(result.stdout);
    if (typeof answer?.id === 'string' && answer.id) return answer.id;
    const why = result.code === 0 ? `it returned no submission id: ${result.stdout.trim().slice(0, 300)}` : failureReason(result);
    if (refused(result)) throw ctx.fail(`Apple's notary service refused ${ctx.label} (${why}).`);
    if (attempt >= NOTARIZE_TIMING.uploadAttempts || ctx.now() >= ctx.deadline) throw ctx.fail(`Couldn't upload ${ctx.name} to Apple's notary service in ${attempt} attempts (${why}).`);
    const delay = backoff(attempt, 2 * NOTARIZE_TIMING.retry, NOTARIZE_TIMING.maxRetry);
    ctx.say(`The upload failed before Apple returned a submission id (${why}). Trying again in ${duration(delay)}.`);
    await ctx.sleep(delay);
  }
}

/**
 * Checks on the submission until Apple accepts it, finds it Invalid or Rejected, or the
 * deadline passes. Failing to reach Apple only means asking again later.
 * @param {Context} ctx
 * @param {string} id
 */
async function verdict(ctx, id) {
  /** @type {string | null} */
  let status = null;
  let failures = 0;
  let lastFailure = '';
  for (;;) {
    const result = await ctx.notarytool('info', [id, '--output-format', 'json'], LIMITS.info);
    const answer = parseJson(result.stdout);
    const answered = result.code === 0 && typeof answer?.status === 'string' ? answer.status : null;
    let delay;
    if (answered === 'Accepted') {
      ctx.say(`Apple accepted submission ${id} after ${duration(ctx.now() - ctx.started)}.`);
      return;
    }
    if (answered === 'Invalid' || answered === 'Rejected') throw await rejection(ctx, id, answered);
    if (answered) {
      if (answered !== status) ctx.say(`Submission ${id} is ${answered}, ${duration(ctx.now() - ctx.started)} in.`);
      status = answered;
      failures = 0;
      delay = NOTARIZE_TIMING.poll;
    } else {
      lastFailure = failureReason(result);
      if (refused(result)) throw ctx.fail(`Apple's notary service refused ${ctx.label} while checking on submission ${id} (${lastFailure}).`);
      failures++;
      delay = backoff(failures, NOTARIZE_TIMING.retry, NOTARIZE_TIMING.maxRetry);
      ctx.say(`Couldn't get submission ${id}'s status from Apple (${lastFailure}). Asking again in ${duration(delay)}.`);
    }
    const left = ctx.deadline - ctx.now();
    if (left <= 0) {
      const last = failures ? `the last check failed: ${lastFailure}` : `it was last ${status}`;
      throw ctx.fail(`Apple hadn't finished notarizing submission ${id} after ${duration(NOTARIZE_TIMING.deadline)} (${last}). Look it up with xcrun notarytool info ${id}, or build again.`);
    }
    await ctx.sleep(Math.min(delay, left));
  }
}

/**
 * The error for an app Apple found Invalid or Rejected, with what Apple's log says is wrong.
 * @param {Context} ctx
 * @param {string} id
 * @param {string} status
 */
async function rejection(ctx, id, status) {
  let why = '';
  for (let attempt = 1; attempt <= NOTARIZE_TIMING.logAttempts; attempt++) {
    const result = await ctx.notarytool('log', [id], LIMITS.log);
    const report = result.code === 0 ? parseJson(result.stdout) : null;
    if (report) {
      const issues = Array.isArray(report.issues) ? report.issues : [];
      const lines = issues.slice(0, 20).map((/** @type {Record<string, unknown>} */ issue) =>
        `  ${issue.severity ?? 'issue'}: ${issue.path ?? ''}${issue.architecture ? ` (${issue.architecture})` : ''}: ${issue.message ?? ''}`);
      if (issues.length > 20) lines.push(`  and ${issues.length - 20} more in xcrun notarytool log ${id}`);
      return ctx.fail([`Apple found ${ctx.name} ${status} (submission ${id})${report.statusSummary ? `: ${report.statusSummary}` : '.'}`, ...lines].join('\n'));
    }
    why = result.code === 0 ? 'it was not JSON' : failureReason(result);
    if (attempt < NOTARIZE_TIMING.logAttempts) await ctx.sleep(backoff(attempt, NOTARIZE_TIMING.retry, NOTARIZE_TIMING.maxRetry));
  }
  return ctx.fail(`Apple found ${ctx.name} ${status} (submission ${id}). Its log couldn't be fetched (${why}). Read it with xcrun notarytool log ${id}.`);
}

/**
 * Staples the ticket, so the app opens offline the first time too, then checks it.
 * Right after Apple accepts, the ticket can take a moment to be found.
 * @param {Context} ctx
 * @param {string} appPath
 */
async function staple(ctx, appPath) {
  for (let attempt = 1; ; attempt++) {
    const result = await ctx.run('xcrun', ['stapler', 'staple', appPath], { timeout: LIMITS.staple });
    if (result.code === 0) break;
    const why = failureReason(result);
    if (attempt >= NOTARIZE_TIMING.stapleAttempts) throw ctx.fail(`Couldn't staple the notarization ticket to ${ctx.name} in ${attempt} attempts (${why}).`);
    const delay = backoff(attempt, NOTARIZE_TIMING.retry, NOTARIZE_TIMING.maxRetry);
    ctx.say(`Stapling failed (${why}). Trying again in ${duration(delay)}.`);
    await ctx.sleep(delay);
  }
  const validated = await ctx.run('xcrun', ['stapler', 'validate', appPath], { timeout: LIMITS.validate });
  if (validated.code !== 0) throw ctx.fail(`The ticket stapled to ${ctx.name} doesn't validate (${failureReason(validated)}).`);
  ctx.say(`Stapled the notarization ticket to ${ctx.name} and validated it.`);
}
