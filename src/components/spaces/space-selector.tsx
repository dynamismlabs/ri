'use client';
import { MenuAction } from '@/components/system/menu-action';

import { IconButton } from '@/components/system/icon-button';
import { Button } from '@/components/system/button';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, House, Plus, Settings, User, UserPlus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { currentSpaceId, spacePath, spaceApiBase, spacePlaceKey } from '@/lib/spaces/document';
import { myRiClient } from '@/lib/spaces/my-ri-client';
import { teamDisplayName } from '@/lib/home/team-display-name';
import { cn } from '@/lib/utils';
import { teamConnectionsKey, teamIdentityKey } from '@/lib/spaces/client-cache';
import { useOptionalHomeContext } from '@/components/home/home-context';
import { restoredHomeNavigation } from '@/lib/home/navigation';
import { useOrchestratorIdentity } from '@/hooks/use-user-state';

/**
 * The compact space selector (docs/homes-spec.md §3.2, P7.1): My Ri and the
 * teams this Ri is connected to, plus Join a team and Create a team. It shows
 * only once a team is connected. Choosing a space opens it as its own page,
 * back where it was last left on this screen, and changes nothing else:
 * running work keeps its owner and terminal, and other screens keep their
 * place.
 */

export function useConnectedTeams(enabled = true) {
  return useQuery({
    enabled,
    queryKey: teamConnectionsKey(),
    queryFn: () => myRiClient.spaces.list.query(),
    staleTime: 60_000,
  });
}

function openSpace(target: string | null) {
  const here = currentSpaceId();
  if (target === here) return;
  let url = target ? spacePath(target) : '/';
  try {
    sessionStorage.setItem(spacePlaceKey(here), window.location.pathname + window.location.search);
    const saved = sessionStorage.getItem(spacePlaceKey(target));
    url = restoredHomeNavigation(target, saved) ?? url;
  } catch {
    // Without session storage a space opens at its start.
  }
  window.location.assign(url);
}

function openTeamsSettings() {
  if (currentSpaceId()) {
    window.location.assign('/?settings=teams');
    return;
  }
  void import('@/components/settings/settings-store').then(({ openSettings }) => openSettings('teams'));
}

function createTeam() {
  const connection = window.riDesktop?.connection;
  if (connection) void connection('create-team');
  else openTeamsSettings();
}

function Mark({ name, imageUrl, size = 18 }: { name: string | null; imageUrl?: string | null; size?: number }) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" aria-hidden className="shrink-0 rounded-md object-contain" style={{ width: size, height: size }} />;
  }
  if (!name) {
    return (
      <span aria-hidden className="inline-flex flex-shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" style={{ width: size, height: size }}>
        <House size={Math.round(size * 0.62)} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex flex-shrink-0 items-center justify-center rounded-md bg-primary text-[10px] font-semibold text-primary-foreground"
      style={{ width: size, height: size }}
    >
      {name.trim().charAt(0).toUpperCase() || 'T'}
    </span>
  );
}

/** Menu entries read only their own logo. The selected Team already has its
 * live identity, and another Team's image is served through its own file store. */
function ConnectedTeamMark({ id, name, selected, currentLogo }: { id: string; name: string; selected: boolean; currentLogo: string | null }) {
  const identity = useQuery({
    queryKey: teamIdentityKey(id),
    queryFn: () => myRiClient.spaces.identity.query({ id }),
    enabled: !selected,
    staleTime: 60_000,
    retry: false,
  });
  const imageUrl = selected ? currentLogo : identity.data?.logoFileName ? `${spaceApiBase(id)}/attachments/${identity.data.logoFileName}` : null;
  return <Mark name={name} imageUrl={imageUrl} />;
}

export function SpaceSelector({ variant, onOpenSettings, onOpenAccount }: { variant: 'wide' | 'collapsed' | 'phone'; onOpenSettings?: () => void; onOpenAccount?: () => void }) {
  const home = useOptionalHomeContext();
  const identity = useOrchestratorIdentity();
  const currentLogo = home?.home.kind === 'team' ? identity.imageUrl : null;
  const here = currentSpaceId();
  const standalone = home?.home.kind === 'team' && !here ? home.home : null;
  const connected = useConnectedTeams(!standalone);
  const teams = standalone ? [] : (connected.data ?? []).filter((t) => t.status === 'active');
  if (!standalone && !here && teams.length === 0) return null;
  const currentName = standalone?.name ?? (here ? teamDisplayName(here, connected.data) : null);
  const label = currentName ?? 'My Ri';

  const trigger =
    variant === 'collapsed' ? (
        <IconButton
          type="button"
          label={`Space: ${label}. Switch space`}
          tooltip={`Space: ${label}`}
          variant="ghost"
          size="sm"
        >
          <Mark name={currentName} imageUrl={currentLogo} />
        </IconButton>
    ) : (
      <Button
        type="button"
        aria-label={`Space: ${label}. Switch space`}
        variant="secondary"
        size="sm"
        className={cn("flex min-w-0 items-center gap-2", (variant === 'wide' ? "w-full" : "max-w-[11rem]"))}
      >
        <Mark name={currentName} imageUrl={currentLogo} />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronsUpDown size={12} className="flex-shrink-0 text-muted-foreground" />
      </Button>
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={variant === 'phone' ? 'bottom' : 'top'} className="w-56">
        {standalone ? <MenuAction kind="menu" className="gap-2">
          <Mark name={standalone.name} imageUrl={currentLogo} />
          <span className="min-w-0 flex-1 truncate">{standalone.name}</span>
          <Check size={14} />
        </MenuAction> : <MenuAction kind="menu" onSelect={() => openSpace(null)} className="gap-2">
          <Mark name={null} />
          <span className="flex-1">My Ri</span>
          {!here && <Check size={14} />}
        </MenuAction>}
        {teams.map((team) => (
          <MenuAction kind="menu" key={team.id} onSelect={() => openSpace(team.id)} className="gap-2">
            <ConnectedTeamMark id={team.id} name={teamDisplayName(team.id, connected.data)} selected={here === team.id} currentLogo={currentLogo} />
            <span className="min-w-0 flex-1 truncate">{teamDisplayName(team.id, connected.data)}</span>
            {here === team.id && <Check size={14} />}
          </MenuAction>
        ))}
        {onOpenAccount && <><DropdownMenuSeparator /><MenuAction kind="menu" onSelect={onOpenAccount} className="gap-2"><User size={14} className="text-muted-foreground" />Your account</MenuAction>
          {standalone && <MenuAction kind="menu" onSelect={onOpenAccount} className="gap-2"><House size={14} className="text-muted-foreground" />Connect to My Ri</MenuAction>}</>}
        <DropdownMenuSeparator />
        {standalone ? <MenuAction kind="menu" onSelect={onOpenSettings} className="gap-2">
          <Settings size={14} className="text-muted-foreground" /> Team settings
        </MenuAction> : <><MenuAction kind="menu" onSelect={openTeamsSettings} className="gap-2">
          <UserPlus size={14} className="text-muted-foreground" /> Join a team
        </MenuAction>
        <MenuAction kind="menu" onSelect={createTeam} className="gap-2">
          <Plus size={14} className="text-muted-foreground" /> Create a team
        </MenuAction></>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
