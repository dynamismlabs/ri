import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// desktop/mac-signing.sh against stand-ins for macOS's security, xcrun and openssl, so the
// rules about which Apple secrets sign, and what each wrong one says, hold on any computer.
// The real tools run in the alpha workflow's signing_check job (docs/publishing.md).
const SCRIPT = path.resolve(__dirname, 'mac-signing.sh');
const TEAM = 'ABCDE12345';
const DEVELOPER_ID = `Developer ID Application: Example Inc. (${TEAM})`;
const HASH = 'A'.repeat(40);
const SECRETS = {
  APPLE_CERTIFICATE: Buffer.from('a .p12 stand-in').toString('base64'),
  APPLE_CERTIFICATE_PASSWORD: 'p12-password-value',
  APPLE_TEAM_ID: TEAM,
  APPLE_ID: 'owner@example.com',
  APPLE_APP_SPECIFIC_PASSWORD: 'abcd-efgh-ijkl-mnop',
};
const API_KEY = { APPLE_API_KEY: '-----BEGIN PRIVATE KEY-----\nkey-body-value\n-----END PRIVATE KEY-----', APPLE_API_KEY_ID: 'KEY1234567', APPLE_API_ISSUER: 'issuer-uuid-value' };
const NAMES = [...Object.keys(SECRETS), ...Object.keys(API_KEY), 'KEYCHAIN_PASSWORD'];

const STUBS: Record<string, string> = {
  // The keychain is a file, the identities whatever the test lists, and a .p12 opens with one password.
  security: `
case "$1" in
  create-keychain) : > "\${@: -1}" ;;
  delete-keychain) rm -f "$2" ;;
  import)
    case " $* " in *" -P $STUB_P12_PASSWORD "*) ;; *" -P "*) echo "security: SecKeychainItemImport: MAC verification failed during PKCS12 import (wrong password?)" >&2; exit 1 ;; esac ;;
  list-keychains) [ "$2" = -d ] && [ "$4" != -s ] && echo '    "/Users/runner/Library/Keychains/login.keychain-db"' ;;
  find-identity) if [ "$2" = -v ]; then printf '%b' "$STUB_VALID"; else printf '%b' "$STUB_ALL"; fi ;;
  find-certificate) echo '-----BEGIN CERTIFICATE-----' ;;
esac
exit 0`,
  xcrun: `
echo "xcrun $*" >> "$STUB_LOG"
if [ "$STUB_NOTARY" = ok ]; then printf 'Successfully received submission history.\\n  id: one\\n  id: two\\n'; exit 0; fi
echo "Error: HTTP status code: 401. Invalid credentials. Username or password is incorrect." >&2
exit 69`,
  openssl: `
case "$1 $*" in
  rand*) echo made-up-keychain-password ;;
  *-enddate*) echo "notAfter=$STUB_EXPIRES" ;;
  *-checkend*) [ -z "$STUB_EXPIRING" ] ;;
esac`,
  curl: 'exit 1',
};

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-mac-signing-'));
  fs.mkdirSync(path.join(dir, 'bin'));
  for (const [name, body] of Object.entries(STUBS)) fs.writeFileSync(path.join(dir, 'bin', name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const listing = (...names: string[]) => `${names.map((name, i) => `  ${i + 1}) ${HASH} "${name}"\\n`).join('')}     ${names.length} valid identities found\\n`;

function run(command: string, secrets: Record<string, string>, stub: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of NAMES) delete env[name];
  Object.assign(env, {
    PATH: `${path.join(dir, 'bin')}${path.delimiter}${process.env.PATH}`,
    RUNNER_TEMP: dir, GITHUB_OUTPUT: path.join(dir, 'output'), GITHUB_STEP_SUMMARY: path.join(dir, 'summary'), STUB_LOG: path.join(dir, 'calls'),
    STUB_P12_PASSWORD: SECRETS.APPLE_CERTIFICATE_PASSWORD, STUB_VALID: listing(DEVELOPER_ID), STUB_ALL: '', STUB_NOTARY: 'ok', STUB_EXPIRES: 'Nov 20 12:00:00 2030 GMT', STUB_EXPIRING: '',
    ...secrets, ...stub,
  });
  const result = spawnSync('bash', [SCRIPT, command], { env, encoding: 'utf8', timeout: 20_000 });
  const read = (name: string) => fs.existsSync(path.join(dir, name)) ? fs.readFileSync(path.join(dir, name), 'utf8') : '';
  return { status: result.status, out: result.stdout + result.stderr, output: read('output'), summary: read('summary'), calls: read('calls') };
}

const neverPrinted = (out: string, secrets: Record<string, string>) => {
  for (const name of ['APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_ISSUER', 'KEYCHAIN_PASSWORD']) {
    if (secrets[name]) for (const line of secrets[name].split('\n')) expect(out).not.toContain(line);
  }
};

