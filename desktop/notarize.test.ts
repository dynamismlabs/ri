import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTARIZE_TIMING, notarizeApp, notaryCredentials, runCommand } from './notarize.mjs';

const ID = '2efe2717-52ef-43a5-96dc-0797e4ca1041';
const APP = '/runner/work/ri/ri/release/desktop/mac-arm64/Ri.app';
const APPLE_ID = { APPLE_ID: 'builder@example.com', APPLE_APP_SPECIFIC_PASSWORD: 'abcd-efgh-ijkl-mnop', APPLE_TEAM_ID: 'ABCDE12345' };
const API_KEY = { APPLE_API_KEY: '/runner/temp/apple-api-key/AuthKey_KEY1234567.p8', APPLE_API_KEY_ID: 'KEY1234567', APPLE_API_ISSUER: '69a6de7e-79f4-47e3-e053-5b8c7c11a4d1' };
const SECRETS = [...Object.values(APPLE_ID), API_KEY.APPLE_API_KEY_ID, API_KEY.APPLE_API_ISSUER];
const SECRET_NAMES = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'];

// What notarytool printed when GitHub's Mac runners lost the network during v0.1.0 builds.
const TIMED_OUT = `Error: HTTPError(statusCode: nil, error: Error Domain=NSURLErrorDomain Code=-1001 "The request timed out." UserInfo={_kCFStreamErrorCodeKey=-2102, NSUnderlyingError=0x6000038fe5e0 {Error Domain=kCFErrorDomainCFNetwork Code=-1001 "(null)"}, NSLocalizedDescription=The request timed out., NSErrorFailingURLKey=https://appstoreconnect.apple.com/notary/v2/submissions/${ID}?})`;
const OFFLINE = `Error: HTTPError(statusCode: nil, error: Error Domain=NSURLErrorDomain Code=-1009 "The Internet connection appears to be offline." UserInfo={_NSURLErrorNWPathKey=unsatisfied (No network route), NSLocalizedDescription=The Internet connection appears to be offline.})`;
const REFUSED = 'Error: HTTP status code: 401. Invalid credentials. Username or password is incorrect. Use the app-specific password generated at appleid.apple.com. Ensure that all authentication arguments are correct.';
const NOT_FOUND = 'Processing: /runner/work/ri/ri/release/desktop/mac-arm64/Ri.app\nCloudKit query for Ri.app (2/2a3b) failed due to "Record not found".\nCould not find base64 encoded ticket in response for 2/2a3b\nThe staple and validate action failed! Error 65.';
const LOG = {
  logFormatVersion: 1, jobId: ID, status: 'Invalid', statusSummary: 'Archive contains critical validation errors', statusCode: 4000, archiveFilename: 'Ri.zip',
  issues: [
    { severity: 'error', code: null, path: 'Ri.zip/Ri.app/Contents/Resources/node/bin/node', message: 'The binary is not signed with a valid Developer ID certificate.', architecture: 'arm64' },
    { severity: 'error', code: null, path: 'Ri.zip/Ri.app/Contents/MacOS/Ri', message: 'The signature does not include a secure timestamp.', architecture: 'arm64' },
  ],
};

type Result = { code: number | null, stdout?: string, stderr?: string, timedOut?: boolean };
type Step = 'zip' | 'submit' | 'info' | 'log' | 'staple' | 'validate';
const answer = (json: object): Result => ({ code: 0, stdout: `${JSON.stringify(json)}\n` });
const failure = (stderr: string, code = 1): Result => ({ code, stderr });
const DEFAULTS: Record<Step, Result[]> = {
  zip: [{ code: 0 }],
  submit: [answer({ id: ID, path: '/tmp/Ri.zip', message: 'Successfully uploaded file' })],
  info: [answer({ id: ID, name: 'Ri.zip', status: 'Accepted', message: 'Successfully received submission info' })],
  log: [answer(LOG)],
  staple: [{ code: 0, stdout: 'The staple and validate action worked!' }],
  validate: [{ code: 0, stdout: 'The validate action worked!' }],
};

/** A fake runner that answers each step from its script in turn, repeating the last
 * answer, and a sleep that moves a fake clock. */
