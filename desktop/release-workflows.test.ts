import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// The two workflows that publish (docs/publishing.md, docs/alpha-builds.md). They hold the
// signing keys, so what they may run and write is pinned here.
type Step = { name?: string, uses?: string, run?: string, if?: string, with?: Record<string, string>, env?: Record<string, string> };
type Job = { permissions?: Record<string, string>, environment?: string, needs?: string | string[], if?: string, 'runs-on'?: string, steps: Step[], strategy?: { matrix: { include?: Record<string, string>[] } } };
type Workflow = { on: { workflow_dispatch?: { inputs: Record<string, { type: string, default: unknown }> } }, permissions: Record<string, string>, env?: Record<string, string>, jobs: Record<string, Job> };

const read = (name: string) => fs.readFileSync(path.resolve(__dirname, '../.github/workflows', name), 'utf8');
const RELEASE = read('release.yml');
const ALPHA = read('alpha.yml');
const release = parse(RELEASE) as Workflow;
const alpha = parse(ALPHA) as Workflow;
const steps = (workflow: Workflow, job: string) => workflow.jobs[job].steps;
const runs = (workflow: Workflow, job: string) => steps(workflow, job).map(step => step.run ?? '').join('\n');
const APPLE_SECRETS = ['APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD', 'APPLE_TEAM_ID', 'KEYCHAIN_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'];

describe.each([['release.yml', RELEASE], ['alpha.yml', ALPHA]])('%s', (_name, text) => {
  it('pins every action to a full commit, with its version beside it', () => {
    const uses = [...text.matchAll(/^\s*-?\s*uses:\s*(.+)$/gm)].map(match => match[1].trim());
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) expect(line).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
  });

  it('signs with the Apple secrets, and hands the build only the notarization setup checked', () => {
    const workflow = parse(text) as Workflow;
    const build = steps(workflow, 'build');
    // Every Apple name is a repository secret, and the identity comes from the certificate.
    expect(text).not.toMatch(/vars\.(APPLE|CSC)_|secrets\.CSC_/);
    expect(build.find(step => step.run === 'bash desktop/mac-signing.sh setup')!.env).toEqual(Object.fromEntries(APPLE_SECRETS.map(name => [name, `\${{ secrets.${name} }}`])));
    const packaging = build.find(step => step.env?.CSC_NAME)!;
    expect(packaging.env).toMatchObject({
      CSC_NAME: '${{ steps.apple.outputs.identity }}',
      CSC_KEYCHAIN: '${{ steps.apple.outputs.keychain }}',
      APPLE_TEAM_ID: "${{ steps.apple.outputs.identity && secrets.APPLE_TEAM_ID || '' }}",
      APPLE_ID: "${{ steps.apple.outputs.notary == 'apple-id' && secrets.APPLE_ID || '' }}",
      APPLE_APP_SPECIFIC_PASSWORD: "${{ steps.apple.outputs.notary == 'apple-id' && secrets.APPLE_APP_SPECIFIC_PASSWORD || '' }}",
      APPLE_API_KEY: '${{ steps.apple.outputs.api_key }}',
      APPLE_API_KEY_ID: "${{ steps.apple.outputs.notary == 'api-key' && secrets.APPLE_API_KEY_ID || '' }}",
      APPLE_API_ISSUER: "${{ steps.apple.outputs.notary == 'api-key' && secrets.APPLE_API_ISSUER || '' }}",
    });
    // The certificate's password and the keychain's stay with setup.
    for (const step of build) {
      if (step.run === 'bash desktop/mac-signing.sh setup') continue;
      expect(Object.values(step.env ?? {}).join('\n')).not.toMatch(/secrets\.(APPLE_CERTIFICATE|KEYCHAIN_PASSWORD)/);
    }
    expect(build.find(step => step.run?.startsWith('bash desktop/mac-signing.sh verify'))).toMatchObject({
      run: 'bash desktop/mac-signing.sh verify release/desktop/mac*/Ri.app release/desktop/*.dmg',
      env: { APPLE_TEAM_ID: '${{ secrets.APPLE_TEAM_ID }}' },
    });
    expect(build.find(step => step.run === 'bash desktop/mac-signing.sh cleanup')!.if).toMatch(/^always\(\) && runner.os == 'macOS'/);
  });

  it('rebuilds the website after publishing, and skips that when there is no hook', () => {
    expect(text).toContain('VERCEL_DEPLOY_HOOK: ${{ secrets.VERCEL_DEPLOY_HOOK }}');
    expect(text).toContain('if [ -z "$VERCEL_DEPLOY_HOOK" ]; then');
  });
});

