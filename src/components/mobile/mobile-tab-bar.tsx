"use client";

import { MessageSquare, Bot, Plus, Layers3, MoreHorizontal, ListTodo, FileText } from 'lucide-react';
import { useDashboard } from '@/contexts/dashboard-context';
import { useAgentsTabWork } from '@/hooks/use-agents-tab-work';
import { cn } from '@/lib/utils';
import type { MobileTab } from '@/types/dashboard';
import { useTeamNav } from '@/components/team/team-context';
import { useOptionalHomeContext } from '@/components/home/home-context';
import { HOME_VIEW } from '@/lib/client/active-view';

const TABS: { id: MobileTab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'create', label: '', icon: Plus },
  { id: 'deck', label: 'Deck', icon: Layers3 },
  { id: 'more', label: 'More', icon: MoreHorizontal },
];

export function MobileTabBar() {
  const team = useOptionalHomeContext()?.home.kind === 'team';
  const nav = useTeamNav();
  const tabs = team ? [
    { id: 'chat' as const, label: 'Chat', icon: MessageSquare },
    { id: 'agents' as const, label: 'Agents', icon: Bot },
    { id: 'create' as const, label: '', icon: Plus },
    { id: 'tasks' as const, label: 'Tasks', icon: ListTodo },
    { id: 'notes' as const, label: 'Notes', icon: FileText },
  ] : TABS;
  const { mobileTab, setMobileTab, setActiveView, setMobileCreateOpen } = useDashboard();
  // The Agents tab's own counts (docs/chat-lenses.md), so the badge always
  // matches its Unread and Working tabs. Blocked on you outranks working,
  // which outranks unread, as on the header's pills.
  const { counts } = useAgentsTabWork();
  const badgeKind: 'pending' | 'working' | 'review' | null =
    counts.blocked > 0 ? 'pending' : counts.working > 0 ? 'working' : counts.unread > 0 ? 'review' : null;
  const badgeCount =
    badgeKind === 'pending' ? counts.blocked : badgeKind === 'working' ? counts.working : counts.unread;

  return <HomePhoneBar tabs={tabs.map(tab => ({ ...tab, active: tab.id === mobileTab,
    onClick: () => { if (tab.id === 'create') setMobileCreateOpen(true); else if (team) { nav.show(tab.id === 'tasks' ? 'board' : tab.id === 'notes' ? 'notes' : tab.id === 'agents' ? 'agents' : 'chat'); } else { setMobileTab(tab.id); if (tab.id === 'agents') setActiveView(HOME_VIEW); } },
    ...(tab.id === 'agents' && badgeKind ? { badge: { count: badgeCount, kind: badgeKind } } : {}),
  }))}/>;
}

/** Common phone navigation with destination and creation controls supplied by its Home. */
export function HomePhoneBar({ tabs }: { tabs: { id: string; label: string; ariaLabel?: string; icon: typeof Plus; active?: boolean; onClick: () => void; badge?: { count: number; kind: 'working' | 'pending' | 'review' } }[] }) {
  return <nav aria-label="Home" className="flex shrink-0 select-none items-end justify-around border-t border-border bg-background px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
    {tabs.map(tab => tab.id === 'create' ? <button key={tab.id} aria-label={tab.ariaLabel ?? 'Create'} onClick={tab.onClick} className="-mt-3 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95"><Plus size={22} strokeWidth={2.5}/></button>
      : <button key={tab.id} onClick={tab.onClick} aria-current={tab.active ? 'page' : undefined} className={cn('relative flex min-w-[48px] flex-col items-center gap-0.5 px-2 py-2', tab.active ? 'text-primary' : 'text-muted-foreground')}><div className="relative"><tab.icon size={20} strokeWidth={tab.active ? 2.2 : 1.8}/>{tab.badge && <span className={cn('absolute -right-1.5 -top-1 flex size-3.5 items-center justify-center rounded-full text-[7px] font-bold text-white ring-2 ring-background', tab.badge.kind === 'working' ? 'animate-pulse bg-emerald-500' : 'bg-amber-500')}>{tab.badge.count}</span>}</div><span className={cn('text-[9px] font-medium', tab.active && 'font-bold')}>{tab.label}</span></button>)}
  </nav>;
}
