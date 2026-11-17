/**
 * Effort on an OpenCode schedule. OpenCode models list their effort levels as
 * variants, so a schedule keeps the level in `effort` like any provider:
 * create_trigger, update_trigger and update_heartbeat check it against the
 * model's own levels, a model change keeps it only when the new model offers
 * it, and each fire starts its chat on it as OpenCode's variant.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProvider } from '@agentex/agent';
import { createTestHome, type TestHome } from '@/test/fixtures/home';
import { installFakeHarness, type FakeHarness } from '@/test/fixtures/fake-harness';

let home: TestHome;
let fake: FakeHarness;

const sonnet = 'anthropic/claude-sonnet-5-5';
const opus = 'anthropic/claude-opus-5-5';
const gpt = 'openai/gpt-6';
const plain = 'opencode/plain-model';
const ladder = [
  { id: 'low', name: 'Low' },
  { id: 'high', name: 'High' },
  { id: 'max', name: 'Max', isDefault: true },
  { id: 'xhigh', name: 'Extra high', disabled: true },
];

function catalog(sonnetLevels = ladder) {
  getProvider('opencode').listModels = async () => [
    { id: sonnet, name: 'Claude Sonnet 5.5', variants: sonnetLevels },
    { id: opus, name: 'Claude Opus 5.5', variants: [{ id: 'low', name: 'Low' }, { id: 'xhigh', name: 'Extra high' }] },
    { id: gpt, name: 'GPT 6', variants: [{ id: 'minimal', name: 'Minimal' }, { id: 'high', name: 'High' }] },
    { id: plain, name: 'Plain model' },
  ];
}

beforeEach(async () => {
  home = await createTestHome({ prefix: 'ri-opencode-effort-' });
  fake = installFakeHarness('opencode');
  catalog();
});

afterEach(async () => {
  (await import('@/lib/executor/adapter'))._resetExecutorState();
  fake?.restore();
  await home?.cleanup();
});

async function run(name: string, input: Record<string, unknown> = {}) {
  const { runAction } = await import('@/lib/orchestrator/dispatch');
  return runAction(name, input, { remote: false });
}

async function finished(runId: string) {
  const q = await import('@/lib/db/queries');
  await vi.waitFor(() => expect(['completed', 'failed']).toContain(q.getRun(runId)?.status), { timeout: 15_000 });
  return q.getRun(runId)!;
}

async function workspaceTrigger(extra: Record<string, unknown> = {}) {
  const q = await import('@/lib/db/queries');
  const workspace = q.createWorkspace({ name: 'Effort agent', cwd: home.root, isGit: false });
  return run('create_trigger', {
    name: 'Thinks hard', targetKind: 'workspace', workspaceId: workspace.id, kind: 'manual',
    prompt: 'Think it through', provider: 'opencode', model: sonnet, ...extra,
  });
}

const triggerId = (env: { result?: unknown }) => (env.result as { trigger: { id: string } }).trigger.id;

describe('update_heartbeat', () => {
  it('keeps an OpenCode effort, which is what the settings show', async () => {
    const saved = await run('update_heartbeat', { provider: 'opencode', model: sonnet, effort: 'high' });
    expect(saved).toMatchObject({ ok: true, result: { provider: 'opencode', model: sonnet, effort: 'high' } });
    expect((await run('get_heartbeat')).result).toMatchObject({ effort: 'high' });
    expect((await run('update_heartbeat', { effort: 'low' })).result).toMatchObject({ model: sonnet, effort: 'low' });
    expect((await run('update_heartbeat', { effort: null })).result).toMatchObject({ model: sonnet, effort: null });
  });

  it('keeps the effort across a model change only when the new model offers it', async () => {
    await run('update_heartbeat', { provider: 'opencode', model: sonnet, effort: 'low' });
    expect((await run('update_heartbeat', { model: opus })).result).toMatchObject({ model: opus, effort: 'low' });
    expect((await run('update_heartbeat', { effort: 'xhigh' })).result).toMatchObject({ effort: 'xhigh' });
    expect((await run('update_heartbeat', { model: sonnet })).result).toMatchObject({ model: sonnet, effort: null });
    expect((await run('update_heartbeat', { model: opus, effort: 'xhigh' })).result).toMatchObject({ model: opus, effort: 'xhigh' });
    expect((await run('update_heartbeat', { provider: 'claude' })).result).toMatchObject({ provider: 'claude', model: null, effort: null });
  });

  it.each([
    [{ provider: 'opencode', model: sonnet, effort: 'medium' }, /Claude Sonnet 5.5 doesn't offer medium effort/],
    [{ provider: 'opencode', model: sonnet, effort: 'xhigh' }, /doesn't offer xhigh effort/],
    [{ provider: 'opencode', model: plain, effort: 'high' }, /Plain model doesn't offer high effort/],
    [{ provider: 'opencode', model: 'opencode/gone', effort: 'high' }, /Choose an available model/],
  ])('rejects %j', async (input, message) => {
    const env = await run('update_heartbeat', input);
    expect(env).toMatchObject({ ok: false, error: { code: 'invalid_params' } });
    expect(env.error?.message).toMatch(message);
  });

  it('leaves effort on other providers as it was: resolved against the model when a check-in starts', async () => {
    expect(await run('update_heartbeat', { provider: 'claude', model: 'opus', effort: 'max' })).toMatchObject({ ok: true, result: { effort: 'max' } });
  });
});

describe('create_trigger / update_trigger', () => {
  it('keeps an OpenCode effort on create, unrelated edits and a model that offers it', async () => {
    const created = await workspaceTrigger({ effort: 'high' });
    expect(created).toMatchObject({ ok: true, result: { trigger: { model: sonnet, effort: 'high' } } });
    const id = triggerId(created);
    expect((await run('update_trigger', { id, prompt: 'Think it through again' })).result).toMatchObject({ effort: 'high' });
    expect((await run('update_trigger', { id, model: gpt })).result).toMatchObject({ model: gpt, effort: 'high' });
    expect((await run('update_trigger', { id, model: opus })).result).toMatchObject({ model: opus, effort: null });
    expect((await run('update_trigger', { id, provider: 'claude' })).result).toMatchObject({ harness: 'claude', model: null, effort: null });
  });

  it('rejects an effort the model does not offer', async () => {
    expect(await workspaceTrigger({ effort: 'medium' })).toMatchObject({ ok: false, error: { code: 'invalid_params' } });
    const id = triggerId(await workspaceTrigger({ effort: 'high' }));
    expect(await run('update_trigger', { id, model: opus, effort: 'high' })).toMatchObject({ ok: false, error: { code: 'invalid_params' } });
    expect(await run('update_trigger', { id, effort: 'medium' })).toMatchObject({ ok: false, error: { code: 'invalid_params' } });
  });
});

describe('dispatch', () => {
  it('starts each fire on the saved effort, as OpenCode\'s variant', async () => {
    const q = await import('@/lib/db/queries');
    const { dispatchRun } = await import('@/lib/runs/dispatch');
    const trigger = q.getTrigger(triggerId(await workspaceTrigger({ effort: 'high' })))!;
    const fire = await dispatchRun({ trigger, triggerKind: 'manual' });
    expect(fire.chatSession).toMatchObject({ model: sonnet, modelVariant: 'high', effort: null });
    expect(await finished(fire.run.id)).toMatchObject({ status: 'completed' });
    expect(fake.latest().ctx.config).toMatchObject({ model: sonnet, modelVariant: 'high' });
  });

  it('starts the heartbeat on its saved effort', async () => {
    const q = await import('@/lib/db/queries');
    const { dispatchRun } = await import('@/lib/runs/dispatch');
    const saved = await run('update_heartbeat', { provider: 'opencode', model: sonnet, effort: 'high' });
    const fire = await dispatchRun({ trigger: q.getTrigger((saved.result as { triggerId: string }).triggerId)!, triggerKind: 'manual' });
    expect(fire.chatSession).toMatchObject({ model: sonnet, modelVariant: 'high' });
  });

  it('without an effort, a fire runs on the model default', async () => {
    const q = await import('@/lib/db/queries');
    const { dispatchRun } = await import('@/lib/runs/dispatch');
    const trigger = q.getTrigger(triggerId(await workspaceTrigger()))!;
    expect(trigger.effort).toBeNull();
    const fire = await dispatchRun({ trigger, triggerKind: 'manual' });
    expect(fire.chatSession).toMatchObject({ model: sonnet, modelVariant: 'max' });
  });

  it('fails a fire whose effort the model stopped offering, instead of quietly using another', async () => {
    const q = await import('@/lib/db/queries');
    const { clearHarnessModelCache } = await import('@/lib/harness/model-discovery');
    const { dispatchRun } = await import('@/lib/runs/dispatch');
    const trigger = q.getTrigger(triggerId(await workspaceTrigger({ effort: 'high' })))!;
    catalog([{ id: 'max', name: 'Max', isDefault: true }]);
    clearHarnessModelCache('opencode');
    const fire = await dispatchRun({ trigger, triggerKind: 'manual' });
    expect(fire.run).toMatchObject({ status: 'failed', errorCode: 'invalid_selection', errorMessage: expect.stringContaining("doesn't offer high effort") });
    expect(fire.chatSession).toBeNull();
    expect(fake.sessions).toHaveLength(0);
  });
});