describe('release.yml', () => {
  it('writes to the repository only from the jobs that publish, and attests only there', () => {
    expect(release.permissions).toEqual({ contents: 'read' });
    expect(release.jobs.build.permissions).toBeUndefined();
    expect(release.jobs.publish.permissions).toEqual({ contents: 'write', 'id-token': 'write', attestations: 'write' });
    expect(release.jobs.maintain.permissions).toEqual({ contents: 'write' });
    // Both sign with the release key, which can be scoped to this environment.
    expect(release.jobs.publish.environment).toBe('release');
    expect(release.jobs.maintain.environment).toBe('release');
  });

  it('checks the signing key is listed before building, and signs with it only beside the root public key', () => {
    // Hours of building wait on the check, which runs where the key is.
    expect(release.jobs.keys).toMatchObject({ if: "github.event_name == 'push'", environment: 'release' });
    expect(release.jobs.keys.permissions).toBeUndefined();
    expect(release.jobs.build.needs).toBe('keys');
    expect(runs(release, 'keys')).toContain('node desktop/publish-release.mjs check --existing feed-now');
    for (const job of ['keys', 'publish', 'maintain']) {
      const signing = steps(release, job).filter(step => step.env?.RI_RELEASE_SIGNING_KEY);
      expect(signing.length).toBeGreaterThan(0);
      for (const step of signing) {
        expect(step.env!.RI_RELEASE_SIGNING_KEY).toBe('${{ secrets.RI_RELEASE_SIGNING_KEY }}');
        // The root's public half, a variable. Its private half is never in GitHub.
        expect(step.env!.RI_RELEASE_PUBLIC_KEY).toBe('${{ vars.RI_RELEASE_PUBLIC_KEY }}');
      }
    }
    expect(RELEASE).not.toMatch(/secrets\.RI_RELEASE_ROOT|RI_RELEASE_ROOT_KEY/);
  });

  it('puts the keys file on the feed before the files it vouches for', () => {
    for (const job of ['publish', 'maintain']) {
      const script = runs(release, job);
      const keys = script.indexOf('gh release upload feed feed-next/keys.json --clobber');
      expect(keys).toBeGreaterThan(-1);
      expect(keys).toBeLessThan(script.indexOf('gh release upload feed feed-next/* --clobber'));
    }
  });

  it('pins installations, and the install script, to releases.ri.app', () => {
    expect(release.env).toEqual({ RI_RELEASE_FEED: 'https://releases.ri.app/' });
    expect(runs(release, 'publish')).toContain('--feed "$RI_RELEASE_FEED"');
    // Only the Mac and Linux builds carry the feed. Nothing on Windows reads one yet.
    expect(steps(release, 'build').find(step => step.name === 'Build')!.env).not.toHaveProperty('RI_RELEASE_FEED');
  });

  it('builds Windows, attaching its installer with no feed entry', () => {
    expect(release.jobs.build.strategy!.matrix.include).toContainEqual({ os: 'windows-2025', platform: 'win32', arch: 'x64' });
    expect(runs(release, 'build')).toContain('Windows) RI_RELEASE_FEED= RI_RELEASE_PUBLIC_KEY_FILE= pnpm desktop:package --share ;;');
    expect(steps(release, 'build').find(step => step.name === "Describe this platform's release")!.if).toBe("runner.os != 'Windows'");
    const upload = steps(release, 'build').find(step => step.uses?.startsWith('actions/upload-artifact@'))!;
    expect(upload.with!.path.split('\n')).toEqual(expect.arrayContaining(['release/build.json', 'release/desktop/*.exe', '!release/ri-runtime-*-win32-*.tar.gz']));
    // Optional signing runs only when its secret exists.
    const signing = steps(release, 'build').find(step => step.name === 'Sign the Windows installer (optional)')!;
    expect(signing.if).toBe("runner.os == 'Windows' && env.WINDOWS_SIGNING == 'true'");
  });

  it('builds and attaches the Linux deb beside the AppImage, with no feed entry', () => {
    const upload = steps(release, 'build').find(step => step.uses?.startsWith('actions/upload-artifact@'))!;
    expect(upload.with!.path.split('\n')).toEqual(expect.arrayContaining(['release/desktop/*.AppImage', 'release/desktop/*.deb']));
    expect(runs(release, 'build')).toContain('set -- release/desktop/*.deb');
    expect(runs(release, 'publish')).toContain("-o -name '*.deb'");
    // The feed's metadata names one shell file per platform, the AppImage, never the deb.
    expect(runs(release, 'build')).toContain('for candidate in release/desktop/*.zip release/desktop/*.AppImage; do');
  });

  it('uploads only the files it gathered, from a folder the checkout does not have', () => {
    // v0.1.0's first publish uploaded assets/*, which swept in the repository's own
    // assets/brand folder and failed after the feed was signed.
    const publish = runs(release, 'publish');
    const created = /gh release create "v\$VERSION" (\S+)\/\* /.exec(publish);
    expect(created?.[1]).toBe('release-files');
    expect(fs.existsSync(path.resolve(__dirname, '..', created![1]))).toBe(false);
    expect(publish).toContain(`mkdir -p payloads ${created![1]}`);
  });

  it('checksums, attests, then publishes each version with its downloads list', () => {
    const publish = steps(release, 'publish');
    const order = (match: (step: Step) => boolean) => publish.findIndex(match);
    const gather = order(step => step.run?.includes('release-downloads.mjs version') ?? false);
    const attest = order(step => step.uses?.startsWith('actions/attest-build-provenance@') ?? false);
    const upload = order(step => step.run?.includes('gh release create "v$VERSION"') ?? false);
    expect(gather).toBeGreaterThan(-1);
    expect(gather < attest && attest < upload).toBe(true);
    expect(publish[attest].with).toEqual({ 'subject-checksums': 'release-files/SHA256SUMS' });
    expect(runs(release, 'publish')).toContain('release-downloads.mjs channel --record release-files/downloads.json --channel latest --out feed-next');
    const maintain = runs(release, 'maintain');
    expect(maintain).toContain('release-downloads.mjs channel --record record/downloads.json --channel stable --out feed-next');
    expect(maintain).toContain('release-downloads.mjs withdraw --existing feed-now --version "$VERSION" > stale.txt');
    expect(maintain).toContain('gh release delete-asset feed "$name" --yes');
  });
});