function notarize(script: Partial<Record<Step, Result[]>> = {}, env: Record<string, string> = APPLE_ID) {
  const queues = Object.fromEntries(Object.entries({ ...DEFAULTS, ...script }).map(([step, answers]) => [step, [...answers]])) as Record<Step, Result[]>;
  const calls: { step: Step, command: string, args: string[], timeout: number }[] = [];
  const sleeps: number[] = [];
  const lines: string[] = [];
  let clock = 1_000_000;
  const started = clock;
  const run = async (command: string, args: string[], options: { timeout: number }) => {
    // ditto, then xcrun notarytool <step> or xcrun stapler <step>.
    const step = (command === 'ditto' ? 'zip' : args[1]) as Step;
    calls.push({ step, command, args, timeout: options.timeout });
    const queue = queues[step];
    return { stdout: '', stderr: '', ...(queue.length > 1 ? queue.shift()! : queue[0]) };
  };
  const sleep = async (ms: number) => { sleeps.push(ms); clock += ms; };
  const promise = notarizeApp({ appPath: APP, env, run, sleep, now: () => clock, log: line => lines.push(line) });
  return {
    promise, calls, sleeps, lines, env,
    steps: () => calls.map(call => call.step),
    args: (step: Step) => calls.filter(call => call.step === step).map(call => call.args),
    elapsed: () => clock - started,
    /** The error it threw, or undefined when it succeeded. */
    outcome: () => promise.then(() => undefined, (error: Error) => error),
  };
}

