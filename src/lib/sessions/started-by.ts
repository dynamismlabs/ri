import type { Attachment } from '@/lib/db/schema';
import { sessionHotnessKey, type SortableSession } from '@/lib/utils/session-sort';
import type { BucketId } from './classification';

/**
 * A chat another chat started (`delegate_work`), and the chat that started it.
 * Lists mark it, group it under that chat, or stack it with its siblings, and
 * its answer going back there is what keeps it out of Unread
 * (docs/started-chats.md).
 *
 * Derived from the delegation record (`agent_coordination_requests`), so it
 * needs no column of its own: the record already names both chats.
 */
export interface StartedBy {
  /** The delegation that started it. */
  requestId: string;
  /** The exact chat that started it. */
  sessionId: string;
  /**
   * The starter's stable address, the key its started chats group under. A
   * main chat's is its agent's (`agent:<id>`) or Ri's (`coordinator`), so the
   * chats one agent's main chat started stay together across New chat. Any
   * other chat's is `session:<id>`.
   */
  address: string;
  /** `chat` is an agent's chat, `agent` an agent's main chat, `home` Ri's own main chat. */
  kind: 'chat' | 'agent' | 'home';
  /** The starter's title when it's a chat. Main chats are named for their agent, or the coordinator. */
  label: string | null;
  executionId: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceEmoji: string | null;
  workspaceAttachments: Attachment[] | null;
  workspaceAreaId: string | null;
  /** An archived starter can't hold its chats in a list. */
  archived: boolean;
  /** The delegation's state: open until its answer goes back, then how it ended. */
  requestStatus: 'queued' | 'working' | 'waiting' | 'completed' | 'failed' | 'cancelled';
}

/** What every list row carries about where it came from. */
export interface StartedFields {
  startedBy?: StartedBy | null;
  /**
   * When this chat's answer went back to the chat that asked, while nothing
   * has happened in it since. Set, its latest outcome is already in that
   * chat, so it isn't unread or waiting on you (`isSessionUnread`,
   * `classifySession`). A new turn, yours or anyone's, clears it.
   */
  answerReturnedAt?: string | null;
}

/** The starter's name as lists show it. */
export function startedByTitle(startedBy: Pick<StartedBy, 'kind' | 'label' | 'workspaceName'>, coordinatorName: string): string {
  if (startedBy.kind === 'home') return coordinatorName;
  if (startedBy.kind === 'agent') return `${startedBy.workspaceName ?? 'Agent'}’s main chat`;
  return startedBy.label ?? 'Untitled chat';
}

