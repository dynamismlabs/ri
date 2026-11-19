---
title: Skills
description: Skills teach your agents how you want something done, once, so every chat that needs it does it your way.
---

Some work has a right way: how you write release notes, how you review a pull request, the steps to publish your newsletter. A skill writes that down once, as instructions and any scripts or files that help. Agents load a skill when the work calls for it, so you stop repeating the same directions in every chat.

A skill is a folder with a `SKILL.md` file, the same format Claude Code, Codex and other agents use, so a skill you make in Ri works outside it too.

## Make a skill

Open **Apps** in the rail, then **Open your library**, and click **New skill**. You can also use **New skill** in search (⌘K or Ctrl+K), or **Import SKILL.md** from the library's menu to bring in one you already have.

A new skill opens beside a chat that helps you build it. **Build** is where you describe what the skill should do and refine it together. **Try it** runs a fresh chat that has the skill, so you can use it the way you would for real before anyone else does.

## Drafts and installing

Every new skill starts as a draft, and no agent uses it until it's installed. When it's ready, click **Install** and choose where it goes. Where it lives decides who uses it:

| Where | Who uses it |
| --- | --- |
| **Ri** | Every chat Ri runs. |
| **Global** | Every agent on this computer, in Ri and outside it, like Claude Code in a terminal. |
| **A project** | Agents working in that repo, and your team once it's committed. |

You can move a skill between these at any time, copy it into Ri or into a project, or **Uninstall** it, which makes it a draft again. A skill in a project can be committed to the repo's branch from its page.

An agent's **Setup** has a **Skills** section showing the skills its chats can use.

## Skills that come with Ri

Ri ships a few skills of its own that teach agents how to work with your tasks, notes and deck, and how to use the agent browser.
