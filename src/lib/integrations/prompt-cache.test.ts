import { describe, expect, it, vi } from 'vitest';
import { McpPromptCache } from './prompt-cache';

const list = (...names: string[]) => names.map((name) => ({ name }));

describe('McpPromptCache', () => {
  it('asks the app once, shares a read under way, and asks again after the app says its prompts changed', async () => {
    const cache = new McpPromptCache();
    const fetch = vi.fn(async () => list('daily'));
    const [a, b] = await Promise.all([cache.read(fetch), cache.read(fetch)]);
    expect(a).toEqual(list('daily'));
    expect(b).toBe(a);
    expect(await cache.read(fetch)).toBe(a);
    expect(fetch).toHaveBeenCalledOnce();
    cache.changed();
    fetch.mockResolvedValueOnce(list('daily', 'weekly'));
    expect(await cache.read(fetch)).toEqual(list('daily', 'weekly'));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('never keeps a list read before a change it overlapped', async () => {
    const cache = new McpPromptCache();
    let finish!: (value: { name: string }[]) => void;
    const before = cache.read(() => new Promise((resolve) => { finish = resolve; }));
    cache.changed();
    finish(list('old'));
    expect(await before).toEqual(list('old'));
    const fetch = vi.fn(async () => list('new'));
    expect(await cache.read(fetch)).toEqual(list('new'));
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('forgets a failed read, so the next one asks again', async () => {
    const cache = new McpPromptCache();
    await expect(cache.read(async () => { throw new Error('down'); })).rejects.toThrow('down');
    expect(await cache.read(async () => list('back'))).toEqual(list('back'));
  });
});
