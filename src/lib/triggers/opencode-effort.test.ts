/**
 * OpenCode effort is effort. agentex 0.0.51 reports the levels an OpenCode
 * model offers as its `supportedEfforts` and sends `config.effort` as the
 * model's variant, so a schedule, the heartbeat and the chats they start keep
 * OpenCode's effort the way they keep every provider's.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProvider } from '@agentex/agent';
import { createTestHome, type TestHome } from '@/test/fixtures/home';
import { installFakeHarness, type FakeHarness } from '@/test/fixtures/fake-harness';

let home: TestHome;
let fake: FakeHarness;

const sonnet = 'anthropic/claude-sonnet-5-5';
const flash = 'opencode/hy4-flash-free';

beforeEach(async () => {
  home = await createTestHome({ prefix: 'ri-opencode-effort-' });
  fake = installFakeHarness('opencode');
  getProvider('opencode').listModels = async () => [
    { id: sonnet, name: 'Claude Sonnet 5.5', supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
    // OpenCode models name no default level, and some offer no Medium.
    { id: flash, name: 'Hy4 flash Free', supportedEfforts: ['none', 'high'] },
  ];
});

afterEach(async () => {
  (await import('@/lib/executor/adapter'))._resetExecutorState();
  fake?.restore();
  await home?.cleanup();
});

async function run(name: string, input: Record<string, unknown> = {}) {
  const { runAction } = await import('@/lib/actions/dispatch');
  return runAction(name, input, { remote: false });
}

async function finished(runId: string) {
  const q = await import('@/lib/db/queries');
  await vi.waitFor(() => expect(['completed', 'failed']).toContain(q.getRun(runId)?.status), { timeout: 15_000 });
  return q.getRun(runId)!;
}

async function fire(extra: Record<string, unknown>) {
  const q = await import('@/lib/db/queries');
  const { dispatchRun } = await import('@/lib/runs/dispatch');
  const workspace = q.createWorkspace({ name: 'Effort agent', cwd: home.root, isGit: false });
  const created = await run('create_trigger', {
    name: 'Thinks hard', targetKind: 'workspace', workspaceId: workspace.id, kind: 'manual',
    prompt: 'Think it through', provider: 'opencode', ...extra,
  });
  expect(created.ok).toBe(true);
  const trigger = q.getTrigger((created.result as { trigger: { id: string } }).trigger.id)!;
  const result = await dispatchRun({ trigger, triggerKind: 'manual' });
  expect(await finished(result.run.id)).toMatchObject({ status: 'completed' });
  return { trigger, chat: result.chatSession! };
}

describe('OpenCode effort', () => {
  it('keeps the Codex Home default when an OpenCode cron is created and runs', async () => {
    const q = await import('@/lib/db/queries');
    const { dispatchRun } = await import('@/lib/runs/dispatch');
    const defaults = { defaultHarness: 'codex' as const, defaultModel: 'gpt-6.2-sol', defaultEffort: 'xhigh' as const };
    q.updateUserState(defaults);

    const created = await run('create_trigger', {
      name: 'OpenCode briefing', targetKind: 'coordinator', kind: 'cron',
      cronExpression: '0 8 * * *', timezone: 'UTC',
      prompt: 'Prepare the briefing', provider: 'opencode', model: sonnet, effort: 'high',
    });
    expect(created.ok).toBe(true);
    expect(q.getUserState()).toMatchObject(defaults);

    const trigger = q.getTrigger((created.result as { trigger: { id: string } }).trigger.id)!;
    const result = await dispatchRun({ trigger, triggerKind: 'cron' });
    expect(await finished(result.run.id)).toMatchObject({ status: 'completed', harness: 'opencode' });
    expect(result.chatSession).toMatchObject({ harness: 'opencode', model: sonnet, effort: 'high' });
    expect(fake.latest().ctx.config).toMatchObject({ model: sonnet, effort: 'high' });
    expect(q.getUserState()).toMatchObject(defaults);
  });

  it('starts a scheduled chat on the saved effort and sends it to OpenCode as effort', async () => {
    const { trigger, chat } = await fire({ model: sonnet, effort: 'xhigh' });
    expect(trigger).toMatchObject({ harness: 'opencode', model: sonnet, effort: 'xhigh' });
    expect(chat).toMatchObject({ model: sonnet, effort: 'xhigh', modelVariant: null });
    expect(fake.latest().ctx.config).toMatchObject({ model: sonnet, effort: 'xhigh' });
    expect(fake.latest().ctx.config?.modelVariant).toBeUndefined();
  });

  it('resolves no effort like any provider: Medium, else the nearest level the model offers', async () => {
    expect((await fire({ model: sonnet })).chat).toMatchObject({ effort: 'medium' });
    expect((await fire({ model: flash })).chat).toMatchObject({ effort: 'high' });
  });

  it('keeps the heartbeat on its effort', async () => {
    const q = await import('@/lib/db/queries');
    const { dispatchRun } = await import('@/lib/runs/dispatch');
    const saved = await run('update_heartbeat', { provider: 'opencode', model: sonnet, effort: 'high' });
    expect(saved).toMatchObject({ ok: true, result: { provider: 'opencode', model: sonnet, effort: 'high' } });
    const result = await dispatchRun({ trigger: q.getTrigger((saved.result as { triggerId: string }).triggerId)!, triggerKind: 'manual' });
    expect(result.chatSession).toMatchObject({ model: sonnet, effort: 'high', modelVariant: null });
  });

  it('accepts the levels below Low that some OpenCode models offer', async () => {
    expect((await fire({ model: flash, effort: 'none' })).chat).toMatchObject({ effort: 'none' });
  });
});
