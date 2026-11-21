import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { teamRoleDecisions } from '@/test/team-role-decisions';

const configFile = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, process.cwd());
const files = config.fileNames.filter(file => /\/src\//.test(file) && !/\.(test|browser)\./.test(file) && !file.includes('/src/test/'));
// Keep the original candidate set and full type graph, with one assertion per source file.
const policyFiles = files.filter(file => !file.endsWith('/team/capabilities.ts') && /owner|member/.test(fs.readFileSync(file, 'utf8')));
let program: ts.Program | undefined;
let checker: ts.TypeChecker | undefined;

it.each(policyFiles.map(file => [path.relative(process.cwd(), file), file] as const))('keeps role decisions in the team capability table: %s', (_name, file) => {
  // Reuse one program so splitting the assertions does not repeat type checking.
  program ??= ts.createProgram(files, { ...config.options, noEmit: true });
  checker ??= program.getTypeChecker();
  const problems = teamRoleDecisions(program.getSourceFile(file)!, checker).map(line => `${path.relative(process.cwd(), file)}:${line}`);
  expect(problems).toEqual([]);
  // The Intel runner can take over two minutes for the whole scan. Each file remains bounded.
}, 120_000);

it.each([
  "m.role === 'owner'", "m['role'] === 'owner'", "['owner'].includes(m.role)",
  "(() => { const {role: access} = m; return access === 'owner'; })()",
  "(() => { const access = m.role; const admin = 'owner'; return access === admin; })()",
  "(() => { switch(m.role) {case 'owner': return true; default: return false;} })()",
  "new Set(['owner']).has(m.role)", "({owner:true,member:false})[m.role]", "'owner' === m.role",
])('detects role policy expressed as %s', expression => {
  const file = '/policy.ts';
  const source = ts.createSourceFile(file, `declare const m: { role: 'owner' | 'member' }; const allowed = ${expression};`, ts.ScriptTarget.Latest, true);
  const host = ts.createCompilerHost({ noLib: true });
  host.getSourceFile = name => name === file ? source : undefined;
  const program = ts.createProgram([file], { noLib: true }, host);
  expect(teamRoleDecisions(source, program.getTypeChecker()).length).toBeGreaterThan(0);
});
