import { describe, expect, it } from 'vitest';
import { startedArchiveToast } from './started-archive-copy';

const a = { id: 'a', label: 'Review the copy' };
const b = { id: 'b', label: 'Compare rates' };

describe('startedArchiveToast', () => {
  it('says nothing after one archive that touched no started chats', () => {
    expect(startedArchiveToast({ archived: [], kept: [] }, { kind: 'parent', label: 'Plan' })).toBeNull();
    expect(startedArchiveToast({ archived: [], kept: [] }, { kind: 'bulk' })).toBeNull();
  });

  it('counts what went with the chat and names what stayed, and why', () => {
    expect(startedArchiveToast({ archived: [a, b], kept: [{ id: 'c', label: 'Draft the email', reason: 'working' }] }, { kind: 'parent', label: 'Plan the launch' }))
      .toEqual({ title: 'Archived Plan the launch and 2 chats it started', description: 'Draft the email is still working, so it stays open.' });
    expect(startedArchiveToast({ archived: [a], kept: [] }, { kind: 'parent', label: null }))
      .toEqual({ title: 'Archived the chat and 1 chat it started', description: null });
  });

  it('lists several that stayed, the first few by name', () => {
    const kept = [
      { id: '1', label: 'One', reason: 'working' as const },
      { id: '2', label: 'Two', reason: 'uncommitted' as const },
      { id: '3', label: 'Three', reason: 'needs_you' as const },
      { id: '4', label: 'Four', reason: 'working' as const },
    ];
    expect(startedArchiveToast({ archived: [], kept }, { kind: 'bulk' })?.description)
      .toBe('4 chats stay open. One is still working. Two has files that aren’t committed. Three needs you. And 1 more.');
  });

  it('answers Archive finished even when there was nothing to take', () => {
    expect(startedArchiveToast({ archived: [], kept: [] }, { kind: 'finished' })).toEqual({ title: 'Nothing finished to archive', description: null });
    expect(startedArchiveToast({ archived: [a, b], kept: [] }, { kind: 'finished' })?.title).toBe('Archived 2 finished chats');
  });

  it('never uses a dash or a semicolon', () => {
    const all = [
      startedArchiveToast({ archived: [a], kept: [{ id: 'c', label: 'C', reason: 'uncommitted' }] }, { kind: 'parent', label: 'P' }),
      startedArchiveToast({ archived: [a, b], kept: [{ id: 'c', label: 'C', reason: 'needs_you' }, { id: 'd', label: 'D', reason: 'working' }] }, { kind: 'bulk' }),
    ].flatMap((m) => [m?.title ?? '', m?.description ?? '']).join(' ');
    expect(all).not.toMatch(/[—–;]/);
  });
});
