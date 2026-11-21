
import { Callout } from '@/components/system/callout';
import type { HarnessId } from '@/lib/harness/registry';

/** Visible wherever a user chooses a harness that cannot ask for approval. */
export function HarnessPermissionNotice({ harness }: { harness: HarnessId | null }) {
  if (harness !== 'antigravity') return null;
  return (
    <Callout as="p" padding="sm" tone={"warning"} >
      Antigravity runs without approval prompts. Auto-approve allows edits and commands without asking. Plan mode asks the CLI to plan before making changes. Background AI is currently unavailable with Antigravity.
    </Callout>
  );
}
