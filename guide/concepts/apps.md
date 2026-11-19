---
title: Apps
description: Personal apps for the things you keep track of, which run on your computer, which your agents can use, and whose code you own.
---

Some things deserve more than a list: a trip with flights, hotels and changes, the people you keep in touch with, a job search. Apps give each of those a proper place with its own screens. Your agents can use them too, so "add the hotel confirmation to my Lisbon trip" just works. Every app runs on your computer, keeps its data there, and you own every line of its code.

## Add an app

Open **Apps** in the rail, then **Open your library**. **Recommended apps** lists apps ready to add:

| App | What it's for |
| --- | --- |
| Bookmarks | Save a link from anywhere, then find it by what the page said. |
| Job Search | Opportunities, interviews, correspondence and materials together. |
| People | Your relationships, conversations and follow-ups in one place. |
| Travel | Plans, reservations and changes turned into one trip you can look at and talk about. |

Each shows what it can reach, like your email, before you add it. Click **Add** and Ri downloads the app's code, checks it, builds it and runs it on your computer. Ri brings what the app needs to run, but the computer needs git installed.

## Build your own

Click **New app**, give it a name, and say what it should do. Ri opens a chat that builds it in a folder of its own on your computer. That chat can't use your accounts, since building an app never needs them. When it's ready, **Install and connect** adds it to your Ri. To change it later, use **Change app**, describe the change, then **Apply change**.

An app is an ordinary MCP server in its own git repository, so you can read, change and share it like any other code.

## Add an app you already run

If an app is already running, on this computer or online, use **Add app** and paste the MCP address it shows, like `http://127.0.0.1:4310/mcp`.

## Where apps show up

- Apps with their own screens are listed under **Apps** in the rail.
- Your main chat and Ri's other chats connect to an app when you add it. To let an agent use one, allow it in the agent's **Setup**, under **Apps**, or from the app's page. The app then asks what that agent may see and whether it may make changes.
- Apps can also show their screens right inside a chat, when an agent uses them.
