---
title: Install Ri
description: Get Ri on your Mac, Windows or Linux computer, or on a server that stays on.
---

Ri runs on one computer. That computer holds your data and runs your agents, and your phone and other computers connect to it. The computer you use every day is fine to start with. A computer that stays on, like a Mac mini or a server, keeps your agents working while your laptop sleeps, and you can [move your Home](/docs/guides/data-and-backups) there later.

You also need an account for at least one AI tool, like Claude or ChatGPT. Ri runs your agents on the plans you already have. See [Harnesses](/docs/guides/harnesses).

## The desktop app

Download Ri for your computer from [ri.app](https://ri.app) and open it.

| Computer | What you need | What you download |
| --- | --- | --- |
| Mac | macOS 13.5 or newer, Apple silicon or Intel | A `.dmg`. Open it and drag Ri to Applications. |
| Windows | 64-bit Windows 10 version 1809 or newer, Intel or AMD | An installer, `Ri-Setup` followed by the version. |
| Linux | x64 or arm64. Ri is built and tested on Ubuntu 22.04. | An `.AppImage`. Make it executable, then open it. |

When Ri opens, it asks how to use this computer:

- **Start a new Ri** keeps your data and runs your agents here. Choose this the first time.
- **Connect to Ri** uses a Ri you already run on another computer. You paste a pairing link from that Ri. See [Your phone and other devices](/docs/getting-started/devices).
- **Create a team** sets up a shared place for work with other people. See [Teams](/docs/concepts/teams).

If this computer already has a Ri, you also see **Use existing Ri on this computer**.

The first start puts Ri's server in place, which can take a few minutes. Then your Ri opens and the [first run](/docs/getting-started/first-run) begins.

### When you close the window

On a Mac and on Linux, Ri keeps running after you close the window, and after you quit the app. It starts again when you log in and comes back after a crash, so your agents keep working. You'll find it in the menu bar or the system tray. To stop it, choose **Stop This Device's Service** in the **Tools** menu, or run `ri stop`.

### Windows is a preview

On Windows, Ri runs only while the app is open. Closing the window stops your Ri and its agents. Ri doesn't start when you log in, doesn't update itself, and has no local speech. To update, close Ri and run the newer installer. Your tasks, notes and chats stay on the computer.

## On a server

Run Ri on a Mac mini, a Linux server, or any Mac or Linux computer that stays on:

```sh
curl -fsSL https://ri.app/install | sh
ri start
```

The installer asks no questions. It checks the download's signature and every file before it installs anything, then puts the `ri` command in `~/.local/bin` and adds that folder to the front of your PATH in your shell's profile. Open a new terminal before you run `ri start`.

The first time, `ri start` asks whether to **Start using Ri here** or **Connect to your existing Ri**. Starting here creates your Home in `~/ri` and sets Ri to run in the background: it keeps running after the terminal closes and starts again after a restart. It prints the address Ri runs at, which is port 4224, and a pairing link that opens Ri in your browser.

Ri on a server listens on your network over plain HTTP. To reach it from your phone or from outside your network, give it an HTTPS address. See [Your phone and other devices](/docs/getting-started/devices).

To get new versions as soon as they ship, install from the Latest channel:

```sh
curl -fsSL https://ri.app/install | sh -s -- --channel latest
```

See [Updates and channels](/docs/guides/updates) and [Keep Ri running on a computer that stays on](/docs/guides/always-on).

## Preview builds

Alpha builds come from every change to Ri. They're for testing, sometimes broken, and they don't update themselves. Use them only if you want to try what's next and can install a newer one by hand.
