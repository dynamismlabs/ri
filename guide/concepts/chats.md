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

## Work in parallel

Ask a chat to start another conversation on the same work. They share the folder, branch and device, and can run at the same time. Your current conversation stays open. Give the new conversation a brief of its own. Its result comes back to the chat that started it.

## Chats started by other chats

Your main chat and your chats can hand work to another agent. Each hand-off starts a new chat there, and its answer comes back to the chat that asked. Ri shows you where each one came from and keeps you from reading the same result twice.

- **The mark.** A chat another chat started has a small corner arrow before its title. Point at it to see which chat started it. In the chat itself, **from** and that chat's name sit beside the title. Click it to go back.
- **In Recent.** Started chats sit under the chat that started them, folded into one line that says how many there are and what they're doing. Click the line to open them, and again to fold them. A main chat that started chats shows as their group, even though Recent doesn't list main chats otherwise.
- **In the top bar and on the Board.** Each chat stays in the list for its own state. When two or more from the same chat land in one list, they stack into one row you can open. **Needs approval** never stacks, since each one needs your decision.
- **Not unread twice.** Once a started chat's answer goes back, it leaves **Unread** and **Waiting response**, because the chat that asked already has it. It comes back the moment it needs your approval, works again, or you write in it. After you write in one, it reads like any other chat. **Mark as unread** still brings one back.

A chat that started others gets **Started chats** in its Tools, and an agent's main chat gets a **Started chats** tab. It lists every chat it started: the ones waiting on you first, then the ones working, then the rest, each with where it stands. **Archive finished** archives the ones that returned or stopped and that you never wrote in.

Archiving a chat archives its finished started chats with it, the ones you never wrote in. One that's still working, waits on you, or has files it never committed stays open, and the message after archiving names it.

## Beside the chat

Next to the conversation, a panel shows what the chat is working with:

| Tab | What it shows |
| --- | --- |
| **Run** | The project's app process: start, stop or restart it, and see its output. |
| **Preview** | The app running, in a browser view. |
| **Artifacts** | Files the chat made for you, and files in your messages. When a chat has more than one tab, choose **This chat** or **All chats**. |
| **Changes** | What it changed, file by file. |
| **Files** | The folder it works in. |

**Notes & tasks** and **Scratchpad** are in the panel's More menu, with **Started chats** once the chat has started one. **Terminal** (Ctrl and backtick) opens a shell in the chat's folder, and **Tools** (Ctrl and period) shows or hides the panel.

## Knowing where it stands

While a chat works, it writes you short notes as it goes: what it found and what it will do next. The notes stay in the conversation after the turn ends, and the steps between them fold into one line you can open. Click a file the chat read to look at it, beside the chat or large. Click a file it changed to see the change in **Files**.

When a chat ends a turn, it writes one line under its title: what it did and what, if anything, it needs from you. A chip says how much of your time that takes: **Quick for you**, **Few min for you** or **Needs your time**. Sending it a new message clears the line. Status lines are a trial and on by default. Turn them off in **Settings**, under **General**.

The rail and the top bar sort your chats so you can see at a glance what needs you: **Needs approval**, **Unread**, **Waiting response** and **Working**. A chat counts as read once you engage with it or leave it.

## Questions and permissions

A chat may stop to ask you something or to ask permission, like running a command. You answer on the card in the chat: pick an answer, or **Allow** or **Deny**. Until you do, that chat waits, and it shows under **Needs approval** and in your notifications. Your main chat can answer a question for you when your intent is clear, but only you can approve a permission.

## Talking to a running chat

You can write to a chat while it's working, so you never have to hold the next step in your head. What you send waits in a queue above the message box. When the current turn finishes, the chat gets the first queued message as its next one, then the next, one turn at a time. The queue lives on your Home, so it keeps going after you close the window, and your phone shows the same queue.

Each queued message has three controls:

- **Send now** gives it to the chat straight away. On Claude Code and Codex the agent reads it at its next step, without stopping. On other harnesses the current turn stops first.
- **Edit** moves it back into the message box.
- **Delete** removes it.

To send a message now instead of queuing it, press ⌘Enter. Hover the send button to see both choices and their keys.

If you stop a turn, or a turn fails, the queue waits for you rather than carrying on. Send one of its messages now, and the rest follow.

Messages from your main chat or another agent arrive labeled with who sent them.

## Files and mentions

Drop or paste any file into a message, up to 50 MiB. Put it between your words when its place matters, like "these too?" right after a second screenshot. Once you send, its name stays where you put it, and pictures and PDFs show as thumbnails along the bottom of the message, so a screenshot never breaks up a sentence. Click either one to open it. The agent opens the file with its own tools.

Type `@` to mention a task, note, agent, app, Connector or file, so the chat gets the real thing instead of your description of it. Type `@#` to pick a GitHub issue or pull request.

## Finishing a chat

When the work is done, archive the chat: **Archive chat** in its menu, or **Archive** on its row. To clear many at once, use **Select chats to archive** in the rail.

Archiving a chat in a git repo removes its worktree. Work that's committed stays on its branch, pushed or not. If there are files it never committed, Ri asks first, with **Review changes** or **Archive anyway**.

Archived chats stay searchable with **Search chats** in the rail. Open one again and it picks up where it left off, with its worktree back on its branch where possible.

To have a chat check back on its own work later, use the clock at the top of the chat. See [Schedules and heartbeat](/docs/concepts/schedules-and-heartbeat).
