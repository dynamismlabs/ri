/**
 * "Add `ri` to Terminal" (docs/always-on-spec.md 4.2) and `ri doctor --fix`:
 * the same launcher the install script writes, then the check and the two
 * marked lines that make `ri` in a new terminal run it, ahead of Ruby's own
 * `ri` and the version managers that put theirs first (terminal-command.ts,
 * section 9.1), and a plain account of what changed.
 */
import os from 'node:os';
import { commandLauncherPath, installCommandLauncher } from './runtime';
import { fixTerminal, shown, type TerminalOptions } from './terminal-command';

export interface AddedToTerminal { installed: boolean; changed: string[]; message: string }

export async function addToTerminal(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  options: Pick<TerminalOptions, 'run' | 'timeoutMs'> = {},
): Promise<AddedToTerminal> {
  const launcher = installCommandLauncher();
  if (!launcher.installed) return { installed: false, changed: [], message: launcher.reason ?? `Ri couldn't write ${commandLauncherPath()}.` };
  const home = env.HOME ?? os.homedir();
  const fixed = await fixTerminal({ launcher: launcher.file, env, platform, ...options });
  return { installed: true, changed: [shown(launcher.file, home), ...fixed.changed], message: `\`ri\` is ready at ${shown(launcher.file, home)}. ${fixed.message}` };
}