describe('notarizeApp', () => {
  it('zips, submits, waits for and staples an app Apple accepts the first time', async () => {
    const run = notarize();
    await run.promise;
    expect(run.steps()).toEqual(['zip', 'submit', 'info', 'staple', 'validate']);
    const [zipArgs] = run.args('zip');
    const zip = zipArgs[4];
    expect(zipArgs).toEqual(['-c', '-k', '--keepParent', APP, zip]);
    // Never in the release folder, whose zips are uploaded, and gone afterwards.
    expect(path.basename(zip)).toBe('Ri.zip');
    expect(zip.startsWith(path.join(os.tmpdir(), 'ri-notarize-'))).toBe(true);
    expect(fs.existsSync(path.dirname(zip))).toBe(false);
    const auth = ['--apple-id', APPLE_ID.APPLE_ID, '--password', APPLE_ID.APPLE_APP_SPECIFIC_PASSWORD, '--team-id', APPLE_ID.APPLE_TEAM_ID];
    expect(run.args('submit')).toEqual([['notarytool', 'submit', zip, '--no-wait', '--output-format', 'json', ...auth]]);
    expect(run.args('info')).toEqual([['notarytool', 'info', ID, '--output-format', 'json', ...auth]]);
    expect(run.args('staple')).toEqual([['stapler', 'staple', APP]]);
    expect(run.args('validate')).toEqual([['stapler', 'validate', APP]]);
    expect(run.sleeps).toEqual([]);
    // The id is printed, so a stuck run can be looked up.
    expect(run.lines).toContain(`Apple's notary service has Ri.app as submission ${ID}. Look it up with xcrun notarytool info ${ID} and the same credentials.`);
    expect(run.lines.at(-1)).toBe('Stapled the notarization ticket to Ri.app and validated it.');
    // Every command has a time limit.
    for (const call of run.calls) expect(call.timeout).toBeGreaterThan(0);
  });

  it('rides out a timeout, an offline runner, a hung notarytool and a 503 while Apple works, without submitting again', async () => {
    const run = notarize({ info: [
      failure(TIMED_OUT, 69), failure(OFFLINE, 69), { code: null, timedOut: true }, failure('Error: HTTP status code: 503. Service Unavailable', 69),
      answer({ id: ID, status: 'In Progress' }), answer({ id: ID, status: 'In Progress' }), answer({ id: ID, status: 'Accepted' }),
    ] });
    await run.promise;
    expect(run.steps()).toEqual(['zip', 'submit', 'info', 'info', 'info', 'info', 'info', 'info', 'info', 'staple', 'validate']);
    // Failures back off from 15s up to 2 min, and a status check resets that.
    expect(run.sleeps).toEqual([15_000, 30_000, 60_000, 120_000, NOTARIZE_TIMING.poll, NOTARIZE_TIMING.poll]);
    expect(run.lines).toEqual(expect.arrayContaining([
      `Couldn't get submission ${ID}'s status from Apple (The request timed out. (-1001)). Asking again in 15s.`,
      `Couldn't get submission ${ID}'s status from Apple (The Internet connection appears to be offline. (-1009)). Asking again in 30s.`,
      `Couldn't get submission ${ID}'s status from Apple (no answer in time, so it was stopped). Asking again in 1 min.`,
      `Couldn't get submission ${ID}'s status from Apple (Error: HTTP status code: 503. Service Unavailable). Asking again in 2 min.`,
      `Submission ${ID} is In Progress, 4 min in.`,
    ]));
    // Printed once, not on every check.
    expect(run.lines.filter(line => line.includes('In Progress'))).toHaveLength(1);
  });

  it('uploads again when the upload fails before Apple returns a submission id', async () => {
    const run = notarize({ submit: [failure(OFFLINE, 69), DEFAULTS.submit[0]] });
    await run.promise;
    expect(run.steps()).toEqual(['zip', 'submit', 'submit', 'info', 'staple', 'validate']);
    expect(run.args('submit')[0]).toEqual(run.args('submit')[1]);
    expect(run.sleeps).toEqual([30_000]);
    expect(run.lines).toContain('The upload failed before Apple returned a submission id (The Internet connection appears to be offline. (-1009)). Trying again in 30s.');
    expect(run.lines).toContain('Uploading Ri.app to Apple\'s notary service with the Apple ID in APPLE_ID, attempt 2 of 4.');
  });

  it('stops uploading after four failed attempts', async () => {
    const run = notarize({ submit: [failure(TIMED_OUT, 69)] });
    const error = await run.outcome();
    expect(error?.message).toBe('Couldn\'t upload Ri.app to Apple\'s notary service in 4 attempts (The request timed out. (-1001)).');
    expect(run.steps()).toEqual(['zip', 'submit', 'submit', 'submit', 'submit']);
    expect(run.sleeps).toEqual([30_000, 60_000, 120_000]);
  });

  it('fails at once when Apple refuses the credentials, since waiting won\'t help', async () => {
    const run = notarize({ submit: [failure(REFUSED, 69)] });
    expect((await run.outcome())?.message).toBe(`Apple's notary service refused the Apple ID in APPLE_ID (${REFUSED}).`);
    expect(run.steps()).toEqual(['zip', 'submit']);
    const polling = notarize({ info: [failure(REFUSED, 69)] });
    expect((await polling.outcome())?.message).toContain(`refused the Apple ID in APPLE_ID while checking on submission ${ID}`);
    expect(polling.steps()).toEqual(['zip', 'submit', 'info']);
  });

  it.each(['Invalid', 'Rejected'])('stops at %s and says what Apple\'s log found', async status => {
    const run = notarize({ info: [answer({ id: ID, status: 'In Progress' }), answer({ id: ID, status, message: 'Processing complete' })], log: [failure(OFFLINE, 69), answer({ ...LOG, status })] });
    const error = await run.outcome();
    expect(error?.message).toBe([
      `Apple found Ri.app ${status} (submission ${ID}): Archive contains critical validation errors`,
      '  error: Ri.zip/Ri.app/Contents/Resources/node/bin/node (arm64): The binary is not signed with a valid Developer ID certificate.',
      '  error: Ri.zip/Ri.app/Contents/MacOS/Ri (arm64): The signature does not include a secure timestamp.',
    ].join('\n'));
    // The log is fetched again after a dropped connection. Nothing is stapled.
    expect(run.steps()).toEqual(['zip', 'submit', 'info', 'info', 'log', 'log']);
    expect(run.args('log')[1]).toEqual(['notarytool', 'log', ID, '--apple-id', APPLE_ID.APPLE_ID, '--password', APPLE_ID.APPLE_APP_SPECIFIC_PASSWORD, '--team-id', APPLE_ID.APPLE_TEAM_ID]);
  });

  it('still fails Invalid, pointing at the log, when the log can\'t be fetched', async () => {
    const run = notarize({ info: [answer({ id: ID, status: 'Invalid' })], log: [failure(OFFLINE, 69)] });
    expect((await run.outcome())?.message).toBe(`Apple found Ri.app Invalid (submission ${ID}). Its log couldn't be fetched (The Internet connection appears to be offline. (-1009)). Read it with xcrun notarytool log ${ID}.`);
    expect(run.steps().filter(step => step === 'log')).toHaveLength(NOTARIZE_TIMING.logAttempts);
  });

  it.each([
    ['still In Progress', [answer({ id: ID, status: 'In Progress' })], 'it was last In Progress'],
    ['unreachable', [failure(OFFLINE, 69)], 'the last check failed: The Internet connection appears to be offline. (-1009)'],
  ])('gives up after an hour while Apple is %s, naming the submission and never submitting again', async (_state, info, last) => {
    const run = notarize({ info });
    const error = await run.outcome();
    expect(error?.message).toBe(`Apple hadn't finished notarizing submission ${ID} after 60 min (${last}). Look it up with xcrun notarytool info ${ID}, or build again.`);
    expect(run.elapsed()).toBe(NOTARIZE_TIMING.deadline);
    expect(run.steps().filter(step => step === 'submit')).toHaveLength(1);
    expect(run.steps()).not.toContain('staple');
    expect(Math.max(...run.sleeps)).toBeLessThanOrEqual(NOTARIZE_TIMING.maxRetry);
  });

  it('staples again while Apple\'s ticket isn\'t found yet, then validates', async () => {
    const run = notarize({ staple: [failure(NOT_FOUND, 65), failure(OFFLINE, 65), DEFAULTS.staple[0]] });
    await run.promise;
    expect(run.steps()).toEqual(['zip', 'submit', 'info', 'staple', 'staple', 'staple', 'validate']);
    expect(run.sleeps).toEqual([15_000, 30_000]);
    expect(run.lines).toContain('Stapling failed (CloudKit query for Ri.app (2/2a3b) failed due to "Record not found".). Trying again in 15s.');
  });

  it('fails when stapling never works, or the stapled ticket doesn\'t validate', async () => {
    const stapling = notarize({ staple: [failure(NOT_FOUND, 65)] });
    expect((await stapling.outcome())?.message).toBe('Couldn\'t staple the notarization ticket to Ri.app in 4 attempts (CloudKit query for Ri.app (2/2a3b) failed due to "Record not found".).');
    expect(stapling.steps().filter(step => step === 'staple')).toHaveLength(NOTARIZE_TIMING.stapleAttempts);
    const validating = notarize({ validate: [failure('Ri.app does not have a ticket stapled to it.', 65)] });
    expect((await validating.outcome())?.message).toBe('The ticket stapled to Ri.app doesn\'t validate (Ri.app does not have a ticket stapled to it.).');
  });

  it('signs in with the API key when there is no Apple ID, and prefers the Apple ID when both are set', async () => {
    const auth = ['--key', API_KEY.APPLE_API_KEY, '--key-id', API_KEY.APPLE_API_KEY_ID, '--issuer', API_KEY.APPLE_API_ISSUER];
    const run = notarize({}, API_KEY);
    await run.promise;
    expect(run.lines[0]).toBe('Uploading Ri.app to Apple\'s notary service with the App Store Connect API key in APPLE_API_KEY.');
    for (const step of ['submit', 'info'] as const) expect(run.args(step)[0].slice(-6)).toEqual(auth);
    expect(notaryCredentials(API_KEY).args).toEqual(auth);
    expect(notaryCredentials({ ...API_KEY, ...APPLE_ID }).args).toEqual(['--apple-id', APPLE_ID.APPLE_ID, '--password', APPLE_ID.APPLE_APP_SPECIFIC_PASSWORD, '--team-id', APPLE_ID.APPLE_TEAM_ID]);
    expect(() => notaryCredentials({ ...API_KEY, APPLE_ID: APPLE_ID.APPLE_ID })).toThrow('needs APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID');
    expect(() => notaryCredentials({ APPLE_API_KEY_ID: 'KEY1234567' })).toThrow('or an App Store Connect API key');
  });

  it('never prints a secret, even when Apple\'s answers repeat one', async () => {
    const echo = `for ${APPLE_ID.APPLE_ID} in team ${APPLE_ID.APPLE_TEAM_ID} with issuer ${API_KEY.APPLE_API_ISSUER} and key ${API_KEY.APPLE_API_KEY_ID} using ${APPLE_ID.APPLE_APP_SPECIFIC_PASSWORD}`;
    // Both ways set, so every value is one to hide, whichever way signs in.
    const both = { ...API_KEY, ...APPLE_ID };
    const runs = [
      notarize({}, both),
      notarize({ submit: [failure(`Error: upload failed ${echo}`, 69), DEFAULTS.submit[0]], info: [failure(`Error: ${echo}`, 69), DEFAULTS.info[0]], staple: [failure(`Error: staple failed ${echo}`, 65), DEFAULTS.staple[0]] }, both),
      notarize({ submit: [failure(`${REFUSED} ${echo}`, 69)] }, both),
      notarize({ info: [answer({ id: ID, status: 'Invalid' })], log: [answer({ ...LOG, statusSummary: `Rejected ${echo}`, issues: [{ severity: 'error', path: 'Ri.zip/Ri.app', message: echo }] })] }, both),
      notarize({ info: [answer({ id: ID, status: 'Invalid' })], log: [failure(`Error: ${echo}`, 69)] }, both),
      notarize({ info: [failure(`Error: ${echo}`, 69)] }, both),
      notarize({ zip: [failure(`ditto: ${echo}`)] }, both),
      notarize({ validate: [failure(`Error: ${echo}`, 65)] }, both),
      notarize({ submit: [failure(`Error: upload failed ${echo}`, 69), DEFAULTS.submit[0]] }, { ...API_KEY, APPLE_TEAM_ID: APPLE_ID.APPLE_TEAM_ID }),
    ];
    let hidden = 0;
    for (const run of runs) {
      const error = await run.outcome();
      const printed = [...run.lines, error?.message ?? '', error?.stack ?? ''].join('\n');
      for (const name of SECRET_NAMES) if (run.env[name]) expect(printed).not.toContain(run.env[name]);
      hidden += printed.split('***').length - 1;
      // The secrets did reach the commands that need them.
      expect(run.calls.some(call => call.args.some(arg => SECRETS.includes(arg)))).toBe(run.args('submit').length > 0);
    }
    expect(hidden).toBeGreaterThan(20);
  });
});

