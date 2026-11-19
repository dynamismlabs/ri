---
title: Use Ri from other agents
description: Let Claude Code, ChatGPT and other AI tools read and update your tasks and notes, and script Ri with the ri command.
---

You don't need this to use Ri. It's for when you work in another AI tool, like Claude Code in a terminal or ChatGPT on your phone, and want it to see your tasks and notes. Connect it once, and asking that tool "what's on my plate in Ri?" just works.

## Connect an agent

In **Settings**, open **Ri in other agents**. It lists the tools Ri knows how to connect:

| Tool | How it connects |
| --- | --- |
| Claude Code, Codex, Cursor, VS Code, Claude app, Gemini CLI, OpenCode, Antigravity, Kiro | **Set up** connects it in one step on the computer that runs your Ri. |
| Cursor, VS Code, Goose, LM Studio | An install link that opens the tool and adds Ri. |
| ChatGPT | Add Ri as a custom MCP connector in ChatGPT, with OAuth, and sign in to Ri when it asks. Needs your Ri's HTTPS address. |
| claude.ai | Add a custom connector in Claude's settings, with OAuth, and sign in to Ri. Needs your Ri's HTTPS address. |
| Windsurf, another Ri, or any MCP client | Step-by-step instructions, or **Copy setup prompt** to paste into the tool on another computer. |

**Set up** gives the tool a key of its own, adds Ri to its settings for all your projects, and installs Ri's skill so it knows how to work with your tasks and notes. Restart the tool, or start a new session, and it can reach Ri. Disconnect any tool from the same place, which also revokes its key.

From a terminal on the computer that runs your Ri, `ri mcp connect` followed by the tool's name does the same as **Set up**. `ri mcp list` shows what's connected, and `ri mcp disconnect` removes one.

## What they can do

Connected tools can search, read and update your tasks, notes, areas and deck, private notes included, with their own model. They can add to your [Stream](/docs/concepts/capture-and-stream) for your assistant to sort, but can't read it.

They can't start Ri chats, change settings, read your scratchpad or chats, or reach the files on your computer. Nothing they can do deletes anything.

In ChatGPT and Claude, Ri can also show your deck and your task lists right in the conversation, where you can start or finish a task.

## Script Ri with the ri command

Everything Ri's own agents can do is also a command: `ri agent` followed by an action and its parameters, with JSON output you can pipe into other tools.

```sh
ri agent list_tasks --status todo --limit 5
ri agent create_task --title "Renew passport"
ri agent read_docs --query "keyboard shortcuts"
```

On the computer that runs your Ri, these run there directly. On a connected computer, they run on your Ri over the network. Pass the whole input as JSON with `--input` when that's easier. The [actions reference](/docs/reference/actions) lists every action and its parameters.

## Ri's own chats

Chats you start in Ri already have all of this and more. They manage your tasks and notes, coordinate with each other, and read these docs, with nothing to set up.
