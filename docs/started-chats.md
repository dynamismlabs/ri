# Chats started by other chats

A chat another chat started (`delegate_work`) reports to that chat: its answer
goes back there, and the starter carries on. On a real Home in November 2026,
30% of the chats touched in a week were started this way (37 of 122), one main
chat had started 19, 29 of the 46 unread chats were started chats, and every
open started chat had already sent its answer back. People still step into
them: 113 of 135 had been opened and 46 written in. So they are marked and
grouped, never hidden.

## What counts

A started chat is a delegation's target (`agent_coordination_requests`,
`kind = 'delegation'`). Nothing new is stored: the record already names both
chats, so `startedByForChats` (`src/lib/db/coordination-queries.ts`) reads it by
id list. A chat carries `startedBy` when a delegation made it, or made its
execution (a chat you opened later in a started execution is still that work).
A delegation into an execution that already existed marks only the chat it made.

The starter is grouped by its address (`requests.source_address`): a main
chat's is its agent's (`agent:<id>`) or Ri's (`coordinator`), so the chats one
agent's main chat started stay together across New chat. Any other chat's is
`session:<id>`. `StartedBy.kind` says which: `chat`, `agent` or `home`.

Questions to a main chat (`message_agent` with a reply owed) start no chat and
aren't covered. Scheduled runs aren't either: none were open on the real Home.

## Not unread twice

A started chat's answer lands in the chat that asked, which then goes unread
itself. So once the answer has gone back, the started chat is neither unread
nor waiting on you (`answerReturnedAt`, set by `startedChatActivity`):

- An answer counts once it's on its way: the terminal delivery is queued,
  delivered or accepted. One the starter could never take (it was archived)
  landed nowhere, so the chat stays unread as usual.
- Any later turn clears it: a run queued in the chat after the answer. That's
  you writing in it, or another chat's message. From then on it reads like any
  chat. Checked against the real Home: of 132 answered started chats, 77 had
  no turn after, 37 had one because the person wrote in them, and 18 because
  another chat sent a one-way message whose reply only that chat holds. None
  came from timing.
- `isSessionUnread` (`src/lib/utils/session-sort.ts`) then counts only Mark as
  unread, and `classifySession` returns null instead of Waiting, as it does
  for a settled import. Needs approval and Working come first, so a chat that
  needs you always shows.

Every list endpoint adds the two fields through `withStartedChats`: the rail,
Recent's feed, an agent's chats, search, a chat's own record, the needs-review
list (which drops the returned ones) and the desktop dock's counts. On the real
Home it took Unread from 42 to 23.

## Where it shows

| Surface | What it does |
| --- | --- |
| Every chat row | A corner arrow (`StartedMark`) before the title, its tooltip naming the starter. Chats you started carry nothing. Recent, Pinned, the agent tree, an agent's Chats tab, chat search, the phone's rows. |
| A started chat's header | **from** and the starter's name after the title (`StartedFromLink`), opening it. Its first message already has the sender chip. |
| Recent | Started chats sit under their starter, folded (`groupRecentSessions`, `RecentGroup`). The fold line counts them and says what they're doing: needs you, unread, working. A main chat isn't a Recent row, so one that started chats in the list stands in as their group's head, opening that main chat. A starter not in the list (archived out of the window, or narrowed away by the agent pills) leaves its chats as their own rows, marked. A started chat's own started chats fold into the same group. A group ranks and dates by its newest member, and folds as inactive only when everything in it has. Open groups are kept per browser (`ri.client.openStartedGroups`). While selecting chats to archive the list is flat. |
| Header pills, Board, the phone's Unread and Working | Each chat stays in the list for its own state, so a started chat can't sit under its starter there. Two or more from one starter in one list stack into one row or card that opens in place (`stackStartedChats`), at the newest one's place. Needs approval never stacks. Counts still count each chat. A lone started chat shows the arrow, and a Board card a from line. |
| Tools | **Started chats** in a chat's Tools box, its folded strip and the panel's More menu, and as a tab beside an agent's main chat. Shown once it has started one. The row reads like the agent's Chats row: who needs you, else how many work, else how many are open. |

## The Started chats list

`StartedChatsList` (`src/components/chat-ui/coordination/`) lists everything a
starter started (`listStartedChats`: an execution's chats, or a main chat by
its address), needs you first, then working, then newest. The second line is
the state (Working, Returned, Failed, Cancelled) and what the chat said, or why
it stopped. Archived ones fold behind one line. It refreshes every 15 seconds
while shown, and its dots read the runtime's live sets.

**Archive finished** takes the ones that returned or stopped, that nothing runs
or waits in, and that you never wrote in or pinned (`isFinishedUntouched`).
Each archives the usual way, never forced: one with files it never committed
refuses and stays.

## Archiving a starter

Archiving a chat archives its execution's finished started chats with it, on
the same terms (`archiveFinishedStartedChats`, called from the archive
operation after the chat itself is archived). Ones still working, waiting on
you, or with uncommitted files stay, and the reply names them, so the toast
can: "Archived Plan the launch and 2 chats it started. Draft the email is still
working, so it stays open." Bulk archive sums them ("Also archived 3 chats they
started"), leaving out chats that were ticked themselves. A failure here only
leaves them open: the chat itself is already archived.

## Tests

`src/lib/db/started-chats.test.ts` runs the queries, the rule and the cascade
on a test Home. `src/lib/sessions/started-by.test.ts` covers grouping and
stacking, `started-archive-copy.test.ts` the toast's words, and
`src/lib/client/started-folds.test.ts` the stored folds.
