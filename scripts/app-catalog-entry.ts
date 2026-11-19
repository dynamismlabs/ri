/**
 * Make an entry for Ri's catalog of recommended apps (docs/personal-apps.md "The catalog").
 *
 *   pnpm tsx scripts/app-catalog-entry.ts <git url or folder> <tag or commit> \
 *     --id people --name People --description "..." [--reaches "..."]... [--from <folder>] [--write [<catalog file>]]
 *   pnpm tsx scripts/app-catalog-entry.ts --order people,bookmarks [<catalog file>]
 *
 * Reads the app's repository at that version (a folder in place, read-only, or a temporary clone of a
 * URL), computes the checksum of its files the way Ri checks it on Add and Update, and prints the
 * entry. `--from` reads the version from a copy of the repository on this computer instead of
 * cloning the URL, read-only, when that copy has the URL as a remote. The entry still names the URL. `--write` puts it in `src/lib/apps/catalog.json` (or the file given): in place of an entry
 * with the same ID, or last. `--order` moves the apps it names to the top, in that order, and keeps
 * the rest after them, without fetching anything. Either bumps the catalog's serial.
 *
 * The file's order is the order people see apps in Discover. Merged to Ri's main branch, the file is
 * also the hosted feed every Ri reads (src/lib/apps/catalog-feed.ts), so a change reaches people
 * without a release. A feed reaches them only when its serial is above their shipped list's.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CatalogEntrySchema, CatalogSchema, orderedApps, withEntry, type CatalogEntry } from '../src/lib/apps/catalog-entries';
import { treeChecksum } from '../src/lib/apps/catalog-checksum';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' },
    reaches: { type: 'string', multiple: true }, write: { type: 'boolean' }, order: { type: 'string' }, from: { type: 'string' },
  },
});
const defaultCatalog = () => path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/lib/apps/catalog.json');

/** Write the catalog's apps back as the next serial, so every Ri's feed takes it. */
function writeCatalog(file: string, change: (apps: CatalogEntry[]) => CatalogEntry[]) {
  const catalog = CatalogSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
  const apps = change(catalog.apps);
  const serial = (catalog.serial ?? 0) + 1;
  fs.writeFileSync(file, JSON.stringify(CatalogSchema.parse({ serial, apps }), null, 2) + '\n');
  console.error(`Wrote ${file}, as serial ${serial}: ${apps.map((app) => app.id).join(', ')}.`);
}

if (values.order !== undefined) {
  const ids = values.order.split(',').map((id) => id.trim()).filter(Boolean);
  if (!ids.length || positionals.length > 1) {
    console.error('Usage: pnpm tsx scripts/app-catalog-entry.ts --order <id>[,<id>]... [<catalog file>]');
    process.exit(64);
  }
  try { writeCatalog(positionals[0] ? path.resolve(positionals[0]) : defaultCatalog(), (apps) => orderedApps(apps, ids)); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exit(1); }
  process.exit(0);
}

const [git, version, catalogArg] = positionals;
if (!git || !version || !values.id || !values.name || !values.description) {
  console.error('Usage: pnpm tsx scripts/app-catalog-entry.ts <git url or folder> <tag or commit> --id <id> --name <name> --description <text> [--reaches <text>]... [--from <folder>] [--write [<catalog file>]]');
  process.exit(64);
}

/** A copy of the repository at `git` on this computer: it must have that URL as one of its remotes. */
function localCopyOf(folder: string, git: string): string {
  const repo = path.resolve(folder);
  const remotes = execFileSync('git', ['remote', '-v'], { cwd: repo, encoding: 'utf8' }).split('\n').map((line) => line.split(/\s+/)[1]).filter(Boolean);
  if (!remotes.includes(git)) throw new Error(`${repo} has no remote at ${git}, so it isn't a copy of that repository.`);
  return repo;
}

async function main(git: string, version: string) {
  const local = git.startsWith('/') && fs.existsSync(git);
  let repo = values.from ? localCopyOf(values.from, git) : git;
  let temporary: string | null = null;
  try {
    if (!local && !values.from) {
      temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-catalog-entry-'));
      repo = path.join(temporary, 'repo.git');
      execFileSync('git', ['clone', '-q', '--bare', '--', git, repo], { stdio: 'inherit' });
    }
    const commit = execFileSync('git', ['rev-parse', '--verify', `${version}^{commit}`], { cwd: repo, encoding: 'utf8' }).trim();
    // A tag or a commit stays put. Anything else (HEAD, a branch) is pinned as the commit it is now.
    let tag = false;
    try { execFileSync('git', ['rev-parse', '--verify', '-q', `refs/tags/${version}`], { cwd: repo, stdio: 'ignore' }); tag = true; } catch { /* Not a tag. */ }
    const pinned = tag || commit.startsWith(version) ? version : commit;
    const entry = CatalogEntrySchema.parse({
      id: values.id, name: values.name, description: values.description, reaches: values.reaches ?? [],
      git, version: pinned, checksum: await treeChecksum(repo, commit),
    });
    console.log(JSON.stringify(entry, null, 2));
    console.error(`${entry.name} ${pinned} is commit ${commit}.${pinned !== version ? ` ${version} can move, so the entry pins the commit.` : ''}`);
    if (values.write) writeCatalog(catalogArg ? path.resolve(catalogArg) : defaultCatalog(), (apps) => withEntry(apps, entry));
  } finally {
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
  }
}

void main(git, version).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
