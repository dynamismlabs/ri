/**
 * Recovery fixture: a disposable Home booted through the real instrumentation register(),
 * with fake providers for every harness. Usage: tsx boot-child.ts <root> <team|personal> <plant>
 * plant: none | corrupt (unreadable harness record) | survivor:<pid json> (pre-written record file)
 *
 * It lives only as long as the test that started it. The test holds a pipe to
 * its stdin, which the system closes however the test process ends, a timeout
 * or a SIGKILL included, where the test's own cleanup never runs. Then this
 * Home closes its server if it got that far, and exits. Interrupted local runs
 * left Homes like this running for hours before it did.
 */
import { getProvider } from '@agentex/agent';
import path from 'node:path';
import fs from 'node:fs';

/** How long a Home whose test has gone gets to close its server before it exits anyway. */
const ORPHAN_GRACE_MS = 3_000;

let closeServer: (() => Promise<void>) | null = null;
process.stdin.on('end', () => {
  setTimeout(() => process.exit(0), ORPHAN_GRACE_MS).unref();
  void (closeServer?.() ?? Promise.resolve()).finally(() => process.exit(0));
});
process.stdin.on('error', () => {});
process.stdin.resume();

async function main() {
  const [root, mode, plant, extra] = process.argv.slice(2);
  let chatId: string | null = null; let turnId: string | null = null;
  process.env.RI_ROOT = root;
  process.env.RI_CONFIG_DIR = path.join(root, '.config');
  process.env.RI_WORK_DIR = path.join(root, '.work');
  process.env.RI_DB_PATH = path.join(root, 'data.db');
  process.env.RI_MIRROR_DISABLED = '1';
  process.env.NEXT_RUNTIME = 'nodejs';
  delete process.env.OPENAI_API_KEY;
  fs.mkdirSync(process.env.RI_WORK_DIR, { recursive: true });
  const { installFakeHarness } = await import('@/test/fixtures/fake-harness');
  const { HARNESS_IDS } = await import('@/lib/harness/registry');
  const esmSdk = await import('@agentex/agent');
  for (const id of HARNESS_IDS) { installFakeHarness(id); esmSdk.registerProvider(getProvider(id)); }
  const { allowMigrations } = await import('@/lib/db/migrate');
  allowMigrations();
  let ownerToken: string | null = null;
  if (mode === 'team') {
    const { writeTeamIntent, readTeamIntent } = await import('@/lib/home/team-intent');
    if (!readTeamIntent()) writeTeamIntent({ creationId: 'recovery-fixture', name: 'Recovery team' });
    const { ensureHomeIdentity } = await import('@/lib/home/identity');
    const { home } = ensureHomeIdentity();
    const q = await import('@/lib/db/queries');
    const owner = q.createTeamOwner({ creationId: 'recovery-fixture', name: 'Owner', device: { name: 'Browser', kind: 'computer' } });
    ownerToken = owner.token.plaintext;
    const cwd = path.join(root, 'shared-agent'); fs.mkdirSync(cwd, { recursive: true });
    const workspace = q.createWorkspace({ name: 'Recovery agent', cwd, isGit: false, createdByMemberId: owner.member.id, defaultDeviceId: home.hostDeviceId });
    await (await import('@/lib/setups/home-context')).setHomeFolder(workspace.id, cwd);
    const { FAKE_MODEL_ID } = await import('@/test/fixtures/fake-harness');
    q.saveTeamAiSettings({ enabled: true, harness: 'claude', model: FAKE_MODEL_ID }, owner.member.id);
    if (extra === 'running-turn') {
      // A turn the previous server left running when it died (claimed in the durable queue).
      const chat = q.createChatSession({ type: 'orchestration', harness: 'claude', model: FAKE_MODEL_ID, workspaceId: workspace.id, deviceId: home.hostDeviceId, surfaceKind: q.TEAM_CHAT_SURFACE, createdByMemberId: owner.member.id });
      const lookup = (await import('@/lib/auth/api-token')).lookupApiToken(owner.token.plaintext)!;
      q.acceptTeamChatSend({ chatId: chat.id, memberId: owner.member.id, requestingApiKeyId: lookup.key.id, clientSendId: 'left-running-1', text: 'Work that was running at the crash' });
      const claimed = q.claimNextTeamChatTurn(chat.id)!;
      chatId = chat.id; turnId = claimed.id;
    }
  }
  const record = path.join(process.env.RI_WORK_DIR, 'harness-processes.json');
  if (plant === 'corrupt') fs.writeFileSync(record, '{"entries": [', { mode: 0o600 });
  const started = Date.now();
  await (await import('../../../instrumentation')).register();
  const registerMs = Date.now() - started;
  const { executionRecoveryProblem } = await import('@/lib/home/execution-startup');
  const config = JSON.parse(fs.readFileSync(path.join(process.env.RI_CONFIG_DIR, 'config.json'), 'utf8')) as { localToken: string };
  const { startHomeServer } = await import('@/test/fixtures/home-server');
  const server = await startHomeServer({});
  closeServer = () => server.close();
  process.stdout.write(`${JSON.stringify({ url: server.url, token: ownerToken ?? config.localToken, problem: executionRecoveryProblem(), registerMs, chatId, turnId })}\n`);
  const stop = () => void server.close().finally(() => process.exit(0));
  process.on('SIGTERM', stop);
}

void main().catch(error => { console.error(error); process.exit(1); });
