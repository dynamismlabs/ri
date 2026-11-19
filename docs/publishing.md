# Publishing Ri

How releases get from this repository to computers (docs/always-on-spec.md sections 5, 7 and 7.7). CI builds every platform and signs one feed. Installed copies check that feed, verify the signature, and update themselves by the rule in section 7.2.

## The feed's address

Every installation pins `https://releases.ri.app/` and the release root public key in its `release-policy.json` on first install, for good (`src/lib/service/store.ts`, and "Signing keys" below). That host holds nothing. It answers every path with a temporary redirect to `https://github.com/dynamismlabs/ri/releases/download/feed/<path>`, and Ri's updater and the install script follow redirects (`secureFetch` in `src/lib/service/release-trust.ts`, `curl -L`). So the files can move to another host later without moving anyone, by changing where the redirect points. The address is `RI_RELEASE_FEED` in `.github/workflows/release.yml`.

People install with `curl -fsSL https://ri.app/install | sh`. The website redirects that to the feed's `install.sh`.

The signed metadata names each version's files by their GitHub address, so downloads go straight to the version's release.

## What gets published

Each version is a GitHub Release tagged `vX.Y.Z`, holding the files people and updaters download:

| File | For |
| --- | --- |
| `ri-runtime-<version>-<platform>-<arch>.tar.gz` | The install script and automatic updates, Mac and Linux |
| `Ri-<version>-arm64.dmg`, `Ri-<version>.dmg` | People installing the Mac app, Apple silicon and Intel |
| `Ri-<version>-arm64.AppImage`, `Ri-<version>.AppImage` | People installing the Linux app, arm64 and x64. It updates itself |
| `ri-desktop_<version>_arm64.deb`, `ri-desktop_<version>_amd64.deb` | People installing on Ubuntu or Debian, with `sudo apt install ./ri-desktop_<version>_amd64.deb`. No feed entry: the app is updated by installing the newer deb, while the runtime inside it updates from the feed |
| `Ri-Setup-<version>-x64.exe` | People installing on Windows. It has no feed entry and doesn't update itself yet |
| `Ri-<version>-*-mac.zip`, `*.yml` and `*.blockmap` | The desktop app updating itself. Mac only with a Developer ID |
| `SHA256SUMS` | The checksum of every installer, runtime and app archive above |
| `downloads.json` | This version's downloads, for the website. Promoting copies it to stable |

One more release, tagged `feed`, holds the signed metadata and the website's downloads lists. Its files are replaced as new versions ship, at stable addresses:

| File | What it says |
| --- | --- |
| `stable-<platform>-<arch>.json`, `latest-<platform>-<arch>.json` | The newest release on that channel |
| `<version>-<platform>-<arch>.json` | That version, which a connected computer asks for by number |
| `index-<platform>-<arch>.json` | Every version kept and what each can talk to, for finding a bridge release |
| `keys.json` | The keys allowed to sign the files above, signed by the root key ("Signing keys" below) |
| `install.sh` | The install script, with this feed and the root public key written in |
| `downloads-stable.json`, `downloads-latest.json` | What the website offers on each channel (below). Not signed |

The signed files cover `darwin` and `linux`, which is all the metadata format knows. Each names one runtime and, where the app can replace itself, one app file: the Mac zip or the AppImage. The Linux deb and the Windows installer have no feed entry. They are on the version's release, in `SHA256SUMS`, attested, and in the downloads lists.

Metadata expires after 30 days, so a frozen feed can't hold anyone back. A workflow signs everything again each Monday. The keys file doesn't expire (below).

## Downloads for the website

The website (ri.app, its own repository) reads one file per channel, so it never has to know how releases are laid out. Their shape is a contract with the site. Change it only by adding a new `format`.

