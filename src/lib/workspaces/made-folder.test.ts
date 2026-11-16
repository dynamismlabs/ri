/**
 * The folder Ri makes for an agent created without one (docs/agent-folders.md):
 * where it goes for each kind of home, its name, and never an old agent's files.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AGENTS_DIR_ENV, APP_ROOT_ENV, getAgentFoldersDir } from '@/lib/config/paths';
import { agentFolderName, makeAgentFolder, plannedAgentFolder, removeUnusedAgentFolder } from './made-folder';

let tmp: string;
const saved = { home: process.env.HOME, root: process.env[APP_ROOT_ENV], agents: process.env[AGENTS_DIR_ENV] };

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-made-folder-'));
});
afterEach(() => {
  restore('HOME', saved.home);
  restore(APP_ROOT_ENV, saved.root);
  restore(AGENTS_DIR_ENV, saved.agents);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('where Ri makes agent folders', () => {
  it('uses ~/Agents for the production home', () => {
    process.env.HOME = tmp;
    delete process.env[APP_ROOT_ENV];
    delete process.env[AGENTS_DIR_ENV];
    expect(getAgentFoldersDir()).toBe(path.join(tmp, 'Agents'));
  });

  it('keeps every other home to a folder beside it, so dev and test never touch real folders', () => {
    process.env.HOME = tmp;
    process.env[APP_ROOT_ENV] = path.join(tmp, 'ri-dev');
    delete process.env[AGENTS_DIR_ENV];
    expect(getAgentFoldersDir()).toBe(path.join(tmp, 'ri-dev-agents'));
  });

  it('follows its override', () => {
    process.env[AGENTS_DIR_ENV] = path.join(tmp, 'elsewhere');
    expect(getAgentFoldersDir()).toBe(path.join(tmp, 'elsewhere'));
  });

  it('is never inside the home, whose AGENTS.md would reach the agent', () => {
    process.env.HOME = tmp;
    for (const root of [undefined, path.join(tmp, 'ri-dev'), path.join(tmp, 'teams', 'field-notes')]) {
      if (root) process.env[APP_ROOT_ENV] = root;
      else delete process.env[APP_ROOT_ENV];
      delete process.env[AGENTS_DIR_ENV];
      const home = root ?? path.join(tmp, 'ri');
      expect(path.relative(home, getAgentFoldersDir()).startsWith('..')).toBe(true);
    }
  });
});

describe('the folder for a new agent', () => {
  beforeEach(() => {
    process.env[AGENTS_DIR_ENV] = path.join(tmp, 'Agents');
  });

  it('is named after the agent', () => {
    expect(agentFolderName('Blogging and Growth')).toBe('blogging-and-growth');
    expect(agentFolderName('  ')).toBe('agent');
    expect(plannedAgentFolder('Taxes 2026')).toBe(path.join(tmp, 'Agents', 'taxes-2026'));
  });

  it('never moves into an old agent\'s files, but reuses an empty folder', () => {
    const taken = path.join(tmp, 'Agents', 'growth');
    fs.mkdirSync(taken, { recursive: true });
    expect(plannedAgentFolder('Growth')).toBe(taken);
    fs.writeFileSync(path.join(taken, 'draft.md'), 'hello');
    expect(plannedAgentFolder('Growth')).toBe(path.join(tmp, 'Agents', 'growth-2'));
  });

  it('is made on create, and taken back only while empty', () => {
    const made = makeAgentFolder('Research');
    expect(fs.statSync(made).isDirectory()).toBe(true);
    fs.writeFileSync(path.join(made, 'notes.md'), 'kept');
    removeUnusedAgentFolder(made);
    expect(fs.existsSync(made)).toBe(true);
    fs.rmSync(path.join(made, 'notes.md'));
    removeUnusedAgentFolder(made);
    expect(fs.existsSync(made)).toBe(false);
  });
});
