import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// The two workflows that publish (docs/publishing.md, docs/alpha-builds.md). They hold the
// signing keys, so what they may run and write is pinned here.
type Step = { name?: string, uses?: string, run?: string, if?: string, with?: Record<string, string>, env?: Record<string, string> };
type Job = { permissions?: Record<string, string>, environment?: string, steps: Step[], strategy?: { matrix: { include?: Record<string, string>[] } } };
type Workflow = { permissions: Record<string, string>, env?: Record<string, string>, jobs: Record<string, Job> };

const read = (name: string) => fs.readFileSync(path.resolve(__dirname, '../.github/workflows', name), 'utf8');
const RELEASE = read('release.yml');
const ALPHA = read('alpha.yml');
const release = parse(RELEASE) as Workflow;
const alpha = parse(ALPHA) as Workflow;
const steps = (workflow: Workflow, job: string) => workflow.jobs[job].steps;
const runs = (workflow: Workflow, job: string) => steps(workflow, job).map(step => step.run ?? '').join('\n');

describe.each([['release.yml', RELEASE], ['alpha.yml', ALPHA]])('%s', (_name, text) => {
  it('pins every action to a full commit, with its version beside it', () => {
    const uses = [...text.matchAll(/^\s*-?\s*uses:\s*(.+)$/gm)].map(match => match[1].trim());
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) expect(line).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
  });

  it('notarizes with an App Store Connect API key, never an Apple ID', () => {
    expect(text).not.toMatch(/APPLE_ID\b|APPLE_APP_SPECIFIC_PASSWORD/);
    for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']) expect(text).toContain(`secrets.${name} }}`);
    for (const name of ['APPLE_TEAM_ID', 'CSC_NAME']) expect(text).toContain(`vars.${name} }}`);
    expect(text).toContain('bash desktop/mac-signing.sh setup');
    expect(text).toContain('bash desktop/mac-signing.sh verify release/desktop/mac*/Ri.app release/desktop/*.dmg');
    expect(text).toContain('bash desktop/mac-signing.sh cleanup');
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

  it('checksums, attests, then publishes each version with its downloads list', () => {
    const publish = steps(release, 'publish');
    const order = (match: (step: Step) => boolean) => publish.findIndex(match);
    const gather = order(step => step.run?.includes('release-downloads.mjs version') ?? false);
    const attest = order(step => step.uses?.startsWith('actions/attest-build-provenance@') ?? false);
    const upload = order(step => step.run?.includes('gh release create "v$VERSION"') ?? false);
    expect(gather).toBeGreaterThan(-1);
    expect(gather < attest && attest < upload).toBe(true);
    expect(publish[attest].with).toEqual({ 'subject-checksums': 'assets/SHA256SUMS' });
    expect(runs(release, 'publish')).toContain('release-downloads.mjs channel --record assets/downloads.json --channel latest --out feed-next');
    const maintain = runs(release, 'maintain');
    expect(maintain).toContain('release-downloads.mjs channel --record record/downloads.json --channel stable --out feed-next');
    expect(maintain).toContain('release-downloads.mjs withdraw --existing feed-now --version "$VERSION" > stale.txt');
    expect(maintain).toContain('gh release delete-asset feed "$name" --yes');
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
});
