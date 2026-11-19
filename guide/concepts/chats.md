---
title: Chats
description: A chat is one piece of work an agent does for you, and it tells you where it stands so you only check the ones that need you.
---

A chat is one piece of work you hand to an [agent](/docs/concepts/agents): fix this bug, research that, draft the launch post. It runs on a harness, like Claude Code or Codex, with the model you pick. You can run as many chats at once as you like, across all your agents, and they keep going when you close the window.

## Start a chat

Click **New chat** on an agent, or on its row in the rail. Describe the work, attach any files, and click **Start**. [Your first agent and chat](/docs/getting-started/first-agent) walks through it.

- **Harness and model.** The menu beside the message picks both. Your default comes from **Settings**, under **Models**. You can change the model in a running chat on Claude Code, Codex and OpenCode. Switching to another harness starts a new chat.
- **Worktree or Live.** In a git repo, **Worktree** gives the chat its own copy of the project on its own branch, so chats never step on each other. **Live** works in the agent's own folder. In a folder that isn't a git repo, chats work in the folder.
- **Run on.** If you run agents on more than one computer, pick where this chat runs. See [Your phone and other devices](/docs/getting-started/devices).

## Beside the chat

Next to the conversation, a panel shows what the chat is working with:

| Tab | What it shows |
| --- | --- |
| **Run** | The project's app process: start, stop or restart it, and see its output. |
| **Preview** | The app running, in a browser view. |
| **Artifacts** | Files the chat made for you. |
| **Changes** | What it changed, file by file. |
| **Files** | The folder it works in. |

**Notes & tasks** and **Scratchpad** are in the panel's More menu. **Terminal** (Ctrl and backtick) opens a shell in the chat's folder, and **Tools** (Ctrl and period) shows or hides the panel.

## Knowing where it stands

When a chat ends a turn, it writes one line under its title: what it did and what, if anything, it needs from you. A chip says how much of your time that takes: **Quick for you**, **Few min for you** or **Needs your time**. Sending it a new message clears the line. Status lines are a trial and on by default. Turn them off in **Settings**, under **General**.

The rail and the top bar sort your chats so you can see at a glance what needs you: **Needs approval**, **Unread**, **Waiting response** and **Working**. A chat counts as read once you engage with it or leave it.

## Questions and permissions

A chat may stop to ask you something or to ask permission, like running a command. You answer on the card in the chat: pick an answer, or **Allow** or **Deny**. Until you do, that chat waits, and it shows under **Needs approval** and in your notifications. Your main chat can answer a question for you when your intent is clear, but only you can approve a permission.

## Talking to a running chat

Send a message any time, even while the chat is working. It goes straight to the chat, which takes it into the work it's doing. Messages from your main chat or another agent arrive labeled with who sent them.

## Files and mentions

Drop or paste any file into a message, up to 50 MiB. Images and PDFs show a preview, and the agent opens the file with its own tools.

Type `@` to mention a task, note, agent, app, Connector or file, so the chat gets the real thing instead of your description of it. Type `@#` to pick a GitHub issue or pull request.

## Finishing a chat

When the work is done, archive the chat: **Archive chat** in its menu, or **Archive** on its row. To clear many at once, use **Select chats to archive** in the rail.

Archiving a chat in a git repo removes its worktree. Work that's committed stays on its branch, pushed or not. If there are files it never committed, Ri asks first, with **Review changes** or **Archive anyway**.

Archived chats stay searchable with **Search chats** in the rail. Open one again and it picks up where it left off, with its worktree back on its branch where possible.

To have a chat check back on its own work later, use the clock at the top of the chat. See [Schedules and heartbeat](/docs/concepts/schedules-and-heartbeat).
