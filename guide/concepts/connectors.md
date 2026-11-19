---
title: Connectors
description: Connect your accounts, like Gmail, Slack and Notion, so your agents can work where your work already lives.
---

Your work lives in other places too: your inbox, your calendar, Slack, Notion, Linear. Connectors let your agents read and act there, so "reply to Sam's email" or "file this bug in Linear" is something you hand off instead of doing yourself. Ri asks you before an agent sends anything or does anything that can't be undone.

## Connect an account

Open **Apps** in the rail, then **Open your library**, and choose **Connectors**. **Plugins** in **Settings** opens the same library, and so does **Connect a service** in search (⌘K or Ctrl+K). Pick a service and sign in. Ri can connect Google (Gmail, Calendar, Drive, Docs and Sheets), Microsoft 365, Slack, Notion, Linear, Todoist, GitHub, Jira, Asana and dozens more. You can connect several accounts of the same service, like your work and personal Gmail.

Most services connect with a normal sign-in. Gmail and Google Calendar need one more choice first: connect through Composio, a service that stores the connection and handles its requests so you don't have to register anything with Google, or use your own Google OAuth app, which keeps the account's tokens in your Ri. Ri walks you through either.

You don't have to set everything up in advance. When an agent needs an account you haven't connected, it shows a card in the chat with a button to connect it, or **Not now**.

## Which agents can use which accounts

Your main chat can use every account you connect. Each agent uses only the accounts you give it, in its **Setup** under **Connectors**: pick **All accounts**, which includes accounts you connect later, or choose specific ones. That way the agent for your side project never sees your work email.

## Asking before it acts

Reading is automatic. So are changes that stay private and can be undone. Anything that reaches other people, like sending an email or posting a message, or that can't be undone, asks you first. The chat shows a card with what it wants to do, marked **Visible to others** or **Can't be undone**, and you choose **Approve once**, **Always allow** or **Deny**. When several are waiting, you can approve or deny them all at once.

Change what asks first for each tool under **What agents can do**, on the service's page, with the **Ask first** switch. **Always allow** turns it off for that tool, and you can turn it back on there.

## Custom MCP servers

If a tool you use has its own MCP server, add it with **Add MCP server** on the Apps page. Give its address, sign in if it asks, then turn each of its tools on or off and choose which ones ask first.

## Which harnesses can use them

Chats on Claude Code, Codex and OpenCode can use Connectors. OpenCode needs version 2 or newer. Chats on Cursor and Antigravity can't yet, because those harnesses can't be limited to the accounts an agent is allowed to use. That goes for scheduled chats too. See [Harnesses](/docs/guides/harnesses).
