---
title: Your data and backups
description: Everything in your Ri lives in one folder you own, and here's what's in it, how to back it up and how to move it.
---

Your tasks, notes, chats and files live in one folder on the computer that runs your Ri: your Home. Nothing is kept on a server of ours. That makes your data yours, and it also makes keeping a copy your job, so this page covers both.

## What's in your Home

[Your Home](/docs/concepts/home) shows where the folder is on each kind of computer. Inside it:

| What | What it holds |
| --- | --- |
| `data.db` | Your tasks, notes, areas, chats and settings, in one database. |
| `attachments` | The files you and your agents added. |
| `tasks`, `notes`, `areas`, `stream` | A readable Markdown copy of your tasks, notes, areas and Stream, kept in step by Ri. It opens in Obsidian. Ri writes it from the database, so edits made here are overwritten. |
| `USER.md`, `SOUL.md`, `MEMORY.md` | What your assistant knows about you and itself. See [Your main chat](/docs/concepts/main-chat). |
| `skills`, `skill-drafts` | Your [skills](/docs/concepts/skills). |
| `.config` | This computer's keys and private settings. Never share it or copy it to another computer. |
| `.work` | Scratch space and logs. Safe to lose. |

Agents' own folders, like your code repos, live wherever you put them, not in your Home.

## What leaves your computer

Your data stays on your computer, with a few exceptions you choose:

- A chat sends what it's working on to the AI provider behind its harness, like Anthropic or OpenAI, the same as when you use that tool on its own.
- [Connectors](/docs/concepts/connectors) reach the services you connect. If you connect Gmail or Google Calendar through Composio, Composio handles those requests.
- Your phone and other devices read your Ri over the address you give it.

## Back it up

| Way | What it covers |
| --- | --- |
| Your computer's own backup, like Time Machine | The whole Home folder, if your backup includes it. The simplest choice. |
| `ri commit` | Saves your Home folder into a git repository in the same folder, database and attachments included, so you build a history you can go back to. It doesn't push anywhere: add a remote yourself if you want an offsite copy. |
| `ri snapshot` | A dated copy of the database and the Markdown copy, in the `snapshots` folder of your Home. It doesn't include attachments. |
| Updates | Every update takes a snapshot of the database first, kept for up to 7 days. It's for undoing an update, not a backup. |

To restore from a snapshot, stop Ri with `ri stop`, copy the snapshot's `data.db` over the one in your Home, and start Ri again with `ri start`.

## Move your Home to another computer

Moving keeps everything, including your chats' history and your devices. You need the `ri` command on both computers. The [server install](/docs/getting-started/install) puts it there, and in the desktop app on a Mac or Linux, **Add `ri` to Terminal** in **Settings**, under **This computer**, does too.

1. On the old computer, stop Ri with `ri stop`, then run `ri home export` with a folder to export to. Ri checks the export as it writes it.
2. Copy that folder to the new computer.
3. On the new computer, before it has a Ri of its own, run `ri home import` with the copied folder. Your Home is there, but waits until you claim it.
4. On the old computer, run `ri home retire`, so the two never run at once.
5. On the new computer, run `ri home claim`, then `ri start`.
6. Your other devices follow the new address with `ri connect --address` and the new address, or by pairing again. The old computer can connect to the new Home and keep running agents in its own folders.

Copying a Home folder by hand works too, but a copied Home won't run until you claim it on its new computer with `ri home claim`. That keeps two copies from ever running as one.