export function isFinishedRequest(status: StartedBy['requestStatus']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

// ─── Recent: started chats under their starter ────────────────

type GroupableSession = SortableSession & StartedFields & { id: string; workspaceId: string | null };

export type RecentEntry<S extends GroupableSession> =
  | { kind: 'row'; key: string; session: S }
  /**
   * A starter and the chats it started. `parent` is the starter's own row
   * when the list has it. A main chat isn't a row in Recent, so its group
   * draws a row for it from `startedBy`.
   */
  | { kind: 'group'; key: string; parent: S | null; startedBy: StartedBy; children: S[] };

/**
 * Recent's rows, with every started chat under the chat that started it.
 *
 * A started chat whose starter is another chat in this list goes under that
 * chat's row. One a main chat started goes under a row for that main chat,
 * which Recent otherwise doesn't list, so the work it set going still shows
 * where it happened. A started chat whose starter isn't here (archived out
 * of the window, or narrowed away by the agent filter) stays its own row,
 * with the mark that says where it came from.
 *
 * A group sorts by its newest member, so a working started chat keeps its
 * starter near the top. Chats within a group are newest first.
 *
 * `agentFilter` is the agent pills' selection: a main chat's group row only
 * shows when its own agent is in it.
 */
export function groupRecentSessions<S extends GroupableSession>(
  sessions: readonly S[],
  agentFilter: ReadonlySet<string> | null = null,
): RecentEntry<S>[] {
  const byId = new Map(sessions.map((s) => [s.id, s] as const));
  const groups = new Map<string, { parent: S | null; startedBy: StartedBy; children: S[] }>();
  const rows: S[] = [];
  const holderOf = (s: S): string | null => {
    const by = s.startedBy;
    if (!by) return null;
    if (by.kind === 'chat') return byId.has(by.sessionId) && by.sessionId !== s.id ? by.address : null;
    if (agentFilter && !(by.workspaceId && agentFilter.has(by.workspaceId))) return null;
    return by.address;
  };
  // A started chat that started chats of its own takes them into the group
  // it's in: one level of folding, with each one's mark naming its own
  // starter. The walk stops at the first starter that isn't held, and at a
  // depth delegation itself refuses past.
  const rootOf = (s: S): { key: string; startedBy: StartedBy; parent: S | null } | null => {
    let current = s;
    let found: { key: string; startedBy: StartedBy; parent: S | null } | null = null;
    for (let depth = 0; depth < 10; depth++) {
      const key = holderOf(current);
      if (!key) break;
      const by = current.startedBy!;
      const parent = by.kind === 'chat' ? byId.get(by.sessionId)! : null;
      found = { key, startedBy: by, parent };
      if (!parent) break;
      current = parent;
    }
    return found;
  };
  const held = new Set<string>();
  for (const s of sessions) {
    const root = rootOf(s);
    if (!root) continue;
    held.add(s.id);
    const group = groups.get(root.key) ?? { parent: root.parent, startedBy: root.startedBy, children: [] };
    group.children.push(s);
    groups.set(root.key, group);
  }
  const heads = new Set<string>();
  for (const group of groups.values()) if (group.parent) heads.add(group.parent.id);
  for (const s of sessions) if (!held.has(s.id) && !heads.has(s.id)) rows.push(s);
  const entries: RecentEntry<S>[] = rows.map((session) => ({ kind: 'row', key: session.id, session }));
  for (const [key, group] of groups) {
    entries.push({ kind: 'group', key, parent: group.parent, startedBy: group.startedBy, children: sortNewest(group.children) });
  }
  return entries.sort((a, b) => entryHotness(b) - entryHotness(a));
}

/** The newest moment anything in the entry happened. */
export function entryHotness<S extends GroupableSession>(entry: RecentEntry<S>): number {
  if (entry.kind === 'row') return sessionHotnessKey(entry.session);
  return Math.max(entry.parent ? sessionHotnessKey(entry.parent) : 0, ...entry.children.map(sessionHotnessKey));
}

/** The entry's sessions, starter first. */
export function entrySessions<S extends GroupableSession>(entry: RecentEntry<S>): S[] {
  if (entry.kind === 'row') return [entry.session];
  return entry.parent ? [entry.parent, ...entry.children] : entry.children;
}

/** The session an entry dates and ranks by: its newest member. */
export function entryNewest<S extends GroupableSession>(entry: RecentEntry<S>): S {
  return entrySessions(entry).reduce((a, b) => (sessionHotnessKey(b) > sessionHotnessKey(a) ? b : a));
}

function sortNewest<S extends SortableSession>(list: S[]): S[] {
  return [...list].sort((a, b) => sessionHotnessKey(b) - sessionHotnessKey(a));
}

// ─── Status lists: siblings stack ─────────────────────────────

export type Stacked<T> = { kind: 'item'; item: T } | { kind: 'stack'; key: string; startedBy: StartedBy; items: T[] };

/**
 * A status list (the header's pills, Board's columns) keeps every chat in the
 * list for its own state, so a started chat can't sit under its starter: the
 * starter is usually in another list. Two or more started by the same chat
 * in one list stack into one entry that opens in place, at the position of
 * the newest. Needs approval never stacks: each one waits on a decision.
 */
export function stackStartedChats<T>(items: readonly T[], bucket: BucketId, startedByOf: (item: T) => StartedBy | null | undefined): Stacked<T>[] {
  if (bucket === 'needsApproval') return items.map((item) => ({ kind: 'item', item }));
  const counts = new Map<string, number>();
  for (const item of items) {
    const by = startedByOf(item);
    if (by) counts.set(by.address, (counts.get(by.address) ?? 0) + 1);
  }
  const out: Stacked<T>[] = [];
  const stacks = new Map<string, Extract<Stacked<T>, { kind: 'stack' }>>();
  for (const item of items) {
    const by = startedByOf(item);
    if (!by || (counts.get(by.address) ?? 0) < 2) {
      out.push({ kind: 'item', item });
      continue;
    }
    const existing = stacks.get(by.address);
    if (existing) existing.items.push(item);
    else {
      const stack = { kind: 'stack' as const, key: by.address, startedBy: by, items: [item] };
      stacks.set(by.address, stack);
      out.push(stack);
    }
  }
  return out;
}
