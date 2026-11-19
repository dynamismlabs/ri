---
title: Teams
description: Share tasks and notes with the people you work with, bring your own agents to the team's work, and keep your personal work private.
---

A team is a separate place for shared tasks and notes, on a computer of its own. You pull a task from the team's list and hand it to one of your agents, and the rest of your life stays in your own Ri. Nothing from My Ri is copied into a team.

## Join a team

Someone on the team sends you a link. In **Settings**, open **Teams**, paste it under **Team link**, and enter **Your name**, which is what the team sees on your work. Once you've joined, your assigned tasks appear in My Ri beside your own, and the space switcher moves between My Ri and your teams. In the desktop app, each team opens in a window of its own.

**Disconnect** in the same place removes the team's shared work from My Ri. Your private planning for that work is kept.

## Create a team

A team runs on a computer of its own, like a server or a Mac mini, so it's there for everyone.

- In the desktop app, choose **Create a team** on the first screen or in **Settings**, under **Teams**.
- On a server, run `ri team create`. It starts the team in the background and opens its setup. `ri team setup-link` prints a one-time link that makes whoever opens it the team's owner.

Setup asks for the team's address, so its members can reach it: an HTTPS address of your own, or a Beamd address.

## Hand team work to an agent

Open a team task and click **Work with agent**. You choose where the work happens:

| Choice | Who can read the chat |
| --- | --- |
| **Work in My Ri** | Only you. It runs with your personal agents. |
| **Work on team's server** | Everyone on the team. |

Starting the work in My Ri changes nothing at the team. Updating the team's task, and what you share back, stay your call.

## What stays private

- Your personal tasks, notes, deck, scratchpad and chats never leave My Ri.
- When an agent writes text that goes to a team, a link to one of your private records is refused, so it can't leak into the team's work.
- A team has no deck or scratchpad. Those are for your own planning.

## Slack and Buzz

In **Settings**, **Slack & Buzz** adds your Ri agents to Slack or Buzz for two-way conversations. Choose which of your agents answers, connect the channels it listens in, and Ri walks you through linking your account and testing the first conversation.