```json
{
  "format": 1,
  "channel": "stable",
  "version": "0.2.0",
  "commit": "abc1234",
  "publishedAt": "2026-11-19T12:00:00Z",
  "notesUrl": "https://github.com/dynamismlabs/ri/releases/tag/v0.2.0",
  "files": [
    { "platform": "mac", "arch": "arm64", "kind": "dmg", "name": "Ri-0.2.0-arm64.dmg", "url": "https://github.com/...", "sha256": "...", "size": 123, "commit": "abc1234", "builtAt": "2026-11-19T11:00:00Z" }
  ]
}
```

`platform` is `mac`, `windows` or `linux`, `arch` is `arm64` or `x64`, and `kind` is `dmg`, `exe`, `appimage`, `deb` or `runtime`. Commits are the short form. Times are UTC to the second. `publishedAt` is when the version was published, and each file's `builtAt` is when its platform's build finished. Files are listed Mac, Windows, Linux, arm64 before x64.

| File | Where | Written |
| --- | --- | --- |
| `downloads-latest.json` | `feed` release | When a version is published |
| `downloads-stable.json` | `feed` release | When a version is promoted |
| `downloads.json` | `alpha` release | Every alpha publish. Its `channel` is `alpha`, and its files can come from different runs, each with its own `commit` and `builtAt` |

The lists follow the feed. A channel with nothing to install has no file: stable before the first promote, and any channel whose version was withdrawn, until the next version replaces it. The site should treat a missing file as "nothing on this channel yet".

`desktop/release-downloads.mjs` writes them, and every publish, promote, withdraw and alpha publish ends by calling the site's deploy hook, so it rebuilds with the new list.

## Checking a download

Each version release and the alpha release carry `SHA256SUMS`. In the folder holding the download:

```sh
shasum -a 256 -c SHA256SUMS --ignore-missing    # sha256sum on Linux
```

Each file also has a provenance attestation from the workflow run that built it, which says which commit and workflow made those exact bytes:

```sh
gh attestation verify Ri-0.2.0-arm64.dmg --repo dynamismlabs/ri
```

## Signing keys

Release metadata is signed in two layers, after The Update Framework's root and targets roles, kept as small as they can be (`desktop/release-keys.mjs`):

| Key | Signs | Lives |
| --- | --- | --- |
| **Root** | The keys file, and nothing else | Offline, in your password manager. Never in CI or GitHub. Its public half is the `RI_RELEASE_PUBLIC_KEY` variable, and every installation pins it for good |
| **Online** | Every channel, version and index file on the feed | The `RI_RELEASE_SIGNING_KEY` secret in the `release` environment, and nowhere else |

The **keys file**, `desktop/release-keys.json`, lists the online keys allowed to sign, with a version that only goes up. It is committed, and every publish, promote, withdraw and refresh uploads it to the feed as `keys.json`. Anyone who can push can change the file, but only the root key can make one an installation accepts.

Every signed file on the feed is an envelope that names its key:

```json
{ "keyid": "1a2b3c4d5e6f7a8b", "payload": "<base64 JSON>", "signature": "<base64 Ed25519 signature of the payload's bytes>" }
```

A key's id is the first 16 hex digits of the SHA-256 of its public key (SPKI, DER). The keys file is the same envelope signed by the root, and its payload is `{ "format": 1, "version": 3, "keys": [{ "id": "…", "publicKey": "-----BEGIN PUBLIC KEY-----…" }] }`, newest key last.

**What an installation keeps.** `release-policy.json` (`{ "format": 2, "feed", "rootKey" }`) comes with the first release a computer installs and never changes there. Beside it, `release-keys-version` holds the highest keys version the computer has seen, as `release-sequence-<channel>` holds each channel's newest pointer. Every check fetches `keys.json` first, checks the root's signature, refuses a version lower than the one held and saves a higher one, then checks the release against a key the file lists (`src/lib/service/release-trust.ts`). The install script runs the same check with the root key written into it, before it stores anything (`src/lib/service/install-release.ts`).

**The keys file never expires, on purpose.** Release metadata expires after 30 days, which already stops a frozen feed holding a computer back. An expiring keys file would add a second clock that only the offline root key can reset, and forgetting it once would stop every installation updating. What it would guard against is a computer that never saw a revocation being served the keys file from before it, which needs both the revoked key and control of the feed, and is over once the computer sees the newer file.

