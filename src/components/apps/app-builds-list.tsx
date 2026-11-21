'use client';
import { MenuAction } from '@/components/system/menu-action';

import { useQuery } from '@tanstack/react-query';
import { GitBranch, Hammer, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

/**
 * Apps on their way (docs/personal-apps.md "Building and changing apps"): ones being built or
 * installed, catalog apps among them, and installed ones with a change open. Each opens its page.
 */
export function AppBuildsList({ onOpen }: { onOpen: (sourceId: string) => void }) {
  const builds = useQuery(trpc.appBuilds.list.queryOptions(undefined, { staleTime: 10_000 }));
  const open = (builds.data ?? []).filter((source) => source.createdByRi && (!source.url || source.changeFolder));
  if (!open.length) return null;
  return (
    <section aria-labelledby="app-builds" className="space-y-2">
      <h3 id="app-builds" className="flex items-center gap-1.5 text-xs font-semibold"><Hammer size={13} aria-hidden />Apps in progress</h3>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {open.map((source) => (
          <li key={source.id}>
            <MenuAction type="button" onClick={() => onOpen(source.id)} className="flex w-full items-center gap-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{source.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {source.changeFolder ? <><GitBranch size={10} className="mr-1 inline" aria-hidden />A change in progress</>
                    : source.job?.kind === 'install' && source.job.state === 'running' ? 'Installing'
                    : source.job?.kind === 'install' && source.job.state === 'failed' ? 'Its install didn’t finish'
                    : 'Not installed yet'}
                </span>
              </span>
              {source.job?.state === 'running' && <Loader2 size={13} className="animate-spin text-muted-foreground" aria-label="Running" />}
            </MenuAction>
          </li>
        ))}
      </ul>
    </section>
  );
}
