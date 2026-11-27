# Chat tabs: Unread, Working, everything

The same chats answer three questions, and a person comes to a list of chats
with one of them in mind:

- **What wants me?** A chat blocked on a permission or a question, an agent
  that replied, output nobody has read.
- **What's running?** Is my thing still going, or done?
- **Where is that chat?** Go to one, or start one in an agent.

One long list can only put one of these first. The phone's Agents tab used to
lead with every unread chat (18 active on a real Home in November 2026, about
two screens), then the agents, each with its chats open under it, so reaching
a particular chat meant scrolling past all of it, and nothing showed what was
running. So both lists of chats put the three questions in a row of tabs at
the top, each with its count. The counts answer the first two questions at a
glance, before a tap.

## The phone's Agents tab

`src/components/mobile/mobile-agents-view.tsx`, data in
`src/hooks/use-agents-tab-work.ts`.

| Tab | What it holds | Count |
|---|---|---|
| **Unread** | Agents whose own chat is waiting on you or replied, chats blocked on you (even after you've looked, since they can't go on without you), AI reviews waiting on an answer or failed, then chats with output you haven't read, newest first. Inactive unread chats fold behind "N inactive hidden". A chat mid-turn waits for its outcome under Working. | Every row but the folded ones. Amber, pulsing while something is blocked on you. |
| **Working** | Chats with a turn running now, and AI reviews running. A turn blocked on you is under Unread, so each chat is in one place. Background tasks (a dev server left running) aren't the agent working, as on the header's Working pill. | Green. |
| **Agents** | Every agent as the agents-only rail draws it: a dot for its own chat, its name in bold when it wants you, a line in its voice, and counts of its chats that need you (amber) and are working (green). The chevron opens its chats under it, + starts one, ⋯ has New chat on…, Files and Setup. New agent is the last row. | None. |

Two or more chats one chat started stack into one row in Unread and Working, opening in place, and a started chat's row has a corner arrow before its title ([started-chats.md](started-chats.md)). Each chat row has a dot for its state, its title (bold while unread), what it's
blocked on or what its agent said at the end of its turn
(`docs/chat-status-lines.md`) with the size of an ask, then its agent and
where it runs, and its age, "needs input" or "working" at the end.

**Remembered.** The tab is kept per browser (`ri.client.phoneChatLens`,
`src/lib/client/chat-lens.ts`), so coming back from a chat, or to the app
tomorrow, lands where you were. It opens on Unread the first time, what the
tab led with before. The agents start folded, and the ones you open stay open
on that phone (`ri.client.phoneOpenAgents`). These folds are the phone's own:
the desktop rail's (`workspaces.collapsed`) had most agents open, which is the
long list this replaces.

**The tab bar's badge** reads the same counts: blocked on you, else working,
else unread.

**Search** in the top bar searches chats on the Agents tab ("Search chats…",
`ChatSearchModal`), the way to any chat by its name or something said in it.
With no query it lists recent chats. On a phone the search takes the whole
screen and its field is 16px, so iOS doesn't zoom into it. Every other tab's
search stays tasks, notes and areas.

With no agents there's nothing to sort, so the tab is just the way to add one.

## An agent's Chats tab

`src/components/agents/agent-overview.tsx`, the same row of tabs at desktop
size, inline like the rail's Agents | Recent switch.

| Tab | What it holds |
|---|---|
| **All** (default) | Pinned chats, then every other chat newest first, each with its state's dot, inactive ones folded. Then the tasks its chats are working and its previews. |
| **Unread** | Blocked and unread chats, the count amber. |
| **Working** | Chats running now, the count green. |

The tab is kept per browser for every agent (`ri.client.agentChatLens`).

## Tests

`src/components/mobile/mobile-agents-lenses.browser.test.ts` runs the real
components over a seeded cache: the order and contents of each tab, that the
counts and the tab bar's badge agree, that the phone ignores the desktop's
folds and keeps its own across a reload, and the agent's Chats tab.
`src/lib/client/chat-lens.test.ts` covers the stored values.
