'use client';
import { StatusBadge } from '@/components/system/status-badge';

import { teamDisplayName } from '@/lib/home/team-display-name';
import { Users } from 'lucide-react';
import { Tip } from '@/components/ui/tip';
import { useConnectedTeams } from './space-selector';

/**
 * The team a shared task or saved note in My Ri belongs to (docs/homes-spec.md
 * §3.2): shown wherever it appears, whatever personal Area it's organized under.
 */
export function TeamLabel({ teamId, sourceArea }: { teamId: string | null | undefined; sourceArea?: { name: string } | null }) {
  const teams = useConnectedTeams(!!teamId);
  if (!teamId) return null;
  const name = teamDisplayName(teamId, teams.data);
  const label = sourceArea ? `${name} • ${sourceArea.name}` : name;
  return (
    <Tip label={label} onlyWhenTextHidden>
      <StatusBadge className="inline-flex max-w-[10rem] items-center gap-1">
        <Users size={9} className="flex-shrink-0" />
        <span className="truncate">{label}</span>
      </StatusBadge>
    </Tip>
  );
}
