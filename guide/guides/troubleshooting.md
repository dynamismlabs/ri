---
title: Troubleshooting
description: How to find out what's wrong with your Ri, and fixes for the problems people run into most.
---

Start by asking your main chat. It reads these docs and can often tell you what's going on. If Ri itself won't open, the steps below work from a terminal or from the desktop app's menus.

## Check Ri's health

On the computer that runs your Ri:

| Command | What it tells you |
| --- | --- |
| `ri doctor` | Checks your Home's folder, database and key, whether port 4224 is free, voice, the agent browser, whether Ri is kept running, free disk space, whether `ri` itself is the right command, and the computer's own settings for staying on. Each problem comes with what to do. |
| `ri status` | Which Homes this computer runs, whether each is running, and its version. |
| `ri logs` | The latest lines of Ri's log. Add `-f` to keep following it. The log itself is `.work/service.log` in your Home's folder. |

In the desktop app, the **Tools** menu has **Service Status…**, with **Copy diagnostics** to paste into a bug report, and **Local Installation and Recovery…** for when Ri won't start.

## Typing ri opens Ruby's documentation

A Mac comes with Ruby's documentation tool, also called `ri`, in `/usr/bin`. If your terminal finds that one first, typing `ri` shows Ruby's help instead of running Ri.

Ri's installer checks which `ri` a new terminal runs, and when it isn't Ri's, it adds two lines to the end of your shell's startup file (`~/.zshrc` for the usual Mac shell), each marked `# Added by Ri`. They hold even when a Ruby version manager like rbenv, asdf, mise or chruby puts its own `ri` first. Open a new terminal window so they take effect.

If Ruby's `ri` still answers, run `~/.local/bin/ri doctor`. It says which `ri` a new terminal runs, and `~/.local/bin/ri doctor --fix` repairs it the same way. In the desktop app, **Add `ri` to Terminal** in **Settings**, under **This computer**, does the same.

You don't lose Ruby's documentation. When you type a Ruby lookup like `ri Array#each` or `ri String`, Ri hands it to Ruby's `ri`.

## Common problems

**"Ri isn't set up on this device yet."** This computer has no Ri of its own and isn't connected to one. Run `ri start` to start a new Ri here or connect to the one you have.

**"Port 4224 is in use by …"** Another program is using Ri's port. Your Home keeps its address so your devices and agents can always find it, so stop that program, then run `ri start` again.

**"Another Ri launcher owns this database."** Something else is already running this Home, for example the desktop app and `ri start` at the same time. Use the one that's running, or stop it first.

**"This code has a database change that isn't applied yet … restart Ri to apply it."** Ri was updated but hasn't restarted. Ri changes its database only when it starts, so run `ri restart`. Nothing was changed.

**A harness shows Not connected.** Sign in again with its command, then click **Check again** in **Settings**, under **Models**. See [Harnesses](/docs/guides/harnesses).

**A chat can't use your accounts.** Check the agent's **Connectors** in its **Setup**, and that the chat runs on Claude Code or Codex. Chats on other harnesses can't use Connectors yet.

**Agents stop when your laptop sleeps.** That's the computer running your Ri pausing. See [Keep Ri running on a computer that stays on](/docs/guides/always-on).

**Your phone can't use the microphone or notifications.** Both need your Ri's HTTPS address. See [Your phone and other devices](/docs/getting-started/devices).

**Your Mac won't open a preview build.** Open Ri once, then go to System Settings, Privacy & Security, and click **Open Anyway**.

**An update failed.** **Settings**, under **Updates**, says what went wrong. Once you've fixed it, `ri update recover` tries again. **Go back to the previous version…** under **Advanced** undoes an update.

**"Disk almost full."** Ri warns you when the computer running it has less than 10 GiB free. A full disk stops Ri, and updates need room for a snapshot, so free some space.

## Still stuck?

Search Ri (⌘K or Ctrl+K) for **Feedback & bugs** to tell us what happened, and include the diagnostics from **Service Status…** if you can.
