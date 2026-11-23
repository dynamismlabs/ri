/**
 * What connected servers say about using their tools reaches a chat's model only where the chat
 * reaches the integrations endpoint, for that endpoint's place (src/lib/integrations/server-instructions.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestHome, type TestHome } from '@/test/fixtures/home';
import { installFakeHarness, type FakeHarness } from '@/test/fixtures/fake-harness';
import * as q from '@/lib/db/queries';
import type { HarnessId } from '@/lib/harness/registry';
import { buildSessionSpec, type SessionSpecInput } from './session-spec';

const instructions = vi.hoisted(() => ({ chatConnectorInstructions: vi.fn() }));
vi.mock('@/lib/integrations/server-instructions', () => instructions);
vi.setConfig({ testTimeout: 60_000 });

const BLOCK = '<connector-instructions>\n<server-instructions name="People">\nStart with search_people.\n</server-instructions>\n</connector-instructions>';

let home: TestHome;
let fake: FakeHarness;
beforeEach(async () => {
  home = await createTestHome({ prefix: 'ri-spec-server-guidance-' });
  instructions.chatConnectorInstructions.mockReset().mockResolvedValue(BLOCK);
});
afterEach(async () => {
  fake?.restore();
  await home.cleanup();
});

function input(harness: HarnessId, over: Partial<SessionSpecInput>): SessionSpecInput {
  fake = installFakeHarness(harness);
  return {
    chatSessionId: q.createChatSession({ type: over.sessionType ?? 'coordinator', harness, status: 'active', workspaceId: over.workspaceId ?? null }).id,
    harness, cwd: home.root, sessionType: 'coordinator', workspaceId: null, surfaceKind: null, surfaceRef: null,
    existingExternalSessionId: null, permissionMode: 'auto_all', prePlanMode: null, model: null, modelVariant: null, effort: null,
    ...over,
  };
}

describe('connector instructions in a chat\'s session', () => {
  it('tells Ri\'s own chat what its apps say, for Ri\'s place', async () => {
    const args = input('claude', {});
    const spec = await buildSessionSpec(args);
    expect(instructions.chatConnectorInstructions).toHaveBeenCalledWith({ chatId: args.chatSessionId, workspaceId: null });
    expect(spec.instructions).toContain(BLOCK);
  });

  it('tells an agent\'s chat its own place\'s instructions', async () => {
    const workspace = q.createWorkspace({ name: 'Family', cwd: home.root, isGit: false, integrationScopes: [{ toolkitId: 'app_people' }] as never });
    const execution = q.createExecution({ workspaceId: workspace.id });
    const args = input('claude', { sessionType: 'execution', workspaceId: workspace.id, executionId: execution.id });
    const spec = await buildSessionSpec(args);
    expect(instructions.chatConnectorInstructions).toHaveBeenCalledWith({ chatId: args.chatSessionId, workspaceId: workspace.id });
    expect(spec.instructions).toContain(BLOCK);
  });

  it('sends them with each message on a harness that drops session instructions', async () => {
    const spec = await buildSessionSpec(input('cursor', {}));
    expect(spec.messagePreamble).toContain(BLOCK);
    expect(spec.instructions ?? '').not.toContain(BLOCK);
  });

  it('leaves them out of a chat with no account tools, and out of a chat whose instructions fail to load', async () => {
    const source = q.createAppSource({ name: 'Tide Log', folder: home.root, createdByRi: true });
    const builder = await buildSessionSpec(input('claude', { sessionType: 'content', surfaceKind: 'app-builder', surfaceRef: source.id }));
    expect(instructions.chatConnectorInstructions).not.toHaveBeenCalled();
    expect(builder.instructions ?? '').not.toContain('<connector-instructions>');
    instructions.chatConnectorInstructions.mockRejectedValueOnce(new Error('runtime down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spec = await buildSessionSpec(input('claude', {}));
    expect(spec.instructions ?? '').not.toContain('<connector-instructions>');
    expect(warn).toHaveBeenCalledWith('[executor] connector instructions were left out:', 'runtime down');
    warn.mockRestore();
  });
});
