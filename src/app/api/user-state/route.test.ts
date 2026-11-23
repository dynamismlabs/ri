import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * PATCH /api/user-state for the coordinator's name. The name is stored one
 * line, null when blank (the default), and capped. It lives in the app main
 * chat's brief, which is fixed at spawn, so a real change recycles that chat
 * and nothing else.
 */

const recycleAppMainChats = vi.fn<() => Promise<void>>(async () => {});
vi.mock('@/lib/executor/adapter', () => ({
  recycleAppMainChats: () => recycleAppMainChats(),
}));

let stored: Record<string, unknown> = { id: 1, coordinatorName: null };
const updateUserState = vi.fn((input: Record<string, unknown>) => {
  stored = { ...stored, ...input };
  return stored;
});
vi.mock('@/lib/db/queries', () => ({
  getUserState: () => stored,
  updateUserState: (input: Record<string, unknown>) => updateUserState(input),
}));

// An upload exists on disk only under this name.
const UPLOADED = '01a0f8ec-b320-7fb4-8368-699677275515.svg';
vi.mock('@/lib/attachments/save', () => ({
  attachmentPath: (fileName: string) => (fileName === UPLOADED ? __filename : `/nonexistent/${fileName}`),
}));

const { PATCH } = await import('./route');

function patch(body: unknown) {
  return PATCH(new NextRequest('http://localhost/api/user-state', { method: 'PATCH', body: JSON.stringify(body) }));
}

beforeEach(() => {
  stored = { id: 1, coordinatorName: null };
  recycleAppMainChats.mockClear();
  updateUserState.mockClear();
});

describe('subscription usage warning thresholds', () => {
  const fields = ['usageWarningAboveZero', 'usageWarning50', 'usageWarning80', 'usageWarning90'];
  const choices = fields.flatMap((field) => [true, false, null].map((value) => [field, value] as const));

  it.each(choices)('saves %s as %s without changing the main chat', async (field, value) => {
    const res = await patch({ [field]: value });
    expect(res.status).toBe(200);
    expect(updateUserState).toHaveBeenCalledWith({ [field]: value });
    expect(recycleAppMainChats).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean choice and the retired single switch', async () => {
    expect((await patch({ usageWarningAboveZero: 0 })).status).toBe(400);
    expect((await patch({ usageWarning80: 'off' })).status).toBe(400);
    expect((await patch({ usageWarnings: false })).status).toBe(400);
    expect(updateUserState).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/user-state coordinatorName', () => {
  it('stores a new name on one line and recycles the main chat', async () => {
    const res = await patch({ coordinatorName: '  Chief\nof   Staff ' });
    expect(res.status).toBe(200);
    expect(updateUserState).toHaveBeenCalledWith({ coordinatorName: 'Chief of Staff' });
    expect(recycleAppMainChats).toHaveBeenCalledTimes(1);
  });

  it('stores a blank name as null, back to the default', async () => {
    stored.coordinatorName = 'Atlas';
    await patch({ coordinatorName: '   ' });
    expect(updateUserState).toHaveBeenCalledWith({ coordinatorName: null });
    expect(recycleAppMainChats).toHaveBeenCalledTimes(1);
  });

  it('leaves the main chat alone when the name did not change', async () => {
    stored.coordinatorName = 'Atlas';
    await patch({ coordinatorName: 'Atlas ' });
    expect(recycleAppMainChats).not.toHaveBeenCalled();
  });

  it('leaves the main chat alone for every other setting', async () => {
    await patch({ name: 'Trey' });
    expect(recycleAppMainChats).not.toHaveBeenCalled();
  });

  it('refuses a name that is too long or not text', async () => {
    const long = await patch({ coordinatorName: 'x'.repeat(41) });
    expect(long.status).toBe(400);
    const notText = await patch({ coordinatorName: 7 });
    expect(notText.status).toBe(400);
    expect(updateUserState).not.toHaveBeenCalled();
  });

  it('still saves the name when the recycle fails', async () => {
    recycleAppMainChats.mockRejectedValueOnce(new Error('runner down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await patch({ coordinatorName: 'Atlas' });
    expect(res.status).toBe(200);
    expect(stored.coordinatorName).toBe('Atlas');
    warn.mockRestore();
  });
});

describe('PATCH /api/user-state coordinator look', () => {
  const image = { fileName: UPLOADED, originalName: 'art.svg', mimeType: 'image/svg+xml', size: 900, uploadedAt: '2026-10-01T00:00:00.000Z' };

  it('saves an emoji, a palette color and an uploaded image', async () => {
    const res = await patch({ coordinatorEmoji: '🍞', coordinatorColor: '#F2A93B', coordinatorImage: image });
    expect(res.status).toBe(200);
    expect(updateUserState).toHaveBeenCalledWith({ coordinatorEmoji: '🍞', coordinatorColor: '#f2a93b', coordinatorImage: image });
  });

  it('refuses an image that was never uploaded', async () => {
    const res = await patch({ coordinatorImage: { ...image, fileName: '01a0f8ec-b320-7fb4-8368-000000000000.png' } });
    expect(res.status).toBe(400);
    expect(updateUserState).not.toHaveBeenCalled();
  });

  it('refuses a color off the palette and a word for an emoji', async () => {
    expect((await patch({ coordinatorColor: '#000001' })).status).toBe(400);
    expect((await patch({ coordinatorEmoji: 'bread' })).status).toBe(400);
    expect(updateUserState).not.toHaveBeenCalled();
  });

  it('records the first-run conversation as done, and refuses a non-timestamp', async () => {
    const at = '2026-10-01T12:00:00.000Z';
    expect((await patch({ coordinatorIntroducedAt: at })).status).toBe(200);
    expect(updateUserState).toHaveBeenCalledWith({ coordinatorIntroducedAt: at });
    expect((await patch({ coordinatorIntroducedAt: 'soon' })).status).toBe(400);
  });

  it('changing the look leaves the main chat running', async () => {
    await patch({ coordinatorEmoji: '🍞' });
    expect(recycleAppMainChats).not.toHaveBeenCalled();
  });
});
