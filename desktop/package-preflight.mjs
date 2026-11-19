import fs from 'node:fs';

export const DESKTOP_NODE_VERSION = '26.5.0';

/** Check before loading packaging tools, creating output, or building native
 * dependencies. The build Node ABI must match the portable runtime we ship.
 * @param {{ platform?: NodeJS.Platform, arch?: string, nodeVersion?: string }} runtime
 */
export function assertDesktopPackagingRuntime({ platform = process.platform, arch = process.arch, nodeVersion = process.versions.node } = {}) {
  if (!(['darwin', 'linux'].includes(platform) && ['arm64', 'x64'].includes(arch)) && !(platform === 'win32' && arch === 'x64')) {
    throw new Error('Build on the matching macOS/Linux arm64/x64 or Windows x64 host.');
  }
  if (nodeVersion !== DESKTOP_NODE_VERSION) {
    throw new Error(`Build with pinned Node ${DESKTOP_NODE_VERSION} so native modules match the shipped runtime. Current Node: ${nodeVersion}. Run nvm install and nvm use, then pnpm install --frozen-lockfile before packaging.`);
  }
}

const DEVELOPER_ID_PREFIX = 'Developer ID Application: ';

/**
 * How a Mac build is signed (docs/publishing.md). A Developer ID, named by CSC_NAME,
 * signs a release or share build and notarizes it with an App Store Connect API key.
 * Without one, a share build is ad-hoc signed and a release can't be made. Checked
 * before anything is built, so a wrong setup fails in seconds, not after the build.
 * @param {{ platform?: NodeJS.Platform, release?: boolean, share?: boolean, env?: Record<string, string | undefined> }} build
 * @returns {{ identity: string | null, codesignIdentity?: string, notarize: boolean, keychain?: string }}
 */
export function macSigning({ platform = process.platform, release = false, share = false, env = process.env } = {}) {
  if (platform !== 'darwin' || !(release || share)) return { identity: null, notarize: false };
  const identity = env.CSC_NAME?.trim();
  if (!identity) {
    if (release) throw new Error('A Mac release needs a Developer ID. Set CSC_NAME, or build an ad-hoc signed dmg with --share (docs/publishing.md).');
    return { identity: '-', notarize: false };
  }
  if (identity.startsWith(DEVELOPER_ID_PREFIX)) throw new Error(`Set CSC_NAME without "${DEVELOPER_ID_PREFIX.trim()}", as in "Example Inc. (ABCDE12345)". electron-builder adds it.`);
  if (env.APPLE_ID || env.APPLE_APP_SPECIFIC_PASSWORD) throw new Error('Ri notarizes with an App Store Connect API key, not an Apple ID. Unset APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD.');
  const missing = ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'].filter(name => !env[name]?.trim());
  if (missing.length) throw new Error(`A Developer ID build is notarized, which needs ${missing.join(', ')} (docs/publishing.md).`);
  if (!fs.existsSync(env.APPLE_API_KEY)) throw new Error('APPLE_API_KEY must be the path to the App Store Connect key (.p8) file.');
  return { identity, codesignIdentity: `${DEVELOPER_ID_PREFIX}${identity}`, notarize: true, ...(env.CSC_KEYCHAIN ? { keychain: env.CSC_KEYCHAIN } : {}) };
}
