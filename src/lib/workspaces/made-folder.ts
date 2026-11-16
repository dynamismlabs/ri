/**
 * The folder Ri makes for an agent created without one (docs/agent-folders.md).
 *
 * Every agent needs a folder: its chats start there, its instructions and
 * skills are read from there, and harnesses keep their memory and
 * transcripts by it. A person only has to choose one when the agent's work
 * already lives somewhere. For everything else (writing, research, admin)
 * Ri makes a plain folder named after the agent under `getAgentFoldersDir()`.
 */

import fs from 'node:fs';
import path from 'node:path';
import slugify from '@sindresorhus/slugify';
import { getAgentFoldersDir } from '@/lib/config/paths';

/** The folder's name for an agent name: lowercase words joined by dashes, `agent` when nothing is left. */
export function agentFolderName(name: string): string {
  return slugify(name.trim()) || 'agent';
}

/** A folder Ri may use for a new agent: not there yet, or there and empty. */
function usable(dir: string): boolean {
  try {
    const stat = fs.statSync(/* turbopackIgnore: true */ dir);
    return stat.isDirectory() && fs.readdirSync(/* turbopackIgnore: true */ dir).length === 0;
  } catch {
    return true;
  }
}

/**
 * Where Ri would make the folder for an agent with this name: the first of
 * `name`, `name-2`, `name-3` … that isn't already a folder with something in
 * it, so a new agent never moves into an old agent's files.
 */
export function plannedAgentFolder(name: string): string {
  const root = getAgentFoldersDir();
  const base = agentFolderName(name);
  for (let n = 1; ; n++) {
    const dir = path.join(/* turbopackIgnore: true */ root, n === 1 ? base : `${base}-${n}`);
    if (usable(dir)) return dir;
  }
}

/** Make the folder for a new agent and return it. */
export function makeAgentFolder(name: string): string {
  const dir = plannedAgentFolder(name);
  fs.mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
  return dir;
}

/** Take back a folder Ri made, when the agent it was for wasn't created. Only while it's still empty. */
export function removeUnusedAgentFolder(dir: string): void {
  try {
    if (fs.readdirSync(/* turbopackIgnore: true */ dir).length === 0) fs.rmdirSync(/* turbopackIgnore: true */ dir);
  } catch {
    /* already gone, or in use */
  }
}
