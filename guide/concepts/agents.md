---
title: Agents
description: An agent is a folder to work in, what it may use, its purpose and your standing instructions, so you never explain a project twice.
---

An agent is a scope for work: a folder, what it may use, what it's for, and the rules you want followed there. You set it up once. After that, every chat you start in it already knows the project, so a one-line brief is enough.

Make one agent per project or part of your life: your app's repo, your writing, your finances. Agents are listed in the rail on the left.

## What an agent is made of

You'll find all of this in the agent's **Setup** tab.

| Part | What it does |
| --- | --- |
| **Name**, **Icon** and **Area** | How you find it. The [area](/docs/concepts/tasks-and-notes) groups it with related tasks and notes. |
| **Purpose** | A sentence or two on what the agent is for. Its main chat keeps this in mind. |
| **Folders** | Where it works. One folder is its primary: chats start there and follow that folder's own instructions files. They can work in every folder listed. **Make primary** changes which one leads. |
| **Instructions** | Standing instructions every chat in this agent gets when it starts, like "run the tests before you say you're done". The agent's main chat follows them too. |
| **Connectors** | Which of your connected accounts its chats may use. See [Connectors](/docs/concepts/connectors). |
| **Apps** | Which of your [apps](/docs/concepts/apps) it may use. |
| **Skills** | The [skills](/docs/concepts/skills) its chats can use. |
| **Browser** | Whether its chats may read and act on web pages. |
| **Git**, **Scripts and preview**, **Files to copy** | For a git repo: how chats branch, the commands that set up each chat's copy of the project and start its preview, and ignored files like `.env` to copy into each new copy. |

A folder is optional. An agent for planning a trip doesn't need one, and Ri makes a folder for its files and tells you where.

## The agent page

Open an agent from the rail. Its main chat is on the left, and beside it are tabs:

- **Chats:** every chat in this agent, with **All**, **Unread** and **Working** filters.
- **Started chats:** the chats its main chat handed work to, once it has any. See [Chats started by other chats](/docs/concepts/chats#chats-started-by-other-chats).
- **Files:** the agent's folder.
- **Preview:** the project running, for an agent with a preview set up.
- **Setup:** everything in the table above.

A terminal opens at the bottom with Ctrl and the backtick key.

## The agent's main chat

Each agent has its own main chat, which coordinates that agent's work. Talk to it about the project. It reads what each chat is doing, answers questions about work in progress, steers a chat that's going the wrong way, and starts new chats with a good brief for anything that takes more than a few minutes. Building, fixing and research run in those chats, where you can watch, steer and search them, and the main chat stays free to talk with you.

## The agent browser

Agents can read and act on web pages with the agent browser, a Chromium browser on your Home's computer. Turn it on in **Settings**, under **Browser**. **Open to sign in** opens it so you can sign in to a site once, and the session is kept for later. Ri keeps the agent browser's profile separate from your personal browser.

Your main chat can use the sites you've signed in to. An agent's chats and its main chat browse with a profile of their own instead, kept apart from your signed-in one. Turn the browser off for an agent with **Let this agent use the browser** in its Setup.

## Archiving an agent

When a project ends, use **Archive agent** at the bottom of Setup. It leaves your active list, and its chats are kept.
