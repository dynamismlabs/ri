---
title: Updates and channels
description: Ri updates itself when nothing is running, and you choose how soon you get new versions.
---

Ri keeps itself up to date without interrupting your agents. An update waits for a quiet moment, never stops a running chat, and you can always go back.

## How updates work

Ri checks for new releases shortly after it starts, then every 15 to 20 minutes. You can also check right away in Settings.

When a new version is ready, Ri downloads it in the background and checks it. A card at the bottom right shows the version and release notes. **View update** opens the full details in Settings. **Not now** postpones it for an hour, and **Update now** asks Ri to install it as soon as running work finishes.

Ri switches over after one minute of inactivity, once running work has finished. There is no countdown. Using Ri starts that quiet minute over. It updates on its own at most once every 12 hours.

Before it changes anything, Ri takes a snapshot of your database, so the update can be undone. The snapshot is kept until the next update, and for at most 7 days.

Updates apply to every Ri on the computer: your own and any team it hosts.

## Settings

In **Settings**, under **Updates**:

- **Automatic updates** is on to start. With it off, update when you choose, from here or with `ri update`.
- Under **Advanced**:
  - **Check for updates** and **Download update** do it now.
  - **Release channel** picks how soon you get new versions. See below.
  - **Limit downloads on this connection** pauses automatic downloads, for example on a phone hotspot. Ri doesn't detect metered networks by itself.
  - **Use a maintenance window** limits when an update may switch over.
  - **Go back to the previous version…** undoes the last update, after showing you what that would lose.

## Channels

| Channel | What you get |
| --- | --- |
| **Stable** | The default. A release moves here once it has proven itself on Latest. |
| **Latest** | Every release as it ships. |

Change it in **Settings**, or from a terminal with `ri update --channel latest` or `ri update --channel stable`.

**Alpha** builds are previews made from every change to Ri, for testing. They're sometimes broken, they don't update themselves, and they aren't a channel you can switch to. Install a newer alpha by hand when you want one.

## From a terminal

| Command | What it does |
| --- | --- |
| `ri update` | Gets the newest version now and switches every Ri on the computer once running chats finish. |
| `ri update --now` | Switches right away, which ends running chats. |
| `ri update --auto off` | Turns automatic updates off. `on` turns them back on. |
| `ri update --rollback` | Goes back one version, after showing what that would lose. |

## The desktop app

**Settings**, under **Updates**, manages the Ri you are connected to. If that Ri lives on a server, these are the server's settings. **This computer** shows local desktop and runtime updates. Updating your desktop does not restart a remote Ri.

The desktop app updates itself separately from your Ri. It downloads the new app in the background and switches the next time it opens. On a Mac, a copy of the app that isn't signed by Apple can't update itself: install a new copy from its `.dmg` instead. Your Ri inside it still updates itself either way.

On Windows, Ri doesn't update itself yet. Close Ri and run the newer installer. Your tasks, notes and chats stay.

On Linux, the AppImage updates itself. A copy installed from the `.deb` doesn't: install the newer `.deb` to update the app. Your Ri inside it still updates itself either way.

## Running from source

A source checkout updates only when you ask. Running `pnpm dev` does not download published updates.

To build and install releases from your checkout, run `ri update --from <folder>`. After that, `ri update` builds the newest committed version of `main`, from your checkout or its remote. It leaves uncommitted changes alone and waits for running chats before switching.

To return to published releases, run `ri update --from published`. Automatic updates then follow the setting in **Settings**, under **Updates**.

If this computer has only ever used a source build, install a published release first to configure its release feed.
