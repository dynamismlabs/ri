'use client';

import { useQuery } from '@tanstack/react-query';
import { INTEGRATION_LABELS } from '@/constants/integrations';
import type { AccountNeedingYou } from '@/lib/integrations/attention';
import { trpc } from '@/lib/trpc/client';

/**
 * The connected accounts only you can fix (`src/lib/integrations/attention.ts`),
 * for the rail's Connect accounts. Read once a minute while the page is shown,
 * and on focus, since an account can stop working in the middle of an agent's
 * run. Leaving an account's page in Apps refreshes it with the rest of `integrations`.
 */
export function useAccountsNeedingYou(): AccountNeedingYou[] {
  const { data } = useQuery(trpc.integrations.attentionGet.queryOptions(undefined, { staleTime: 30_000, refetchInterval: 60_000 }));
  return data ?? [];
}

/**
 * Where Connect accounts lands in Apps, as the library's query: the one page that fixes every
 * account, or else your library, which marks each. With nothing waiting, it is there to connect
 * one, so Discover shows Connectors.
 */
export function connectAccountsQuery(accounts: readonly AccountNeedingYou[]): Record<string, string> {
  const targets = new Map(accounts.map((account) => [`${account.target.kind}:${account.target.id}`, account.target]));
  if (targets.size === 1) {
    const [target] = targets.values();
    // The library's keys for a connection's page (`setupQuery`): a custom server's is `mcp`.
    return { [target!.kind === 'server' ? 'mcp' : target!.kind]: target!.id };
  }
  return accounts.length > 0 ? { browse: 'yours' } : { filter: INTEGRATION_LABELS.plural };
}

/** Which accounts, in Connectors' words: "Reconnect Gmail (Work) and Todoist". */
export function reconnectLabel(accounts: readonly AccountNeedingYou[]): string | undefined {
  if (accounts.length === 0) return undefined;
  const names = accounts.map((account) => (account.account ? `${account.name} (${account.account})` : account.name));
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `Reconnect ${list}`;
}