describe('runCommand', () => {
  it('collects what a command prints and how it exits', async () => {
    const result = await runCommand(process.execPath, ['-e', 'console.log("out"); console.error("err"); process.exit(3)'], { timeout: 10_000 });
    expect(result).toEqual({ code: 3, stdout: 'out\n', stderr: 'err\n', timedOut: false });
  });

  it('stops a command that runs past its time limit', async () => {
    const result = await runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 30_000)'], { timeout: 200 });
    expect(result.timedOut).toBe(true);
    expect(result.code).toBeNull();
  });

  it('reports a command that is not there', async () => {
    const result = await runCommand(path.join(os.tmpdir(), 'ri-no-such-command'), [], { timeout: 1_000 });
    expect(result.code).toBeNull();
    expect(result.stderr).toContain('ENOENT');
  });
});

it('packaging notarizes in afterSign, with electron-builder\'s own notarization off', () => {
  // electron-builder makes the dmg and zip after afterSign, so both hold the stapled app.
  const packaging = fs.readFileSync(path.resolve(__dirname, 'package.mjs'), 'utf8');
  expect(packaging).toMatch(/mac: \{[^}]*\n\s*notarize: false,/);
  const afterSign = packaging.slice(packaging.indexOf('afterSign: async context => {'));
  expect(afterSign.slice(0, afterSign.indexOf('\n    },'))).toContain('if (signing.notarize) await notarizeApp({ appPath: path.join(context.appOutDir, \'Ri.app\') });');
});