**Publishing checks the chain before it signs.** `desktop/publish-release.mjs` reads this checkout's keys file and the feed's, checks both against the root public key, and uses the newer one, so the feed's never goes back. It refuses to sign with an online key that file doesn't list. The release workflow runs the same check (`publish-release.mjs check`) as its first job, before any build, so an unlisted key fails in a minute instead of after hours. Each run also signs again any file on the feed whose key the keys file no longer lists, so the feed is whole after every run.

### Rotating the signing key

Whenever you like, and whenever the key might have been somewhere it shouldn't:

1. Copy the root key from your password manager to a file, and run `pnpm release:rotate --root-key <that file>`. It makes a new online key in `~/.config/ri-release`, writes the next version of `desktop/release-keys.json`, and prints the exact commands for the next two steps.
2. Commit `desktop/release-keys.json` and push it to main.
3. `gh secret set RI_RELEASE_SIGNING_KEY --env release < ~/.config/ri-release/release-signing-<id>.pem`. Then delete that file, and the root key's.

The key it replaces stays listed until the rotation after, so everything that key signed stays valid. The next publish or Monday's refresh puts the new keys file on the feed, and the refresh signs every file again with the new key. Nothing changes on any computer. Commit before you set the secret. The other way round, a run in between would find the new key unlisted and stop before changing anything.

### Revoking a key

If an online key leaked, or might have:

1. `pnpm release:rotate --root-key <file> --revoke <id>`. The id is in the key's file name, and every run's log names the key it signed with. The new version lists only the new key.
2. Commit, push and set the secret, as above.
3. Sign the feed again now: `gh workflow run release.yml -f action=refresh`. It uploads the new keys file and signs every file on the feed with the new key. Each computer stops trusting the revoked key at its next check, within 6 hours, and never trusts it again, since it refuses an older keys file.

The refresh trusts what is already on the feed. If whoever had the key could also upload to the `feed` release, check it holds only what you published before running it: `gh release view feed` for unexpected uploads, and every version in the index pointing at its own release's runtime.

### If the root key is lost or leaked

Every installation pins the root public key, and the root vouches for everything else, so no update can fix either case.

- **Lost:** nothing stops yet. The online key keeps publishing, but no new keys file can be signed, so it can never be rotated or revoked. Move to a new root while it is still safe.
- **Leaked:** whoever has it can sign a keys file listing their own key, with a higher version, and every installation would accept it. Move to a new root at once, and tell people.

Moving to a new root means installing again everywhere. Move the old `desktop/release-keys.json` aside, run `pnpm release:keygen`, set the new `RI_RELEASE_PUBLIC_KEY` and `RI_RELEASE_SIGNING_KEY`, commit, and publish. Existing installations then fail every update check, with "not signed by the root key this installation trusts". On each computer, delete `release-policy.json` and `release-keys-version` from the installation's runtime folder (`~/Library/Application Support/Ri/runtime` on a Mac, `~/.local/share/ri/runtime` on Linux), then run the install script again (`curl -fsSL https://ri.app/install | sh`) or install the app again. A release can't make that move itself, since an installation never changes its `release-policy.json`.

## The first release, in order

Nothing here can be undone cheaply once the first installation exists, so do it in this order.

1. **Point releases.ri.app at the feed, and check it.** It must answer with a temporary redirect (302 or 307) to the same path under `https://github.com/dynamismlabs/ri/releases/download/feed/`. Before anything is published GitHub answers that with 404, which is fine. What matters is the `location`:
   ```sh
   curl -sI https://releases.ri.app/install.sh | grep -i '^location: https://github.com/dynamismlabs/ri/releases/download/feed/install.sh'
   curl -sI https://releases.ri.app/stable-darwin-arm64.json | grep -i '^location: https://github.com/dynamismlabs/ri/releases/download/feed/stable-darwin-arm64.json'
   curl -sI https://ri.app/install | grep -i '^location:'
   ```
