---
title: Harnesses
description: Ri runs your agents on Claude Code, Codex, Cursor, OpenCode and Antigravity, each on the plan you already pay for.
---

A harness is the AI tool a chat runs on. Ri doesn't sell AI or need API keys: it runs the tools you already use, signed in with your own accounts, so your Claude or ChatGPT subscription does the work. Use more than one and pick the best model for each job.

## Install and sign in

Each harness runs on the computer where its chats run. Install it there and sign in once.

| Harness | Account | Install | Sign in |
| --- | --- | --- | --- |
| Codex | A ChatGPT plan, or an OpenAI API key | `npm install -g @openai/codex` | `codex login` |
| Claude Code | A Claude plan, Amazon Bedrock, or an Anthropic API key | `npm install -g @anthropic-ai/claude-code` | `claude login` |
| Cursor | A Cursor plan, or a Cursor API key | The Cursor CLI, from cursor.com | `agent login` |
| OpenCode | The AI providers you set up in OpenCode | `npm install -g opencode-ai` | `opencode auth login` |
| Antigravity | A Google account | `curl -fsSL https://antigravity.google/cli/install.sh \| bash` | Run `agy` once and sign in in the browser |

In the desktop app, Claude Code and Codex install and sign in with one click.

Then open **Settings**, under **Models**. **Harnesses and models** shows each harness with its state, **Subscription**, **API key**, **Not installed** or **Not connected**, and the command to run next. Click **Check again** once you've run it. A harness signed in with an API key instead of a plan bills you per use, and shows as **API key**.

## Pick models

- **Default model**, at the top of **Models**, is what a new chat uses unless you choose otherwise.
- Each harness can have a default of its own, used when you pick that harness for a chat.
- **Harnesses and models** also lets you choose which of each harness's models appear in your menus.
- The model menu in a chat can make the model you picked your default.

## Know your limits

Plans have usage limits. **Usage & budget**, at the bottom of **Models**, shows what your agents have spent, with an optional monthly cap. **Show at** chooses when your plan's usage appears in the top bar: at 50, 80 and 90 percent to start.

## How the harnesses differ

| | Claude Code | Codex | Cursor | OpenCode | Antigravity |
| --- | --- | --- | --- | --- | --- |
| Connectors and the agent browser in chats | Yes | Yes | No | No | No |
| Asks you questions and permissions in Ri | Yes | Yes | No, it follows its own permission settings | Yes | No, it follows its own permission settings |
| Change the model in a running chat | Yes | Yes | No | Yes | No |

Every harness gets your agents' standing instructions. Antigravity reads them when a chat starts, so changed instructions reach its next new chat.

Switching a chat to another harness starts a new chat.
