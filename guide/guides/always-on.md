---
title: Keep Ri running on a computer that stays on
description: Run your Ri on a Mac mini or a server so your agents and schedules keep going while your laptop sleeps.
---

Your agents work on the computer that runs your Ri. When that's your laptop, closing the lid pauses them. Put your Ri on a computer that stays on, like a Mac mini or a Linux server, and everything keeps moving: chats keep working, schedules run on time, and your phone can always reach it.

Use a Mac or a Linux computer. On Windows, Ri runs only while the app is open.

## Set it up

On the computer that will stay on, install Ri and start it:

```sh
curl -fsSL https://ri.app/install | sh
ri start
```

`ri start` sets Ri up to keep running: it starts again after a restart and comes back after a crash. On a Mac it runs as a background service for your account, and on Linux as a systemd user service.

If you use the desktop app there instead, turn on **Keep Ri running on this computer** in **Settings**, under **This computer**. Ri then starts when you log in and comes back after a crash, whether or not the window is open.

Already using Ri on your laptop? Move your Home to the new computer, with everything in it. See [Your data and backups](/docs/guides/data-and-backups).

## Keep the computer ready

Run `ri doctor` on the computer. Besides checking Ri, it checks the settings that keep a computer that nobody sits at ready, and says how to fix each one:

| Check | Why it matters | What to do |
| --- | --- | --- |
| Sleep | A sleeping computer pauses Ri. | `ri service awake on`, or **Keep the host awake while plugged in** in **Settings**, under **Devices**. |
| Automatic login (Mac) | After a restart or power cut, Ri waits until you log in. | Turn it on in System Settings, under Users & Groups. |
| FileVault (Mac) | After an unplanned restart, nothing starts until someone unlocks the disk. | For a planned restart, use `sudo fdesetup authrestart`. |
| Restart after power failure (Mac) | Otherwise the Mac stays off after a power cut. | `sudo pmset -a autorestart 1` |
| Start at boot (Linux) | Otherwise Ri starts only once you log in. | `sudo loginctl enable-linger` followed by your user name. |
| Free disk space | A full disk takes Ri down, and updates need room for a snapshot. | Keep at least 20 GiB free, or more than the size of your Ri's database if that's bigger. |

Keeping the computer awake doesn't wake one that's shut down, and it can't override closing a laptop's lid.

## Reach it from anywhere

Give your Ri an HTTPS address so your phone and other computers can reach it away from home. See [Your phone and other devices](/docs/getting-started/devices).

## Look after it

| Command | What it does |
| --- | --- |
| `ri status` | Whether Ri is running, which version, and whether it's kept running. |
| `ri logs` | The latest lines of Ri's log. Add `-f` to follow it. |
| `ri restart` | Restarts Ri once running chats finish. Add `--now` to restart right away, which ends them. |
| `ri stop` | Stops Ri, and keeps it stopped across restarts until you run `ri start`. |
| `ri update` | Updates Ri. See [Updates and channels](/docs/guides/updates). |