2. **Make the keys.** `pnpm release:keygen` writes the root key, its public half and the first online signing key to `~/.config/ri-release`, and keys version 1 to `desktop/release-keys.json` ("Signing keys" above). It prints these steps with the exact file names:
   - Save the root key (`release-root.pem`) in your password manager now, then delete the file. Every installation trusts it for good. Losing it means the signing key can never be replaced, and leaking it lets someone else ship updates.
   - Add its public half: `gh variable set RI_RELEASE_PUBLIC_KEY < ~/.config/ri-release/release-root-public.pem`.
   - Commit `desktop/release-keys.json`.
3. **Add the Apple secrets.** With a Developer ID ($99 a year from Apple):
   - In Xcode or the developer site, create a **Developer ID Application** certificate and export it with its private key as a `.p12`.
   - In App Store Connect, under Users and Access, Integrations, create a team API key with the Developer role. Download the `.p8` (it downloads once) and note its Key ID and the Issuer ID.
   ```sh
   base64 -i DeveloperIDApplication.p12 | gh secret set CSC_LINK
   gh secret set CSC_KEY_PASSWORD                      # the .p12's password
   gh secret set APPLE_API_KEY < AuthKey_ABC123DEF4.p8  # the file's contents
   gh secret set APPLE_API_KEY_ID --body ABC123DEF4
   gh secret set APPLE_API_ISSUER --body <issuer id>
   gh variable set APPLE_TEAM_ID --body ABCDE12345
   gh variable set CSC_NAME --body "Example Inc. (ABCDE12345)"   # the certificate's name, without "Developer ID Application:"
   ```
   These are repository secrets, since the build jobs of both workflows sign. With none of them, Mac builds stay ad-hoc signed. With only some, the build stops and names what's missing. To check them before a release, run **Alpha desktop builds** with `target: macos-arm64`. Its **Check the signature, notarization and Gatekeeper** step should pass.
4. **Create the `release` environment.** Settings, Environments, New environment, `release`. The publish and feed jobs run in it.
   - Under deployment branches and tags, allow only the `main` branch and tags matching `v*`.
   - Add the online signing key there, and nowhere else: `gh secret set RI_RELEASE_SIGNING_KEY --env release < ~/.config/ri-release/release-signing-<id>.pem`. Then delete the local file. It needs no other copy: if it's lost, rotate to a new one.
   - Required reviewers are optional. With them, each publish waits for your approval twice, once for the key check before building and once before uploading, and the Monday refresh once. Metadata lasts 30 days, so approving a refresh every few weeks keeps installs working.
   - A tag ruleset that lets only you create `v*` tags stops anyone else from starting a release.
5. **Add the website's deploy hook.** In the Vercel project, Settings, Git, Deploy Hooks, create one for `main`, then `gh secret set VERCEL_DEPLOY_HOOK`. It's a repository secret because alpha publishes call it too. Without it, publishing skips that step.
6. **Run the full desktop workflow.** Run **Desktop and headless runtime** on main (Actions, then Run workflow) and wait for it to pass. It's the full run of the packaged app on all four Mac and Linux platforms, which pull requests don't wait on.
7. **Tag the version.** As in "Publishing a version" below.
8. **Promote it.** The install script and new installations start on `stable`, so promote the very first release once it's up. Then check the whole path from a clean computer:
   ```sh
   curl -fsSL https://releases.ri.app/downloads-stable.json
   curl -fsSL https://ri.app/install | sh
   ```

## Publishing a version

First run **Desktop and headless runtime** on main and wait for it to pass.

```sh
npm version 0.2.0 --no-git-tag-version
git commit -am "chore: release 0.2.0"
git tag v0.2.0
git push origin main v0.2.0
```

