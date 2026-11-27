---
title: Voice
description: Talk to Ri instead of typing, with speech recognition on your own computer or in the cloud.
---

Saying a thought is faster than typing it, especially on a phone. Anywhere Ri takes text, you can speak instead: a message to a chat, a quick capture, a reply to an agent's question. Press ⌘J (Ctrl+J on Windows and Linux) for a voice chat, or use **Speak** in Quick Capture.

## Choose how speech becomes text

In **Settings**, open **Voice**. Pick a **Default model** from these kinds:

| Kind | Where your audio goes | What it needs |
| --- | --- | --- |
| **Local** (Parakeet) | Stays on the computer that runs your Ri. | The local speech download, below. |
| **Cloud** (Groq Whisper) | Groq's servers. | A Groq API key. |
| **Browser** | Your browser's own speech recognition, which may send it to the browser's maker. | A browser that supports it. Nothing to set up. |

**Auto-send voice messages** sends what you said as soon as it's transcribed, instead of leaving it in the box for you to check.

## Recording and transcribing

Tap the microphone and speak. Tap stop when you're done. The box then says **Transcribing…** until your words arrive, so you can tell it's still working. **Cancel** stays in the same place the whole time: tap it while recording or transcribing and nothing you said is kept or sent.

Your words arrive all at once, when the transcript is complete. With auto-send on, Ri sends the whole message, never half a sentence. With it off, they go into the box where your cursor was, beside anything you already typed. In Quick Capture they go after what you typed.

## Local speech

Local speech keeps your audio on your computer. Under **Optional local speech**, click **Install local speech**. Ri downloads a verified model, with no Python or Docker to install. Leave about 900 MiB of disk free.

It runs on the computer that runs your Ri, on a Mac with Apple silicon. Intel Macs and Windows can't run it, and not every copy of Ri for Linux includes it. If yours doesn't, Settings says so, and you can use Groq or your browser instead. If you already run a Parakeet speech server, give its address in **Runtime setup**, under **Updates**.

**Allow automatic Groq fallback** sends audio to Groq when local speech can't be used, if you've set a Groq key. A local model you picked yourself never switches.

## Groq

Get an API key from Groq, then enter it as the **Groq API key** in **Settings**, under **Updates**, in **Runtime setup**. It takes effect when Ri restarts.

## On your phone

Your phone's recordings are sent to the computer that runs your Ri to be transcribed. The microphone needs your Ri's HTTPS address. See [Your phone and other devices](/docs/getting-started/devices).