describe('release notes', () => {
  const folder = path.resolve(__dirname, 'release-notes');
  it('uses a version\'s own notes when it has them, and the feat and fix subjects otherwise', () => {
    const script = runs(release, 'publish');
    const own = script.indexOf('if [ -f "desktop/release-notes/$VERSION.txt" ]; then cp "desktop/release-notes/$VERSION.txt" notes.txt');
    expect(own).toBeGreaterThan(-1);
    expect(script.indexOf("grep -E '^(feat|fix)(\\(|:)' > notes.txt")).toBeGreaterThan(own);
    expect(own).toBeLessThan(script.indexOf('publish-release.mjs publish'));
  });
  it.each(fs.readdirSync(folder))('keeps %s plain, short and in the site voice', file => {
    expect(file).toMatch(/^\d+\.\d+\.\d+\.txt$/);
    const text = fs.readFileSync(path.join(folder, file), 'utf8');
    const lines = text.trimEnd().split('\n');
    // The update card shows three lines, and publishing keeps the first 10,000 characters.
    expect(text.length).toBeLessThan(2000);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const line of lines) {
      expect(line.trim()).not.toBe('');
      expect(line).not.toMatch(/^\s*(#|[-*] )/);
      expect(line).not.toMatch(/[\u2014\u2013;]/);
    }
  });
});

describe('alpha.yml', () => {
  it('writes and attests only from the publish job', () => {
    expect(alpha.permissions).toEqual({ contents: 'read', actions: 'read' });
    expect(alpha.jobs.build.permissions).toBeUndefined();
    expect(alpha.jobs.publish.permissions).toEqual({ contents: 'write', actions: 'read', 'id-token': 'write', attestations: 'write' });
    const attest = steps(alpha, 'publish').find(step => step.uses?.startsWith('actions/attest-build-provenance@'))!;
    expect(attest).toMatchObject({ if: "steps.publish.outputs.published == 'true'", with: { 'subject-checksums': '${{ steps.publish.outputs.subjects }}' } });
  });

  it('records each build for the downloads list, and checks out what publishing reads', () => {
    expect(runs(alpha, 'build')).toContain('node desktop/release-downloads.mjs build --out release/build.json');
    const upload = steps(alpha, 'build').find(step => step.uses?.startsWith('actions/upload-artifact@') && step.with?.name === 'ri-alpha-${{ matrix.platform }}-${{ matrix.arch }}')!;
    expect(upload.with!.path.split('\n')).toContain('release/build.json');
    const checkout = steps(alpha, 'publish')[0];
    expect(checkout.with!['sparse-checkout'].trim().split('\n')).toEqual(['desktop/alpha-release.mjs', 'desktop/release-downloads.mjs', 'package.json']);
  });

  it('checks the Apple signing secrets on their own, building and publishing nothing', () => {
    expect(alpha.on.workflow_dispatch!.inputs.signing_check).toMatchObject({ type: 'boolean', default: false });
    const signing = alpha.jobs.signing;
    expect(signing).toMatchObject({ if: '${{ inputs.signing_check }}', 'runs-on': 'macos-15' });
    expect(signing.permissions).toBeUndefined();
    expect(signing.needs).toBeUndefined();
    // Only the script is checked out, so nothing else runs beside the secrets.
    expect(signing.steps[0]).toMatchObject({ uses: expect.stringMatching(/^actions\/checkout@/), with: { 'sparse-checkout': 'desktop/mac-signing.sh' } });
    expect(signing.steps.slice(1)).toEqual([
      { name: 'Check the certificate, identity and notarization sign-in', env: Object.fromEntries(APPLE_SECRETS.map(name => [name, `\${{ secrets.${name} }}`])), run: 'bash desktop/mac-signing.sh check' },
      { name: 'Remove the Developer ID from this runner', if: 'always()', run: 'bash desktop/mac-signing.sh cleanup' },
    ]);
    // The builds wait on targets, and publishing on the builds, so neither starts.
    expect(alpha.jobs.targets.if).toBe('${{ !inputs.signing_check }}');
    expect(alpha.jobs.build.needs).toBe('targets');
    expect(alpha.jobs.publish.if).toContain('!inputs.signing_check');
  });
});