CI builds all five platforms (Mac arm64 and x64, Linux x64 and arm64 as an AppImage and a deb, Windows x64). A Mac build with a Developer ID is signed, notarized, stapled and checked by Gatekeeper before anything uploads. Then the publish job writes `SHA256SUMS`, attests every file, signs the feed for `latest`, creates the version's release, writes `downloads-latest.json` and rebuilds the website. The notes come from the `feat:` and `fix:` commit subjects since the previous tag. Everyone on `latest` updates at their next quiet moment.

When it has proven itself, run the **Publish a release** workflow by hand with `promote` and the version, which moves `stable` to it and writes `downloads-stable.json`.

To pull a bad release, run it with `withdraw` and the version. Nothing moves to it again, publishing a newer one gets everyone off it, and the website stops offering it on any channel it was the newest on.

A version can only be published once. To fix a mistake, publish the next one.

## Installing

```sh
curl -fsSL https://ri.app/install | sh
ri start
```

Or download the app for Mac, Windows or Linux from the newest release.

## A dmg by hand

`pnpm desktop:dmg` makes a dmg at `release/desktop/`. With no Developer ID it is ad-hoc signed, with no key and no account needed. Someone opening it for the first time has to allow it in System Settings under Privacy & Security, and it has no feed, so it never updates by itself. Installing a published copy of the app later, or running the install script, connects that computer to the feed, and its Ri starts updating. Build it on the same kind of Mac as the person it's for (Apple silicon or Intel).

With `CSC_NAME` set and the certificate in your keychain, the same command signs it with the Developer ID and notarizes it, which also needs `APPLE_API_KEY` (the `.p8` file's path), `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`. Packaging checks those before it builds anything (`macSigning` in `desktop/package-preflight.mjs`).

## Working from a checkout

`ri update --from <checkout>` builds your own releases instead, with no feed involved (spec section 8). `ri update --from published` goes back.

## Trying it without publishing

`desktop/publish-release.mjs` and `desktop/release-downloads.mjs` only write folders, so a full run can be tried against a local HTTPS server. `personal/always-on-acceptance/` has one. Make throwaway keys outside the checkout with `node desktop/release-keys.mjs keygen --dir <folder> --keys <folder>/keys.json`, build with `RI_RELEASE_PUBLIC_KEY_FILE=<folder>/release-root-public.pem`, and give `publish-release.mjs` `--root-key <folder>/release-root-public.pem --keys <folder>/keys.json --private-key <folder>/release-signing-<id>.pem`.

## Known gaps

- **The root key can't be replaced through an update.** Every installation pins it, so losing it ends rotation, and leaking it means every installation installs again ("If the root key is lost or leaked"). The Update Framework lets a root sign its successor, which could be added while the root is safe. It isn't built: with a single root key, whoever held a leaked copy could sign a successor too.
- **Windows doesn't update itself, and isn't signed.** Its installer is attached to each release and listed for the website, with no feed entry, so people install newer versions by hand. Without a code signing certificate, Windows warns on first run ("Windows protected your PC"). `release.yml` has an optional signing step, off until a provider is chosen and its secret `WINDOWS_SIGNING_CREDENTIALS` added. The step then needs the provider's signing command, and refuses to publish until it has one.
- **The dmg itself isn't notarized.** The app inside it is signed, notarized and stapled, which is what Gatekeeper checks when it opens. A notarized dmg would also skip the check when the disk image opens.
- **The deb's app doesn't update itself.** A copy installed from the `.deb` belongs to the package manager, so the app never replaces itself (`desktop/shell-update.ts`) and says so when asked to update. People get a newer app by installing the newer deb. The runtime inside it, which runs the Home and serves the pages the app shows, is staged into the installation's store on first launch and updates from the feed like any other, so most changes still arrive without a new deb. An apt repository would let `apt upgrade` cover the app too.
- **The Linux builds run on the oldest Ubuntu GitHub still offers**, since native modules only work on systems at least as new as the one that built them. When GitHub retires `ubuntu-22.04`, move to the next one and note which servers that leaves behind.

GitHub Releases are free for a public repository, and so are its Actions minutes.
