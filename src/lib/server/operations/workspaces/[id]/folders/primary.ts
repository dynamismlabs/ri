import { homeSettingsAdmission } from '@/lib/home/settings-authority';
import { getWorkspace } from '@/lib/db/queries';
import { reply, type OperationContext } from '@/lib/server/operation';
import { agentFoldersEverywhere, FolderError, makeLinkedFolderPrimary } from '@/lib/setups/folders';
import { z as rpcZ } from 'zod/v4';

/**
 * Make one of the agent's linked folders its primary folder, on every device
 * it's set up on (docs/agent-folders.md). The old primary stays beside it as
 * a linked folder.
 */
export async function POST(rpcInput: rpcZ.infer<typeof POSTInput>, request: OperationContext) {
  const homeDenied = homeSettingsAdmission(request.headers, 'configureAgents');
  if (homeDenied) return homeDenied;
  const { id } = rpcInput.params;
  if (!getWorkspace(id)) return reply({ error: 'not_found' }, { status: 404 });
  try {
    await makeLinkedFolderPrimary(id, rpcInput.body.referenceFolderId);
  } catch (err) {
    if (err instanceof FolderError) return reply({ error: 'invalid_params', message: err.message }, { status: 400 });
    throw err;
  }
  return reply({ devices: agentFoldersEverywhere(id) });
}

export const POSTInput = rpcZ.object({
  params: rpcZ.object({ id: rpcZ.string().min(1) }).strict(),
  body: rpcZ.object({ referenceFolderId: rpcZ.string().min(1) }).strict(),
}).strict();
