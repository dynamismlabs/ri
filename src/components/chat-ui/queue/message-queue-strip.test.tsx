import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessageQueueStrip, queuedMessagePreview, sendNowHint } from './message-queue-strip';

const file = { fileName: '01a2.png', originalName: 'login screen.png', mimeType: 'image/png', size: 1, uploadedAt: '2026-11-24T00:00:00.000Z' };

describe('queuedMessagePreview', () => {
  it('names files and references the way the message box showed them', () => {
    expect(queuedMessagePreview('Compare [[file:01a2.png]] with [[task:01a2-task]] and [[note:n1]]', [file]))
      .toBe('Compare login screen.png with @task and @note');
    expect(queuedMessagePreview('[[file:missing.pdf]]')).toBe('a file');
  });

  it('keeps a long message to one readable line', () => {
    expect(queuedMessagePreview('First line\n\nsecond **bold** line')).toBe('First line · second bold line');
  });
});

describe('sendNowHint', () => {
  it('says where a message sent now lands', () => {
    expect(sendNowHint(true, false)).toBe('The agent reads it at its next step in this turn');
    expect(sendNowHint(true, true)).toBe('Stops the current turn and sends this one');
    expect(sendNowHint(false, true)).toBe('Sends it now. The rest follow once its turn finishes');
    for (const hint of [sendNowHint(true, false), sendNowHint(true, true), sendNowHint(false, false)]) expect(hint).not.toMatch(/[—;]/);
  });
});

describe('MessageQueueStrip', () => {
  const handlers = { onSendNow: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() };
  const messages = [
    { id: 'a', content: 'then write the tests', attachments: [] },
    { id: 'b', content: 'look at [[file:01a2.png]]', attachments: [file] },
  ];

  it('lists each queued message with Send now, Edit and Delete', () => {
    const html = renderToStaticMarkup(<MessageQueueStrip messages={messages} working sendNowStopsTurn={false} {...handlers} />);
    expect(html).toContain('aria-label="Queued messages"');
    expect(html).toContain('then write the tests');
    expect(html).toContain('look at login screen.png');
    expect(html.match(/Send now/g)).toHaveLength(2);
    expect(html.match(/aria-label="Edit queued message"/g)).toHaveLength(2);
    expect(html.match(/aria-label="Delete queued message"/g)).toHaveLength(2);
    expect(html).not.toContain('Paused');
  });

  it('waits a moment before saying the queue is paused, so the gap between turns never flashes it', () => {
    // The first render is the instant the chat goes idle.
    const html = renderToStaticMarkup(<MessageQueueStrip messages={messages} working={false} sendNowStopsTurn={false} {...handlers} />);
    expect(html).not.toContain('Paused');
  });

  it('draws nothing for an empty queue', () => {
    expect(renderToStaticMarkup(<MessageQueueStrip messages={[]} working sendNowStopsTurn={false} {...handlers} />)).toBe('');
  });
});
