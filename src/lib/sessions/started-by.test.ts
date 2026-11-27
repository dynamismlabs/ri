import { describe, expect, it } from 'vitest';
import { entryNewest, groupRecentSessions, stackStartedChats, startedByTitle, type StartedBy } from './started-by';

function by(over: Partial<StartedBy> & Pick<StartedBy, 'sessionId'>): StartedBy {
  return {
    requestId: `req-${over.sessionId}`, address: `session:${over.sessionId}`, kind: 'chat', label: 'Parent', executionId: null,
    workspaceId: 'ws-shop', workspaceName: 'Shop', workspaceEmoji: null, workspaceAttachments: null, workspaceAreaId: null,
    archived: false, requestStatus: 'working', ...over,
  };
}

function session(id: string, minute: number, startedBy: StartedBy | null = null, workspaceId = 'ws-shop') {
  const at = `2026-11-26T10:${String(minute).padStart(2, '0')}:00.000Z`;
  return { id, workspaceId, startedAt: at, lastActivityAt: at, unreadMarkerAt: null, startedBy };
}

describe('groupRecentSessions', () => {
  it('puts started chats under the chat that started them, folded into one entry', () => {
    const parent = session('plan', 1);
    const a = session('email', 5, by({ sessionId: 'plan' }));
    const b = session('copy', 3, by({ sessionId: 'plan' }));
    const mine = session('rounding', 4);
    const entries = groupRecentSessions([a, mine, b, parent]);
    expect(entries.map((e) => e.key)).toEqual(['session:plan', 'rounding']);
    const group = entries[0]!;
    expect(group.kind).toBe('group');
    if (group.kind !== 'group') return;
    expect(group.parent?.id).toBe('plan');
    // Newest first inside, and the group ranks by its newest member.
    expect(group.children.map((c) => c.id)).toEqual(['email', 'copy']);
    expect(entryNewest(group).id).toBe('email');
  });

  it('gives a main chat’s started chats a group of their own, under its address', () => {
    const main = by({ sessionId: 'main-1', address: 'agent:ws-shop', kind: 'agent', label: null });
    const later = by({ sessionId: 'main-2', address: 'agent:ws-shop', kind: 'agent', label: null });
    const entries = groupRecentSessions([session('restock', 2, main), session('tag', 1, later)]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'group', key: 'agent:ws-shop', parent: null });
  });

  it('leaves a started chat on its own when its starter isn’t in the list', () => {
    const orphan = session('review', 2, by({ sessionId: 'gone' }));
    expect(groupRecentSessions([orphan])).toEqual([{ kind: 'row', key: 'review', session: orphan }]);
  });

  it('only shows a main chat’s group when its agent passes the agent filter', () => {
    const fromMain = session('restock', 2, by({ sessionId: 'main', address: 'agent:ws-roast', kind: 'agent', workspaceId: 'ws-roast' }), 'ws-shop');
    expect(groupRecentSessions([fromMain], new Set(['ws-shop']))[0]).toMatchObject({ kind: 'row' });
    expect(groupRecentSessions([fromMain], new Set(['ws-roast']))[0]).toMatchObject({ kind: 'group' });
  });

  it('folds a started chat’s own started chats into the same group, one level deep', () => {
    const root = session('plan', 1);
    const child = session('research', 2, by({ sessionId: 'plan' }));
    const grandchild = session('sources', 3, by({ sessionId: 'research' }));
    const entries = groupRecentSessions([root, child, grandchild]);
    expect(entries).toHaveLength(1);
    const group = entries[0]!;
    if (group.kind !== 'group') throw new Error('expected a group');
    expect(group.key).toBe('session:plan');
    expect(group.children.map((c) => c.id)).toEqual(['sources', 'research']);
  });
});

describe('stackStartedChats', () => {
  const plan = by({ sessionId: 'plan' });
  const items = [
    { id: 'a', startedBy: plan },
    { id: 'mine', startedBy: null },
    { id: 'b', startedBy: plan },
    { id: 'lone', startedBy: by({ sessionId: 'other' }) },
  ];

  it('stacks two or more from one starter at the newest one’s place', () => {
    const out = stackStartedChats(items, 'working', (i) => i.startedBy);
    expect(out.map((e) => (e.kind === 'stack' ? `stack:${e.items.map((i) => i.id).join('+')}` : e.item.id))).toEqual(['stack:a+b', 'mine', 'lone']);
  });

  it('never stacks what needs approval', () => {
    const out = stackStartedChats(items, 'needsApproval', (i) => i.startedBy);
    expect(out.every((e) => e.kind === 'item')).toBe(true);
  });
});

describe('startedByTitle', () => {
  it('names a chat by its title, a main chat by its agent, and Ri’s by the coordinator', () => {
    expect(startedByTitle({ kind: 'chat', label: 'Plan the launch', workspaceName: 'Shop' }, 'Rye')).toBe('Plan the launch');
    expect(startedByTitle({ kind: 'agent', label: null, workspaceName: 'Shop' }, 'Rye')).toBe('Shop’s main chat');
    expect(startedByTitle({ kind: 'home', label: null, workspaceName: null }, 'Rye')).toBe('Rye');
  });
});