describe('which Apple secrets sign', () => {
  it('builds ad-hoc signed with none, and a keychain password alone changes nothing', () => {
    for (const secrets of [{}, { KEYCHAIN_PASSWORD: 'kc' }] as Record<string, string>[]) {
      const result = run('setup', secrets);
      expect(result.status).toBe(0);
      expect(result.out).toContain('ad-hoc signed and not notarized');
      expect(result.output).toBe('');
    }
  });

  it('stops on only some of them, naming each missing one', () => {
    const cases: [Record<string, string>, string][] = [
      [{ APPLE_CERTIFICATE: SECRETS.APPLE_CERTIFICATE }, 'Missing: APPLE_CERTIFICATE_PASSWORD APPLE_TEAM_ID APPLE_ID APPLE_APP_SPECIFIC_PASSWORD.'],
      [{ ...SECRETS, APPLE_APP_SPECIFIC_PASSWORD: '' }, 'Missing: APPLE_APP_SPECIFIC_PASSWORD.'],
      [{ ...SECRETS, APPLE_TEAM_ID: '' }, 'Missing: APPLE_TEAM_ID.'],
      [{ APPLE_ID: SECRETS.APPLE_ID }, 'Missing: APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_TEAM_ID APPLE_APP_SPECIFIC_PASSWORD.'],
      [{ ...SECRETS, APPLE_ID: '', APPLE_APP_SPECIFIC_PASSWORD: '', APPLE_API_KEY_ID: API_KEY.APPLE_API_KEY_ID }, 'Missing: APPLE_API_KEY APPLE_API_ISSUER.'],
    ];
    for (const [secrets, missing] of cases) {
      const result = run('setup', secrets);
      expect(result.status).toBe(1);
      expect(result.out).toContain(missing);
      expect(result.output).toBe('');
    }
  });
});

describe('setup', () => {
  it('finds the identity in the certificate and hands the build its name, keychain and notary', () => {
    const result = run('setup', SECRETS);
    expect(result.status).toBe(0);
    expect(result.output).toBe(`identity=Example Inc. (${TEAM})\nkeychain=${dir}/ri-signing.keychain-db\nnotary=apple-id\napi_key=\n`);
    expect(result.out).toContain(`Signing as ${DEVELOPER_ID}, which expires Nov 20 12:00:00 2030 GMT, and notarizing with the Apple ID in APPLE_ID (signed in, 2 past submissions listed).`);
    expect(result.calls).toBe(`xcrun notarytool history --apple-id ${SECRETS.APPLE_ID} --password ${SECRETS.APPLE_APP_SPECIFIC_PASSWORD} --team-id ${TEAM}\n`);
    // The keychain stays for the build, and the decoded certificate doesn't.
    expect(fs.existsSync(path.join(dir, 'ri-signing.keychain-db'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'developer-id.p12'))).toBe(false);
    // A keychain password made here is hidden from the log. One from the secret already is.
    expect(result.out).toContain('::add-mask::made-up-keychain-password');
    expect(run('setup', { ...SECRETS, KEYCHAIN_PASSWORD: 'kc-secret' }).out).not.toContain('::add-mask::');
    neverPrinted(result.out, SECRETS);
  });

  it('notarizes with an API key when there is no Apple ID, writing the key for electron-builder', () => {
    const secrets = { ...SECRETS, APPLE_ID: '', APPLE_APP_SPECIFIC_PASSWORD: '', ...API_KEY };
    const result = run('setup', secrets);
    expect(result.status).toBe(0);
    const key = `${dir}/apple-api-key/AuthKey_${API_KEY.APPLE_API_KEY_ID}.p8`;
    expect(result.output).toContain(`notary=api-key\napi_key=${key}\n`);
    expect(fs.readFileSync(key, 'utf8')).toBe(`${API_KEY.APPLE_API_KEY}\n`);
    expect(result.calls).toBe(`xcrun notarytool history --key ${key} --key-id ${API_KEY.APPLE_API_KEY_ID} --issuer ${API_KEY.APPLE_API_ISSUER}\n`);
    run('cleanup', {});
    expect(fs.existsSync(key)).toBe(false);
    expect(fs.existsSync(path.join(dir, 'ri-signing.keychain-db'))).toBe(false);
  });

  it('prefers the Apple ID when both ways to notarize are set, as electron-builder does', () => {
    const result = run('setup', { ...SECRETS, ...API_KEY });
    expect(result.status).toBe(0);
    expect(result.output).toContain('notary=apple-id\napi_key=\n');
  });

  it('warns about a certificate that expires within 30 days, and still signs', () => {
    const result = run('setup', SECRETS, { STUB_EXPIRING: '1' });
    expect(result.status).toBe(0);
    expect(result.out).toContain('::warning::The Developer ID certificate expires Nov 20 12:00:00 2030 GMT.');
  });

  it.each([
    ['a wrong certificate password', { APPLE_CERTIFICATE_PASSWORD: 'not-the-p12-password' }, {}, 'APPLE_CERTIFICATE_PASSWORD doesn\'t open APPLE_CERTIFICATE, or it isn\'t a .p12 (security: security: SecKeychainItemImport: MAC verification failed during PKCS12 import (wrong password?))'],
    ['a certificate that isn\'t base64', { APPLE_CERTIFICATE: '-----BEGIN CERTIFICATE-----' }, {}, 'APPLE_CERTIFICATE isn\'t base64.'],
    ['another kind of certificate', {}, { STUB_VALID: listing(`Apple Development: Example Inc. (${TEAM})`) }, `APPLE_CERTIFICATE holds Apple Development: Example Inc. (${TEAM}), not a Developer ID Application certificate.`],
    ['an expired certificate', {}, { STUB_VALID: '', STUB_ALL: `  1) ${HASH} "${DEVELOPER_ID}" (CSSMERR_TP_CERT_EXPIRED)\\n` }, `APPLE_CERTIFICATE holds no identity that can sign (it holds "${DEVELOPER_ID}" (CSSMERR_TP_CERT_EXPIRED)).`],
    ['another team', { APPLE_TEAM_ID: 'ZZZZZ99999' }, {}, `The certificate in APPLE_CERTIFICATE is ${DEVELOPER_ID}, which isn't in the team APPLE_TEAM_ID names.`],
    ['a Team ID that isn\'t one', { APPLE_TEAM_ID: `${TEAM}\n` }, {}, 'APPLE_TEAM_ID should be just the 10-character Team ID'],
    ['two identities for the team', {}, { STUB_VALID: listing(DEVELOPER_ID, DEVELOPER_ID) }, 'APPLE_CERTIFICATE holds more than one Developer ID Application identity for the team'],
    ['a refused notarization sign-in', {}, { STUB_NOTARY: 'refused' }, 'Apple\'s notary service refused APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID (notarytool: Error: HTTP status code: 401. Invalid credentials. Username or password is incorrect.'],
  ])('stops on %s, naming the secret', (_case, secrets, stub, message) => {
    const result = run('setup', { ...SECRETS, ...secrets }, stub);
    expect(result.status).toBe(1);
    expect(result.out).toContain(`::error::${message}`);
    expect(result.output).toBe('');
    neverPrinted(result.out, { ...SECRETS, ...secrets });
  });
});

