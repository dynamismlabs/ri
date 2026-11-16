'use client';



import { useOptionalHomeContext } from '@/components/home/home-context';

import type { WorkspaceRecord } from '@/db/types';

/** Configuration policy is supplied once, separately from the shared form fields. */
export function useAgentConfigurationScope() {
  const home = useOptionalHomeContext();
  return {
    canConfigure: home?.capabilities.configureAgents ?? true,
    personalTools: home?.capabilities.privatePlanning ?? true,
    executionChoices: home?.executionChoices ?? [],
  };
}

export function AgentPinnedFolder({ workspace }: { workspace: WorkspaceRecord }) {
  const { executionChoices } = useAgentConfigurationScope();
  return <section className="space-y-2">
    <h3 className="text-sm font-semibold">Execution destination</h3>
    <p className="text-xs text-muted-foreground">{executionChoices[0]?.name ?? "This team's server"}</p>
    <p className="break-all font-mono text-xs">{workspace.cwd}</p>
    <p className="text-[11px] text-muted-foreground">Chats run on this team&apos;s server and are visible to every team member.</p>
  </section>;
}
