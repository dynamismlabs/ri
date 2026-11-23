import { describe, expect, it, vi } from 'vitest';
import {
  currentChatType,
  currentHomeApiPath,
  fetchHomeApi,
  isLegacyHomeApiPath,
  legacyHomeApiPath,
  withCurrentNames,
} from './legacy-names';

describe('old names for the coordinator and Ri’s tools', () => {
  it('reads an old /api/orchestrator/ path as its /api/home/ path and leaves others alone', () => {
    expect(currentHomeApiPath('/api/orchestrator/mcp')).toBe('/api/home/mcp');
    expect(currentHomeApiPath('/api/orchestrator/actions/create_task')).toBe('/api/home/actions/create_task');
    expect(currentHomeApiPath('/api/orchestrator/browser/mcp')).toBe('/api/home/browser/mcp');
    expect(currentHomeApiPath('/api/home/mcp')).toBe('/api/home/mcp');
    expect(currentHomeApiPath('/api/orchestrator-chat')).toBe('/api/orchestrator-chat');
    expect(currentHomeApiPath('/api/tasks')).toBe('/api/tasks');
    expect(isLegacyHomeApiPath('/api/orchestrator/mcp')).toBe(true);
    expect(isLegacyHomeApiPath('/api/home/mcp')).toBe(false);
  });

  it('gives the old path for a home on an older release, only under /api/home/', () => {
    expect(legacyHomeApiPath('/api/home/actions/register_device')).toBe('/api/orchestrator/actions/register_device');
    expect(legacyHomeApiPath('/api/home')).toBeNull();
    expect(legacyHomeApiPath('/api/tasks')).toBeNull();
  });

  it('replaces the old address, schedule target and chat type in action input', () => {
    expect(withCurrentNames('message_agent', { target: 'orchestrator', message: 'hi' })).toEqual({ target: 'coordinator', message: 'hi' });
    expect(withCurrentNames('create_trigger', { targetKind: 'orchestrator' })).toEqual({ targetKind: 'coordinator' });
    expect(withCurrentNames('search_sessions', { type: 'orchestration' })).toEqual({ type: 'coordinator' });
    // `type` means something else on other actions.
    expect(withCurrentNames('create_note', { type: 'orchestration' })).toEqual({ type: 'orchestration' });
    const input = { target: 'agent' };
    expect(withCurrentNames('message_agent', input)).toEqual({ target: 'agent' });
    expect(input).toEqual({ target: 'agent' });
  });

  it('maps an imported chat’s old type', () => {
    expect(currentChatType('orchestration')).toBe('coordinator');
    expect(currentChatType('execution')).toBe('execution');
  });

  describe('fetchHomeApi', () => {
    const reply = (status: number) => new Response(null, { status });

    it('uses the new path when the home answers there', async () => {
      const call = vi.fn(async () => reply(200));
      expect((await fetchHomeApi('/api/home/actions/x', call)).status).toBe(200);
      expect(call.mock.calls).toEqual([['/api/home/actions/x']]);
    });

    it.each([404, 401, 403])('tries the old path when the home answers %i, as an older release does', async (status) => {
      const call = vi.fn(async (path: string) => reply(path.startsWith('/api/orchestrator/') ? 200 : status));
      expect((await fetchHomeApi('/api/home/actions/x', call)).status).toBe(200);
      expect(call.mock.calls).toEqual([['/api/home/actions/x'], ['/api/orchestrator/actions/x']]);
    });

    it('keeps the first answer when the old path doesn’t exist either', async () => {
      const call = vi.fn(async (path: string) => reply(path.startsWith('/api/orchestrator/') ? 404 : 403));
      expect((await fetchHomeApi('/api/home/actions/x', call)).status).toBe(403);
    });

    it('never retries other failures, or a path with no old form', async () => {
      const failing = vi.fn(async () => reply(500));
      expect((await fetchHomeApi('/api/home/actions/x', failing)).status).toBe(500);
      expect(failing).toHaveBeenCalledTimes(1);
      const identity = vi.fn(async () => reply(404));
      expect((await fetchHomeApi('/api/home', identity)).status).toBe(404);
      expect(identity).toHaveBeenCalledTimes(1);
    });
  });
});
