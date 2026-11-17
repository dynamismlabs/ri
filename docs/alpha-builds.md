# Alpha installers

The newest alpha installers built from `main` are on the
[`alpha` pre-release](https://github.com/dynamismlabs/ri/releases/tag/alpha).
These links never change, and they download without a GitHub account:

| Platform | Download |
| --- | --- |
| Mac, Apple silicon | [Ri-mac-arm64.dmg](https://github.com/dynamismlabs/ri/releases/download/alpha/Ri-mac-arm64.dmg) |
| Mac, Intel | [Ri-mac-x64.dmg](https://github.com/dynamismlabs/ri/releases/download/alpha/Ri-mac-x64.dmg) |
| Windows x64 | [Ri-Setup-x64.exe](https://github.com/dynamismlabs/ri/releases/download/alpha/Ri-Setup-x64.exe) |
| Linux x64 | [Ri-linux-x64.AppImage](https://github.com/dynamismlabs/ri/releases/download/alpha/Ri-linux-x64.AppImage), [Ri-linux-x64.deb](https://github.com/dynamismlabs/ri/releases/download/alpha/Ri-linux-x64.deb) |
| Linux arm64 | [Ri-linux-arm64.AppImage](https://github.com/dynamismlabs/ri/releases/download/alpha/Ri-linux-arm64.AppImage), [Ri-linux-arm64.deb](https://github.com/dynamismlabs/ri/releases/download/alpha/Ri-linux-arm64.deb) |

The release notes give the commit, date and run each file came from, and how to
open Ri on each platform. Send people these links rather than run artifacts.

## Building

Run **Alpha desktop builds** (`.github/workflows/alpha.yml`) manually from the
branch to share. `target: all` builds native installers for all five targets:

| Target | Runner | Artifact | Installer |
| --- | --- | --- | --- |
| macos-arm64 | macos-15 | ri-alpha-darwin-arm64 | DMG |
| macos-x64 | macos-15-intel | ri-alpha-darwin-x64 | DMG |
| linux-x64 | ubuntu-22.04 | ri-alpha-linux-x64 | Debian package and AppImage |
| linux-arm64 | ubuntu-22.04-arm | ri-alpha-linux-arm64 | Debian package and AppImage |
| windows-x64 | windows-2025 | ri-alpha-win32-x64 | NSIS .exe |

Each artifact also contains its runtime tarball. On Windows, this is the packaged
runtime payload, not an always-on headless installation. The installer is under
`desktop/`. GitHub requires sign-in to download Actions artifacts, even from a
public repository. Artifacts expire after 14 days.

Alpha always uses `--share`: free ad-hoc signing on macOS, unsigned Linux and
Windows installers, and no update feed. It never packages the optional speech
helper. The artifact-bound speech review process in `desktop/speech/RELEASE.md`
remains a separate publisher responsibility.

GitHub's Mac runners, mostly the Intel ones, sometimes keep the DMG's temporary
volume busy when dmgbuild unmounts it ("Resource busy"). `desktop/package.mjs`
then builds the installers once more and leaves a warning on the run. Each Mac
job also prints every change in which processes had that volume open, under
**Show which processes used the DMG volume**. Once a failure names the process
holding it, stop that before packaging, as is done for Spotlight, and remove the
watcher.

## The rolling alpha release

A run from `main` ends with **Publish the alpha release**
(`desktop/alpha-release.mjs`). It moves the `alpha` tag to the built commit,
gives each platform that passed its fixed name from the table above, replaces that
file on the release with `gh release upload --clobber` and rewrites the notes.
A platform that failed, or that the run didn't build, keeps its previous file,
and the notes say it is older. The notes keep each file's commit, date and run in
a hidden comment, which is how the next run knows. The upgrade fixture,
qualification reports and runtime tarballs stay in the run's artifacts.

Branch runs and `installer_run` retests publish nothing. The release is a
pre-release and never Latest, and `release.yml` only starts on `v*` tags, so the
`alpha` tag never publishes a real release. Only the publish job can write, using
the workflow's own token with `contents: write`.

That token can't hold GitHub's workflow permission, and without it GitHub won't
tag a commit whose workflow files differ from the current `main`. So if a
workflow file changes on `main` while a run is building, its publish job fails
before touching the release. Run the workflow again from `main`.

## Installer qualification

Enable `installer_checks` to test the actual installed bytes. It is off by
default, and these jobs never run because someone opens a pull request.
The native probes and desktop contracts run before packaging. Installer
artifacts are uploaded before the longer GUI checks, and a matching
`-qualification` artifact records reports and screenshots.

Windows checks install, first-run setup, ACLs, real tool installation, a test
harness chat, terminal and signed CLI use, task and note editing, process cleanup,
reopen, higher-version upgrade, and uninstall while preserving the Home.
The extra higher-version installer is a separate `-upgrade-fixture` artifact,
not an end-user download.

Mac and Linux checks install the real DMG or Debian package, verify native
dependencies and runtime contents, choose a Home, install Codex, chat through a
test harness, edit tasks and notes, and quit, reinstall and reopen with data
preserved. Linux also checks AppImage extract-and-run with Chromium sandboxing
and Debian removal while keeping the Home. Native supervisor checks require an
explicit disposable GitHub-hosted account opt-in. Never run these installer
scripts on the production computer.

To repeat checks without rebuilding unchanged installers, choose their `target`,
enable `installer_checks`, and set `installer_run` to the original alpha run ID.
The source run must include its Windows upgrade fixture for Windows lifecycle
checks. Retests download those exact bytes and upload only new qualification
reports. They do not republish the installer archives.

## Platform limits

Mac requires macOS 13.5 or newer. After opening Ri once, use System Settings,
Privacy & Security, Open Anyway if macOS blocks it. Native Mac notifications
need an Apple-issued signing identity and are unavailable in these builds.

Linux builds use Ubuntu 22.04 as the baseline. FUSE mounting, other distributions
and actual recipient hardware need separate checks.

Windows currently targets Intel and AMD x64. Its Home runs while Ri is open.
Scheduled Task startup, background operation after app exit, self-updates and
speech are unavailable. Close Ri before replacing it with a newer installer.
The installer and uninstaller keep the Home. Windows ARM and real provider
account sign-in/chat need separate qualification.

## Consolidation notes

The Windows port keeps the newer main settings, updates, local loopback and
packaging behavior on Mac and Linux. Windows Install and Sign in use the shared
desktop harness helper rather than a second UI and IPC implementation. The
agentex 0.0.50 patch preserves main's OpenCode isolation fix and adds the reviewed
Windows npm-shim and skill-junction fixes. The source branch is pushed to
agentex's own origin without publishing a library version.

The separate Mac/Linux preview workflows and Windows job in `desktop.yml` are
retired in favor of alpha. Old qualification records remain in
`macos-preview.md`, `linux-preview.md`, and `windows-first-version.md` as evidence
of the earlier bytes. Windows edits to the removed in-repository app kit and
included-app staging scripts are left behind because personal apps now live in
their own repositories. The public runtime metadata permission fix is retained,
while Home credentials remain private.

## Consolidation validation

On November 16, 2026, the consolidated branch passed typecheck, scoped lint,
native SQLite/vector, canvas, sharp and PTY probes, 626 desktop tests, and 17
focused service/runtime tests. Frozen installation applied the combined agentex
patch successfully.

After merging newer main through `52f52c33`, the combined source also passed
typecheck, all 626 desktop tests and 225 focused service/runtime and task
lifecycle tests. This preserves the newer chat, recurrence and feedback work.

The complete source suite was not green: the branch had 46 failing tests and
clean main at `7533ab91` had 43. The stable failures reproduced on main. Six
cases covering the differences, including first-message recovery, heartbeat
speed and browser interaction timing, passed in focused reruns on both trees.
No reproducible new source-test failure was found. Installer qualification is
recorded separately for the actual uploaded bytes.

### Qualified Mac installers

Both native Mac targets passed all nine installer checks in
[alpha run 43919521165](https://github.com/treyhuffine/ai-task-manager/actions/runs/43919521165),
built from `dc7be024` on November 16, 2026. The checks installed the real DMGs,
verified signatures and native modules, completed GUI setup, installed Codex,
edited tasks and notes, dispatched a stand-in harness chat, and preserved data
after replacing and reopening the app. Each runtime inventory checked 100,091
payload files with no private Home, environment or Git files or update policy.
Reports and reopened-note screenshots were reviewed.

| Target | Installer download | Qualification report |
| --- | --- | --- |
| Mac Apple silicon | [Artifact ZIP](https://github.com/treyhuffine/ai-task-manager/actions/runs/43919521165/artifacts/14255978938) | [9 checks passed](https://github.com/treyhuffine/ai-task-manager/actions/runs/43919521165/artifacts/14256919540) |
| Mac Intel | [Artifact ZIP](https://github.com/treyhuffine/ai-task-manager/actions/runs/43919521165/artifacts/14257126088) | [9 checks passed](https://github.com/treyhuffine/ai-task-manager/actions/runs/43919521165/artifacts/14258135144) |

| Installer | SHA-256 |
| --- | --- |
| `Ri-0.1.0-arm64.dmg` | `9d14b8c8d1ad662ed480079dc2f28b7ead438c6acc69d210682abf26ab44da77` |
| `Ri-0.1.0.dmg` | `a26aa1ba1e2522d4ec7969b34514372bfabf259b148ce54668c918775d47d4df` |

Download [Ri-mac-arm64.dmg](https://github.com/dynamismlabs/ri/releases/download/alpha/Ri-mac-arm64.dmg) or
[Ri-mac-x64.dmg](https://github.com/dynamismlabs/ri/releases/download/alpha/Ri-mac-x64.dmg), open it and drag Ri into Applications. Open it once. If blocked, use System Settings,
Privacy & Security, Open Anyway. Complete setup and test a real provider sign-in
and chat. Browser-downloaded Gatekeeper handling, real accounts and recipient
hardware remain manual checks. These builds require macOS 13.5 or newer.

The combined run is marked failed because its original Windows attempt failed
before producing an installer. All four Mac and Linux jobs succeeded. Windows
qualification uses a targeted retry instead of rebuilding those unchanged apps.

### Qualified Linux installers

Both native Linux targets passed all 11 installer lifecycle checks in
[alpha run 43919521165](https://github.com/treyhuffine/ai-task-manager/actions/runs/43919521165),
built from `dc7be024` on November 16, 2026. The runtime inventory checked 85,805
payload files per target and found no private Home, environment or Git files
and no configured update feed. The reports and screenshots show the authored
note after reinstalling and reopening.

| Target | Installer download | Qualification report |
| --- | --- | --- |
| Linux x64 | [Artifact ZIP](https://github.com/treyhuffine/ai-task-manager/actions/runs/43919521165/artifacts/14253733119) | [11 checks passed](https://github.com/treyhuffine/ai-task-manager/actions/runs/43919521165/artifacts/14255370755) |
| Linux arm64 | [Artifact ZIP](https://github.com/treyhuffine/ai-task-manager/actions/runs/43919521165/artifacts/14255275247) | [11 checks passed](https://github.com/treyhuffine/ai-task-manager/actions/runs/43919521165/artifacts/14254608151) |

| Installer | SHA-256 |
| --- | --- |
| `ri-desktop_0.1.0_amd64.deb` | `588951d21bc2be78d8a3cd65625619dfcf70cbb5677010d39fac45af86dbd5b5` |
| x64 `Ri-0.1.0.AppImage` | `860ba9ca6f2d91d94c0f498865122b7c6abfa359570b74cfab250c7380f28b35` |
| `ri-desktop_0.1.0_arm64.deb` | `73523bdd125c0540af68817152e7ad237e6d2b5a4328cc8bba5b9b2626393161` |
| arm64 `Ri-0.1.0-arm64.AppImage` | `c79420c7612abc5dac01eb7ff456eae10676e476141c8475264009b979e66161` |

Download [Ri-linux-x64.deb](https://github.com/dynamismlabs/ri/releases/download/alpha/Ri-linux-x64.deb) or
[Ri-linux-arm64.deb](https://github.com/dynamismlabs/ri/releases/download/alpha/Ri-linux-arm64.deb) and open it on Ubuntu or Debian. Complete setup,
sign into a real coding tool, create a task and note in chat, and check them
after quitting and reopening. Actual provider accounts, recipient hardware,
other distributions and FUSE mounting were not exercised by these runner checks.

### Qualified Windows installer

Windows x64 passed all 21 native lifecycle checks in
[alpha run 43925855602](https://github.com/treyhuffine/ai-task-manager/actions/runs/43925855602),
built from `0ac849d7` on November 16, 2026.
[Download the normal installer artifact](https://github.com/treyhuffine/ai-task-manager/actions/runs/43925855602/artifacts/14259216413).
The [qualification report and screenshot](https://github.com/treyhuffine/ai-task-manager/actions/runs/43925855602/artifacts/14258849897)
were reviewed. The separate upgrade fixture is for CI only.

The checks installed NSIS into a path with spaces and Unicode, completed GUI
setup and migrations, verified NTFS access, installed real Codex 0.169.0 and
Claude Code 2.1.325, dispatched a stand-in chat, edited tasks and notes, and ran
the signed CLI in the PowerShell terminal. Windows used the installed bundle
directly without staging a shared runtime release. Quit stopped all owned
processes. Reopen and a higher-version installer kept the data, and uninstall
kept the Home database.

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `Ri-Setup-0.1.0-x64.exe` | 282,709,813 | `11d344fd66c2dc0955bc6caf1ce77f05d7b4a7b0d904e114ae88bab288ae3d1d` |
| `ri-runtime-0.1.0-win32-x64.tar.gz` | 457,276,514 | `9523e6bf80969da666c27843d20a51d53443bc8a7fc152c5dc23934effa59e62` |

An independent read-only audit of the downloaded artifact checked 85,345
runtime archive files, including 85,344 manifest entries. It found no private
Home databases, environment files, Git metadata, private configuration or update
policy. The runtime payload is 1,902,869,682 bytes. The downloaded installer hash
matches the one exercised by the runner. No packaged app was started locally.

For the HP, no terminal commands are needed:

1. In Settings, System, About, confirm 64-bit Intel/AMD Windows 10 version 1809
   or newer, or Windows 11. Windows 7 and 8 cannot run this build.
2. Download [Ri-Setup-x64.exe](https://github.com/dynamismlabs/ri/releases/download/alpha/Ri-Setup-x64.exe) and open it.
   If Windows blocks it, choose **More info**, then **Run anyway**. Installation can take several minutes.
3. Start a new Ri, install Claude Code or Codex using its button, and sign in.
   Ask it to create a task and a note. Open and edit the note, then complete the task.
4. Close and reopen Ri and confirm both remain. Try a replacement installer
   when supplied, then check the same records again. Report the Windows version,
   coding tool and first step that failed. A photo is enough.

Real provider sign-in and model requests, Codex's account-dependent Windows
sandbox, SmartScreen interaction and the HP's hardware remain manual checks.
The preview's app-open lifetime, manual updates and unsigned installation remain
intentional limits. Native Windows supervision and signing can follow separately.
