# Publishing Ri

How releases get from this repository to computers (docs/always-on-spec.md sections 5, 7 and 7.7). CI builds every platform and signs one feed. Installed copies check that feed, verify the signature, and update themselves by the rule in section 7.2.

## The feed's address

Every installation pins `https://releases.ri.app/` and the release public key in its `release-policy.json` on first install, for good (`src/lib/service/store.ts`). That host holds nothing. It answers every path with a temporary redirect to `https://github.com/dynamismlabs/ri/releases/download/feed/<path>`, and Ri's updater and the install script follow redirects (`secureFetch` in `src/lib/service/release-trust.ts`, `curl -L`). So the files can move to another host later without moving anyone, by changing where the redirect points. The address is `RI_RELEASE_FEED` in `.github/workflows/release.yml`.

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
| `install.sh` | The install script, with this feed and public key written in |
| `downloads-stable.json`, `downloads-latest.json` | What the website offers on each channel (below). Not signed |

The signed files cover `darwin` and `linux`, which is all the metadata format knows. Each names one runtime and, where the app can replace itself, one app file: the Mac zip or the AppImage. The Linux deb and the Windows installer have no feed entry. They are on the version's release, in `SHA256SUMS`, attested, and in the downloads lists.

Metadata expires after 30 days, so a frozen feed can't hold anyone back. A workflow signs everything again each Monday.

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

## The first release, in order

Nothing here can be undone cheaply once the first installation exists, so do it in this order.

1. **Point releases.ri.app at the feed, and check it.** It must answer with a temporary redirect (302 or 307) to the same path under `https://github.com/dynamismlabs/ri/releases/download/feed/`. Before anything is published GitHub answers that with 404, which is fine. What matters is the `location`:
   ```sh
   curl -sI https://releases.ri.app/install.sh | grep -i '^location: https://github.com/dynamismlabs/ri/releases/download/feed/install.sh'
   curl -sI https://releases.ri.app/stable-darwin-arm64.json | grep -i '^location: https://github.com/dynamismlabs/ri/releases/download/feed/stable-darwin-arm64.json'
   curl -sI https://ri.app/install | grep -i '^location:'
   ```
2. **Make the signing key.** `pnpm release:keygen` writes it to `~/.config/ri-release`. Save the private key (`release-signing.pem`) in your password manager now. Every installation trusts this one key, so losing it means no more updates for anyone, and leaking it lets someone else ship them. Add the public key: `gh variable set RI_RELEASE_PUBLIC_KEY < ~/.config/ri-release/release-public.pem`.
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
   - Add the signing key there, and nowhere else: `gh secret set RI_RELEASE_SIGNING_KEY --env release < ~/.config/ri-release/release-signing.pem`. Then delete the local file. The password manager holds the copy.
   - Required reviewers are optional. With them, each publish waits for your approval, and so does the Monday refresh. Metadata lasts 30 days, so approving a refresh every few weeks keeps installs working.
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

`desktop/publish-release.mjs` and `desktop/release-downloads.mjs` only write folders, so a full run can be tried against a local HTTPS server. `personal/always-on-acceptance/` has one.

## Known gaps

- **One signing key, with no rotation yet.** Every installation trusts the one public key it pinned. If the private key leaks, the only remedy today is a new feed, and every installation moving by hand. A later release can add a root key and key rotation through a normal update, as long as the current key is still safe when it ships. Until then, the key lives in the `release` environment and the password manager only.
- **Windows doesn't update itself, and isn't signed.** Its installer is attached to each release and listed for the website, with no feed entry, so people install newer versions by hand. Without a code signing certificate, Windows warns on first run ("Windows protected your PC"). `release.yml` has an optional signing step, off until a provider is chosen and its secret `WINDOWS_SIGNING_CREDENTIALS` added. The step then needs the provider's signing command, and refuses to publish until it has one.
- **The dmg itself isn't notarized.** The app inside it is signed, notarized and stapled, which is what Gatekeeper checks when it opens. A notarized dmg would also skip the check when the disk image opens.
- **The deb's app doesn't update itself.** A copy installed from the `.deb` belongs to the package manager, so the app never replaces itself (`desktop/shell-update.ts`) and says so when asked to update. People get a newer app by installing the newer deb. The runtime inside it, which runs the Home and serves the pages the app shows, is staged into the installation's store on first launch and updates from the feed like any other, so most changes still arrive without a new deb. An apt repository would let `apt upgrade` cover the app too.
- **The Linux builds run on the oldest Ubuntu GitHub still offers**, since native modules only work on systems at least as new as the one that built them. When GitHub retires `ubuntu-22.04`, move to the next one and note which servers that leaves behind.

GitHub Releases are free for a public repository, and so are its Actions minutes.
