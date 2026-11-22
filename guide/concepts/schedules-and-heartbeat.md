---
title: Schedules and heartbeat
description: Schedules run work for you at set times, and the heartbeat checks in on everything and tells you only what needs you.
---

Some work should happen without you asking: a briefing every weekday morning, a weekly review, a chat that checks on a long build every hour. Schedules start that work on time. The heartbeat is a special schedule that looks over everything for you and stays quiet unless something needs you.

## Schedules

Open **Schedules and Triggers** in the rail to see every schedule, pause or resume one, and make a new one with **New scheduled task**.

A schedule has a message and a time, and it sends the message to one of three places:

- **A new chat in an agent**, each time it runs. This is the usual choice for recurring work.
- **A new Ri chat each time**, with your assistant, for work that isn't about one agent.
- **One chat you already have**, which gets the message as if you'd sent it. Good for "keep going on this".

It can run once, hourly, daily, on weekdays, weekly, monthly, every so many minutes, or on a custom cron schedule. It can also run only when you click **Run now**, or when something calls its webhook. The form shows the next few times it will run.

Beside the form, a chat helps you write it. Describe what you want in plain words, like "every weekday at 8, summarize my inbox and calendar", and it fills in the schedule.

Under **Advanced** you can set a time limit, active hours, and what to do if the last run is still going: skip this run, add it to the running chat, or run alongside it.

Each schedule runs on the harness and model you pick in its form. That choice does not change your default model for new chats. Work that reads your email or uses another connected account needs [Connectors](/docs/concepts/connectors). Choose Claude Code, Codex or OpenCode 2.3 or newer for that work.

### Schedule a chat to check back

Every chat has a clock at the top. Use it to have that chat come back on a schedule, with a message like "Check on progress and keep going. When the work is done, pause this schedule." Turn on **Start a new chat each time** to get a fresh chat on every run instead. Your agents can set these up themselves too, when you ask them to check back later.

### When the computer sleeps

Schedules run on your Home's computer, so they need it awake. On a laptop, a time missed while it slept runs once when it wakes. A run that starts more than a few minutes late is told how late it is, so it can skip work that no longer makes sense, and say why. The list shows runs that are late. For schedules you can count on, run Ri on [a computer that stays on](/docs/guides/always-on).

From a terminal, `ri trigger` lists, creates and runs schedules. See the [`ri` command reference](/docs/reference/cli).

## Heartbeat

The heartbeat is a regular check-in on your work, following your instructions. It's off until you turn it on in **Settings**, under **Heartbeat**.

Each check-in looks over your work and decides whether anything needs you. Most of the time nothing does, and it stays quiet. When something does, your main chat tells you, so it arrives as one message in one place instead of a stream of alerts. **Recent check-ins** shows what each one did.

The default instructions:

- **Every check-in:** review your email since the last one and surface only what can't wait, and nudge chats that stopped without finishing.
- **Overnight:** tidy up, at most 10 changes a night. Archive tasks that are clearly dead, move Todo tasks untouched for 6 months to Consider, and file tasks with no area when the area is obvious. It never changes an area, rank or date you set.
- **Each morning:** tell you the few decisions that would unblock the most work, what's due in the next 2 days and isn't moving, and in one line what it tidied.
- **Up to twice a day:** offer one task an agent could finish on its own.

**Edit instructions** to change any of it. Each check-in knows the time and what earlier ones did, so you can write things like "once each morning". **Reset to default** brings the original back.

Whatever you write, the heartbeat always follows a few rules: it never deletes anything, never sends, posts or shares anything outside Ri, never completes a task for you, starts agent work only when your instructions say to, and stays quiet when nothing needs you.

Set how often it runs with **Every** (every 30 minutes to start, and never more often than every 5 minutes) and the **Hours** it may run, all day or between two times. **Check in now** runs one right away.
