---
title: Your phone and other devices
description: Reach your Ri from your phone, a browser or another computer, and run agents on more than one computer.
---

Your Ri lives on one computer, but you can check on it from anywhere. Your phone, a browser on any computer, or another computer with the desktop app all show the same Ri, always in sync. Nothing is copied to them: they're windows onto the computer that runs your Ri.

## Pair a device

Every device gets its own key, which you can remove at any time.

1. In **Settings**, open **Devices** and click **Add device**.
2. Give it a name, pick its type (a phone or a computer, for example), and click **Create pairing link**.
3. Scan the QR code with that device, or copy the link to it. The link is shown once.

From a terminal on the computer that runs Ri, `ri pair` does the same and prints the link and a QR code. At the end of [your first run](/docs/getting-started/first-run), **Use Ri on your phone** does it for a phone without leaving the chat.

The pairing link offers the addresses your Ri knows: your remote address, the address you're using now, and your local network. Use the remote address for a phone, so it works away from home.

## Reach Ri away from home

To use Ri from outside your network, give it an HTTPS address. In **Settings**, under **Devices**, set the **Remote base URL**: the address another device would open to reach this computer. Anything that forwards to Ri's port works, such as Tailscale, a Cloudflare Tunnel or ngrok, or your own reverse proxy. Ri checks that the address really reaches it.

A phone needs HTTPS for the microphone and for notifications.

## Put Ri on your phone's home screen

Open your HTTPS address on your phone and pair it. Then:

- **iPhone or iPad:** open Ri in Safari, tap Share, then **Add to Home Screen**.
- **Android:** open Ri in Chrome, then choose **Install app** or **Add to Home screen** from the browser menu.

Ri then opens like an app, with **Chat**, **Agents**, **Deck** and **More** along the bottom and a plus button for quick capture. You can talk to your main chat, check on every agent, answer their questions, capture a thought, and start a new chat on any of your computers. Your phone doesn't run agents itself.

## Use Ri on another computer

Install the [desktop app](/docs/getting-started/install) on the other computer and choose **Connect to Ri**. Paste a pairing link made for a computer, from **Settings**, under **Devices**, on your Ri. It must be the HTTPS address. From a terminal, `ri connect` with the link does the same.

Connecting doesn't create a second Ri. Your tasks, notes and chats stay on the computer that runs your Ri.

## Run agents on more than one computer

A connected computer can also run chats, in its own folders, with its own harnesses. That's useful when a project lives on your laptop, or one computer has tools another lacks.

- When you connect in the desktop app, check **Run agents on this computer**.
- Later, open **Settings** on that computer, go to **This computer**, and turn it on under **Agents on this computer**.
- From a terminal on a computer you connected with `ri connect`, run `ri worker enroll`. To enroll with a code instead, make one with `ri worker grant` on the computer that runs your Ri and pass it with `--code`.

When you start a chat, **Run on** picks the computer it runs on. In **Settings**, under **Devices**, each device says what it does: the one that runs Ri and agents, the ones that run agents, and the one you're using.
