'use client';

import { IconButton } from '@/components/system/icon-button';
import { Button } from '@/components/system/button';
import { Plug, Settings } from 'lucide-react';
import { openSettings } from '@/components/settings/settings-store';
import { connectAccountsQuery, reconnectLabel, useAccountsNeedingYou } from '@/components/integrations/accounts-needing-you';
import { useDashboard } from '@/contexts/dashboard-context';
import { INTEGRATION_ICONS } from '@/components/integrations/integration-icon-data';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/tip';
import { SpaceSelector } from '@/components/spaces/space-selector';
import { RailCount, RailDot } from './rail-count';
import { TeamRailFooter } from '@/components/team/team-rail-footer';
import { useOptionalHomeContext } from '@/components/home/home-context';
import { RailIconButton } from './rail-icon-button';
import { RailUpdateRow } from './rail-update-row';
import { FeedbackRailButton } from '@/components/feedback/feedback-trigger';

// The bottom of the rail: what you set up rather than visit. Settings, and
// connecting accounts (where agents can act). Both are occasional, so they
// sit below the work instead of above it. Bottom left is where people look
// for settings.
//
// Connect accounts opens Apps, the one library for connections (Gmail,
// Notion, Linear, ... and custom MCP servers), with Discover on Connectors.
// It says "accounts": what you do there is sign one in. The collapsed rail
// keeps only the gear. Connect accounts needs its words.
//
// An account only you can fix (signed out, or its key rejected) turns the
// fanned tiles into an amber count, and Connect accounts goes straight to
// that account's page in Apps. The collapsed rail shows a plug with a dot for
// as long as one waits, and nothing otherwise (src/lib/integrations/attention.ts).
//
// An update installed and waiting on running work gets one quiet row above
// Settings, for as long as it waits (rail-update-row.tsx).
//
// Replaces the old ⌘K/⌘J hint labels + theme toggle that used to live here:
// the shortcuts stay global, and theme still toggles from the command palette
// and Settings → General, so nothing is stranded by dropping them.

/** Apps in the stack: live integrations with a brand mark, drawn as app icons. */
const APPS = ['linear', 'notion', 'gmail'] as const;

/** Where each tile goes on hover and focus: the stack fans out. */
const FAN = [
  'group-hover:-translate-x-1.5 group-hover:-rotate-12 group-focus-visible:-translate-x-1.5 group-focus-visible:-rotate-12',
  'group-hover:-translate-y-1 group-focus-visible:-translate-y-1',
  'group-hover:translate-x-1.5 group-hover:rotate-12 group-focus-visible:translate-x-1.5 group-focus-visible:rotate-12',
];

function AppTile({ id, className }: { id: (typeof APPS)[number]; className?: string }) {
  const icon = INTEGRATION_ICONS[id];
  return (
    <span
      className={cn(
        'relative flex size-5 items-center justify-center rounded-[6px] bg-white shadow-sm ring-2 ring-background',
        'transition-transform duration-300 ease-out motion-reduce:transition-none motion-reduce:transform-none',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" width={12} height={12} fill={`#${icon.hex}`} aria-hidden>
        <path d={icon.path} />
      </svg>
    </span>
  );
}

export function RailFooter({ collapsed }: { collapsed: boolean }) {
  const team = useOptionalHomeContext()?.home.kind === 'team';
  return team ? <TeamRailFooter collapsed={collapsed} /> : <PersonalRailFooter collapsed={collapsed} />;
}

function PersonalRailFooter({ collapsed }: { collapsed: boolean }) {
  const { setActiveView } = useDashboard();
  const needingYou = useAccountsNeedingYou();
  const reconnect = reconnectLabel(needingYou);
  const connectAccounts = () => setActiveView({ kind: 'apps', route: '', query: connectAccountsQuery(needingYou) });
  if (collapsed) {
    return (
      <footer className="flex flex-shrink-0 flex-col items-center gap-1 border-t border-border/40 py-1.5">
        {/* My Ri and its teams, once one is connected (docs/homes-spec.md §3.2). */}
        <SpaceSelector variant="collapsed" />
        {reconnect && <RailIconButton icon={Plug} label={reconnect} onClick={connectAccounts} badge={<RailDot tone="attention" />} />}
        <RailUpdateRow collapsed />
        <FeedbackRailButton collapsed />

          <IconButton
            type="button"
            onClick={() => openSettings()}
            label="Settings"
            tooltip="Settings"
            variant="ghost"
            size="sm"
          >
            <Settings size={14} />
          </IconButton>

      </footer>
    );
  }
  return (
    <footer data-slot="rail-foot" className="flex flex-shrink-0 flex-col gap-1.5 px-2 py-2 border-t border-border/40">
      {/* My Ri and its teams, once one is connected (docs/homes-spec.md §3.2). */}
      <SpaceSelector variant="wide" />
      <RailUpdateRow collapsed={false} />
      <FeedbackRailButton collapsed={false} />
      <div className="flex items-stretch gap-1.5">

        <IconButton
          type="button"
          onClick={() => openSettings()}
          label="Settings"
          tooltip="Settings"
          variant="ghost"
          size="sm"
          className="flex flex-shrink-0 items-center justify-center"
        >
          <Settings size={14} />
        </IconButton>

      <Tip label={reconnect}>
        <Button
          type="button"
          onClick={connectAccounts}
          aria-label={reconnect ? `Connect accounts, ${needingYou.length} waiting on you` : 'Connect accounts'}
          variant="secondary"
          size="sm"
          className="group min-w-0 flex-1 flex items-center gap-1.5 justify-start"
        >
          <Plug size={13} className="flex-shrink-0 text-primary" />
          <span className="truncate">Connect accounts</span>
          {reconnect ? (
            <RailCount count={needingYou.length} tone="attention" className="ml-auto" />
          ) : (
            <span aria-hidden className="ml-auto flex items-center -space-x-2 pr-0.5">
              {APPS.map((id, i) => (
                <AppTile key={id} id={id} className={FAN[i]} />
              ))}
            </span>
          )}
        </Button>
      </Tip>
      </div>
    </footer>
  );
}
