import os from 'node:os';
import path from 'node:path';
import { homeSettingsAdmission } from '@/lib/home/settings-authority';
import { reply, type OperationContext } from '@/lib/server/operation';
import { plannedAgentFolder } from '@/lib/workspaces/made-folder';
import { z as rpcZ } from 'zod/v4';

/**
 * Where Ri would make the folder for a new agent with this name, if it's
 * created without one (docs/agent-folders.md). Nothing is made: the New
 * agent dialog shows it so the person knows where the agent's files go.
 */
export async function GET(rpcInput: rpcZ.infer<typeof GETInput>, request: OperationContext) {
  const homeDenied = homeSettingsAdmission(request.headers, 'configureAgents');
  if (homeDenied) return homeDenied;
  const planned = plannedAgentFolder(rpcInput.query.name);
  const home = os.homedir();
  // As people write it: `~/Agents/growth`, from the home folder of the computer that makes it.
  const display = planned.startsWith(home + path.sep) ? `~${planned.slice(home.length)}` : planned;
  return reply({ path: planned, display });
}

export const GETInput = rpcZ.object({ query: rpcZ.object({ name: rpcZ.string().max(200) }).strict() }).strict();
