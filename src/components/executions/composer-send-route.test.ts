import { describe, expect, it } from 'vitest';
import { appendDraft, composerSendRoute, queuePlaceholder } from './composer-send-route';

describe('composerSendRoute', () => {
  const chat = (working: boolean, takesMessagesMidTurn = true, queueAvailable = true) => ({ working, takesMessagesMidTurn, queueAvailable });

  it('sends as before when the chat is idle, whatever the key', () => {
    for (const mode of ['auto', 'queue', 'now'] as const) expect(composerSendRoute(chat(false), mode)).toBe('send');
  });

  it('queues on the send key and the button while the chat works', () => {
    expect(composerSendRoute(chat(true), 'auto')).toBe('queue');
    expect(composerSendRoute(chat(true), 'queue')).toBe('queue');
  });

  it('sends now straight into the turn where the harness takes messages mid-turn', () => {
    expect(composerSendRoute(chat(true, true), 'now')).toBe('send');
  });

  it('sends now through the queue, which stops the turn first, where it can not', () => {
    expect(composerSendRoute(chat(true, false), 'now')).toBe('queue-and-send-now');
  });

  it('keeps the ordinary send in a chat without a queue (a team\'s shared chat)', () => {
    expect(composerSendRoute(chat(true, true, false), 'auto')).toBe('send');
    expect(composerSendRoute(chat(true, false, false), 'now')).toBe('send');
  });
});

describe('queuePlaceholder', () => {
  it('names the key for Send now on a computer, and leaves it out on a phone', () => {
    expect(queuePlaceholder(false)).toBe('Queue a follow-up, ⌘↩ to send now');
    expect(queuePlaceholder(true)).toBe('Queue a follow-up');
    // Website voice: no long dashes or semicolons in copy.
    expect(queuePlaceholder(false)).not.toMatch(/[—;]/);
  });
});

describe('appendDraft', () => {
  const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

  it('puts a queued message after what is already in the box', () => {
    expect(appendDraft({ type: 'doc', content: [paragraph('typed')] }, { type: 'doc', content: [paragraph('queued')] }))
      .toEqual({ type: 'doc', content: [paragraph('typed'), paragraph('queued')] });
  });

  it('copes with an empty or missing document on either side', () => {
    expect(appendDraft(null, { type: 'doc', content: [paragraph('queued')] })).toEqual({ type: 'doc', content: [paragraph('queued')] });
    expect(appendDraft({ type: 'doc' }, undefined)).toEqual({ type: 'doc', content: [] });
  });
});
