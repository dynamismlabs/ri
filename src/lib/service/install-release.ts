/**
 * The last step of the install script (docs/always-on-spec.md section 5): check a
 * downloaded release against the publisher's keys and its own manifest, store it, and
 * write the `ri` command. It touches no Home. `ri start` does that.
 */
import fs from 'node:fs';
import path from 'node:path';
import { writeOrigin } from './origin';
import { rememberReleaseKeys, seenKeysVersion, verifyRelease, verifyReleaseKeys } from './release-trust';
import { commandLauncherPath, installCommandLauncher } from './runtime';
import { verifyRuntime } from './runtime-manifest';
import { stageRelease } from './store';

/** `keysEnvelope` is the feed's keys file and `rootKey` the root public key the script
 * carries: the root vouches for the keys, and a listed key for the release. */
export function installPublishedRelease(resources: string, envelope: unknown, keysEnvelope: unknown, rootKey: string, channel: 'stable' | 'latest' = 'stable') {
  const keys = verifyReleaseKeys(keysEnvelope, rootKey, seenKeysVersion());
  const release = verifyRelease(envelope, { keys, channel });
  const manifest = verifyRuntime(resources);
  if (manifest.id !== release.runtime.id || manifest.version !== release.version) throw new Error('This download is not the release its publisher signed.');
  // The release must trust the root the script does, or its updates would come from someone else.
  const policyFile = path.join(/* turbopackIgnore: true */ resources, 'release-policy.json');
  if (!fs.existsSync(/* turbopackIgnore: true */ policyFile)) throw new Error('This release has no publisher settings, so it could never update itself.');
  const policy = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ policyFile, 'utf8')) as { rootKey?: string };
  if (policy.rootKey?.trim() !== rootKey.trim()) throw new Error('This release trusts a different publisher than this script.');
  stageRelease(resources);
  // From here on this computer refuses an older keys file than the one it installed with.
  rememberReleaseKeys(keys);
  writeOrigin({ source: 'published', channel });
  const launcher = installCommandLauncher();
  return { version: release.version, id: manifest.id, launcher, command: commandLauncherPath() };
}
