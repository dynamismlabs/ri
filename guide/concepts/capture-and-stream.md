---
title: Capture and the Stream
description: Get a thought off your mind in seconds from anywhere, and let your assistant sort it into the right place later.
---

A thought you don't write down keeps nagging at you. Capture is the fastest way to put it somewhere safe: type it, say it or snap it, and move on. Everything you capture lands in the Stream, and your assistant sorts it later, so you never have to decide on the spot whether it's a task, a note or nothing at all.

## Capture from anywhere

- **Quick Capture:** press ⌘⇧K (Ctrl+Shift+K on Windows and Linux) anywhere in Ri. Type, or use **Speak** for your voice and **Image** for a photo or screenshot. Closing the box keeps your draft.
- **Your phone:** tap the plus button, then **Quick capture**.
- **Any app on your computer:** in the desktop app, turn on **Global Quick Capture** in **Settings**, under **This computer**. It's off until you turn it on, and then ⌘⇧K (Ctrl+Shift+K) opens Quick Capture from any app. You can change the keys there.
- **Other agents and automations:** agents you connect from Claude, ChatGPT and other tools can add to your Stream, but never read it. See [Use Ri from other agents](/docs/guides/other-agents). An iPhone Shortcut or a script can post text (JSON with a `text` field), a voice memo or an image to `/api/capture` at your Ri's address, with a device key from `ri pair` (the token in the pairing link it prints) as a bearer token.

When you capture an image, Ri saves it and reads it for you, so a photo of a whiteboard becomes text you can search. Add a line with it to say what you want, like "just the phone numbers".

## The Stream

The Stream is a calm record of everything you captured, on your Home. It isn't a to-do list. What you wrote is kept exactly as you wrote it, and stays searchable for good.

Your assistant sorts it for you. A little while after you capture something, and again early each morning, it goes through what's waiting and decides what each item is:

- **Make it a task**, added to Todo or saved to Consider.
- **Make it a note**, or add it to a task or note you already have.
- **Keep as a thought**: worth keeping, but nothing to do. Most captures end up here, and that's fine.
- **Set aside**: noise or a duplicate. It's still searchable.

Every choice can be undone. Use **Bring it back** on any item to sort it again yourself. Use **Triage** to have your assistant sort what's waiting right now. Each week it writes a short digest of what it did.

## How much it decides on its own

In **Settings**, under **General**, **Capture triage** sets how much your assistant does without asking:

| Setting | What happens |
| --- | --- |
| **Let it handle the obvious** | It applies what's clear and suggests the rest. The digest shows everything. |
| **Review everything** | It still sorts, but every choice waits for you under **Needs your call**. |
| **Manual only** | Nothing is sorted until you tap **Triage**. |
