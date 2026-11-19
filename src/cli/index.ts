#!/usr/bin/env node
import { buildProgram } from './program';

// Layout migration is NOT automatic — existing installs run `pnpm migrate:layout`
// (scripts/migrate-layout.ts) once to move into the home + .config + .work shape.
// Fresh installs need nothing (the ensure* helpers create dirs on demand).

buildProgram().parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
