import path from 'node:path';
import type { CreateWorkspaceInput } from '@/db/types';
import type { RequestKey } from '@/lib/auth/request-key';
import * as q from '@/lib/db/queries';
import { authorizeTeamExecution } from '@/lib/home/execution-authority';
import { ensureHomeIdentity } from '@/lib/home/identity';
import { parseIntegrationScopes, validateIntegrationScopes } from '@/lib/integrations/scopes';
import { assertHomeFolderUsable, setHomeFolder, SetupError } from '@/lib/setups/home-context';
import { detectBaseBranch, detectIsGit } from '@/lib/workspaces';
import { makeAgentFolder, removeUnusedAgentFolder } from './made-folder';

/**
 * `cwd` is the agent's primary folder. Without one Ri makes a folder for it
 * (docs/agent-folders.md). `folders` are more folders it works in, linked on
 * the home beside the primary one.
 */
type Input = Omit<Partial<CreateWorkspaceInput>, 'cwd'> & { name: string; cwd?: string | null; folders?: string[] };
export class WorkspaceCreationError extends Error {
  constructor(readonly status: 400 | 409 | 500, message: string) { super(message); this.name = 'WorkspaceCreationError'; }
}

/** Personal filesystem and tool discovery are an explicit creation policy. */
async function creationPolicy(input: Input, key: RequestKey | null) {
  const authority = q.getHome()?.kind === 'team' ? authorizeTeamExecution(key, { operation: 'configure' }) : null;
  if (authority && input.defaultDeviceId && input.defaultDeviceId !== q.getHome()?.hostDeviceId) throw new q.TeamError('not_allowed', 'Team agents currently run on this server.');
  if (authority && input.integrationScopes?.length) throw new q.TeamError('not_allowed', 'Connectors are not available in a team.');
  const chosen = input.cwd?.trim() ? path.resolve(/* turbopackIgnore: true */ input.cwd.trim()) : null;
  const extra = [...new Set((input.folders ?? []).map((f) => f.trim()).filter(Boolean).map((f) => path.resolve(/* turbopackIgnore: true */ f)))].filter((f) => f !== chosen);
  try { for (const folder of [...(chosen ? [chosen] : []), ...extra]) assertHomeFolderUsable(folder); }
  catch (error) { if (error instanceof SetupError) throw new WorkspaceCreationError(400, error.message); throw error; }
  let integrationScopes: CreateWorkspaceInput['integrationScopes'] | undefined;
  if (input.integrationScopes !== undefined) {
    const parsed = parseIntegrationScopes(input.integrationScopes);
    if (!parsed) throw new WorkspaceCreationError(400, 'Provide valid connector scopes and account pins.');
    const result = await validateIntegrationScopes(parsed);
    if (!result.ok) throw new WorkspaceCreationError(400, result.error);
    integrationScopes = result.scopes;
  }
  // Every check has passed, so a folder Ri makes here is for an agent about to be created. It's new and
  // empty, so it isn't a repository.
  const made = chosen ? null : makeAgentFolder(input.name);
  const cwd = chosen ?? made!;
  const isGit = made ? false : input.isGit ?? await detectIsGit(cwd);
  const baseBranch = isGit ? input.baseBranch ?? await detectBaseBranch(cwd, input.remoteName ?? 'origin') : null;
  return { cwd, made, extra, isGit, baseBranch,
    worktreeRoot: isGit && input.worktreeRoot?.trim() ? input.worktreeRoot.trim() : null,
    browserEnabled: authority ? false : input.browserEnabled ?? true, integrationScopes, create: (values: Parameters<typeof q.createWorkspace>[0]) => {
      if (authority) authorizeTeamExecution(key, { operation: 'configure' });
      return q.createWorkspace({ ...values, ...(authority ? { createdByMemberId: authority.member.id, defaultDeviceId: q.getHome()!.hostDeviceId } : {}) });
    },
    finish: async (workspaceId: string) => {
      try {
        await setHomeFolder(workspaceId, cwd);
        if (extra.length) {
          const { linkFolder } = await import('@/lib/setups/folders');
          const host = ensureHomeIdentity().device.id;
          for (const folder of extra) await linkFolder(workspaceId, host, folder);
        }
      }
      catch (error) {
        q.archiveWorkspace(workspaceId);
        if (made) removeUnusedAgentFolder(made);
        throw new WorkspaceCreationError(error instanceof SetupError ? 409 : 500, `The agent's folders couldn't be set up: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };
}

/** One creation operation and record shape. The policy supplies facts and placement only. */
export async function createWorkspaceForHome(input: Input, key: RequestKey | null) {
  const policy = await creationPolicy(input, key);
  let row: ReturnType<typeof q.createWorkspace>;
  try {
    row = policy.create({
      name: input.name, slug: input.slug, emoji: input.emoji ?? null, attachments: input.attachments ?? [],
      cwd: policy.cwd, isGit: policy.isGit, baseBranch: policy.baseBranch,
      remoteName: policy.isGit ? input.remoteName ?? 'origin' : null, worktreeRoot: policy.worktreeRoot,
      ...(input.filesToCopy !== undefined ? { filesToCopy: input.filesToCopy } : {}),
      setupCommand: input.setupCommand ?? null, startCommand: input.startCommand ?? null, teardownCommand: input.teardownCommand ?? null,
      areaId: input.areaId ?? null,
      ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
      ...(input.workResultGuidance !== undefined ? { workResultGuidance: input.workResultGuidance } : {}),
      ...(input.reviewBeforeHandoff !== undefined ? { reviewBeforeHandoff: input.reviewBeforeHandoff } : {}),
      ...(input.reviewDefaults !== undefined ? { reviewDefaults: input.reviewDefaults } : {}),
      status: input.status ?? 'active', browserEnabled: policy.browserEnabled,
      ...(policy.integrationScopes !== undefined ? { integrationScopes: policy.integrationScopes } : {}),
    });
  } catch (error) {
    if (policy.made) removeUnusedAgentFolder(policy.made);
    throw error;
  }
  await policy.finish?.(row.id);
  return row;
}
