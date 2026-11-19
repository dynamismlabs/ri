---
title: Your first agent and chat
description: Make an agent for a folder, hand it a piece of work, and come back to the result.
---

An agent knows where it works, what it may use and what it's for, so you never explain a project twice. A chat is one piece of work you hand to an agent. This page walks through both.

## Make an agent

1. In the rail on the left, click **New agent** (the plus beside your agents).
2. Give it a name and an icon.
3. Under **Folders**, add the folder it works in, like a code repo or a folder of documents. A folder is optional: without one, Ri makes a folder for the agent's files.
4. Choose which of your [Connectors](/docs/concepts/connectors) its chats may use, and whether it may use the agent browser.
5. Click **Create agent**.

Then open the agent's **Setup** tab and write its **Purpose**, a sentence or two on what it's for, and any **Instructions** every chat in it should follow, like "run the tests before you say you're done". You write these once and every chat gets them. [Agents](/docs/concepts/agents) covers everything else in Setup.

If you brought in projects from Claude Code, Codex or OpenCode during your [first run](/docs/getting-started/first-run), they're already here as agents.

## Start a chat

1. Open the agent and click **New chat**.
2. Say what you want done in a sentence or two, the way you'd brief a colleague. Attach files if they help, by dropping them in.
3. Pick the harness and model, or keep your default.
4. In a git repo, choose how the chat works on your code. **Worktree** gives it an isolated copy on its own branch, so several chats can work at once without stepping on each other. **Live** works right in the agent's folder.
5. Click **Start**. **Open only** creates the chat without sending anything yet.

You can also hand work over from anywhere else in Ri. Ask your [main chat](/docs/concepts/main-chat) ("have the website agent fix the signup bug") and it briefs a new chat for you. Or open a task and click **Start with agent**, which starts a chat with the task as its brief, links the two and moves the task to In progress.

## Walk away

The chat keeps working after you close the window. If Ri runs on a computer that stays on, it keeps working while your laptop sleeps too. When it ends a turn, it writes one line under its title saying where it stands. Chats waiting on you show up under **Unread** and **Needs approval**, so you only check the ones that need you.

If a chat asks a question or wants permission to do something, you answer it in the chat. Your main chat can answer simple questions for you when your intent is clear, but only you can approve a permission.

## Finish up

When the work is done, read the result, review the changes, and archive the chat from its menu. Archiving a chat in a git repo removes its worktree. Committed work stays on its branch, and Ri asks before it throws away anything that isn't committed. Open an archived chat again and it picks up where it left off.

Next, see [Chats](/docs/concepts/chats) for everything beside a chat: its preview, terminal, files and changes.
