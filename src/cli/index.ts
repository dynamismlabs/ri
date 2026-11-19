#!/usr/bin/env node
import { buildProgram } from './program';
import { outsideRi, riCommands, runRubyRi } from './lib/ruby-ri';

// Layout migration is NOT automatic — existing installs run `pnpm migrate:layout`
// (scripts/migrate-layout.ts) once to move into the home + .config + .work shape.
// Fresh installs need nothing (the ensure* helpers create dirs on demand).

const program = buildProgram();

// Ruby's documentation tool is called `ri` too: hand it a Ruby lookup, and
// explain a word that isn't a command instead of starting Ri over it.
const outside = outsideRi(process.argv.slice(2), riCommands(program));
if (outside.forward) process.exit(runRubyRi(outside.forward, process.argv.slice(2)));
if (outside.error) {
  console.error(outside.error);
  process.exit(1);
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