describe('check', () => {
  it('reports each item, then removes the keychain', () => {
    const result = run('check', SECRETS);
    expect(result.status).toBe(0);
    for (const row of [
      'pass  Apple secrets               all set, notarizing with the Apple ID in APPLE_ID',
      'pass  Certificate imported        into a keychain of its own',
      `pass  Developer ID Application    ${DEVELOPER_ID}`,
      `pass  Team is APPLE_TEAM_ID       ${DEVELOPER_ID}`,
      'pass  Expires                     Nov 20 12:00:00 2030 GMT',
      'pass  Notarization sign-in        the Apple ID in APPLE_ID, signed in, 2 past submissions listed',
      'pass  Keychain removed            the keychain and any key file are deleted',
    ]) expect(result.out).toContain(row);
    expect(result.out).toContain('The Apple secrets can sign and notarize the Mac app.');
    expect(result.summary).toContain(`| pass | Developer ID Application | ${DEVELOPER_ID} |`);
    expect(result.output).toBe('');
    expect(fs.readdirSync(dir).sort()).toEqual(['bin', 'calls', 'summary']);
    neverPrinted(result.out + result.summary, SECRETS);
  });

  it('checks the notarization sign-in even when the certificate fails, and fails overall', () => {
    const result = run('check', { ...SECRETS, APPLE_CERTIFICATE_PASSWORD: 'not-the-p12-password' });
    expect(result.status).toBe(1);
    expect(result.out).toContain('fail  Certificate imported');
    expect(result.out).toContain('pass  Notarization sign-in');
    expect(result.out).toContain('pass  Keychain removed');
    expect(result.out).not.toContain('Developer ID Application    ');
  });

  it('names what is missing, and checks what it can', () => {
    const result = run('check', { ...SECRETS, APPLE_APP_SPECIFIC_PASSWORD: '' });
    expect(result.status).toBe(1);
    expect(result.out).toContain('fail  Apple secrets               missing APPLE_APP_SPECIFIC_PASSWORD');
    expect(result.out).toContain('pass  Certificate imported');
    expect(result.out).toContain('skip  Notarization sign-in        needs APPLE_APP_SPECIFIC_PASSWORD');
    expect(result.calls).toBe('');
  });

  it('fails with no Apple secrets at all, since there is nothing to check', () => {
    const result = run('check', {});
    expect(result.status).toBe(1);
    expect(result.out).toContain('fail  Apple secrets               none are set');
  });
});
