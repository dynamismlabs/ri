'use client';

import { useMemo } from 'react';
import { useWorkActivity } from '@/contexts/work-context';
import { agentAttentionItems, type AgentAttentionItem } from '@/hooks/use-agent-attention';
import { useInactivity } from '@/hooks/use-inactivity';
import { useNeedsReviewSessions, useRailSessions, useWorkspaces } from '@/hooks/use-workspaces';
import type { RailResponse, RailSession } from '@/lib/api/sessions';
import { sortSessionsHotnessDesc } from '@/lib/utils/session-sort';

type UnreadChat = NonNullable<ReturnType<typeof useNeedsReviewSessions>['data']>[number];
type ReviewAttention = NonNullable<RailResponse['resultReviewAttention']>[number];

export interface AgentsTabWork {
  /** Agents whose own chat wants you: waiting on you first, then new replies. */
  agents: AgentAttentionItem[];
  /** Chats blocked on your answer or approval, newest first. */
  blocked: RailSession[];
  /** Chats with output you haven't read, newest first, past the inactive line apart. */
  unread: UnreadChat[];
  unreadInactive: UnreadChat[];
  /** Chats with a turn running right now, newest first. */
  working: RailSession[];
  /** AI reviews that need your answer or failed, and ones still running. */
  reviewsWaiting: ReviewAttention[];
  reviewsWorking: ReviewAttention[];
  counts: {
    /** Everything blocked on you: agents and chats waiting, reviews waiting on an answer. */
    blocked: number;
    /** The Unread tab: every row in it but the inactive ones. */
    unread: number;
    /** The Working tab. */
    working: number;
  };
}

/**
 * The phone's Agents tab, sorted by what each chat wants (docs/chat-lenses.md).
 * One reading for its tabs, their counts and the tab bar's badge, so all three
 * always agree.
 *
 * Unread is everything that wants you: agents whose own chat is waiting on you
 * or has replied, chats blocked on you, then chats with output you haven't
 * read. A chat blocked on you counts here even after you've looked at it,
 * since it can't go on without you. A chat mid-turn waits for its outcome
 * (it'll be unread soon), unless it's blocked. Inactive unread chats fold, the
 * one rule every list hides by.
 *
 * Working is every chat whose turn is running now. A turn blocked on you is
 * under Unread instead, so each chat is in one place. Background tasks (a dev
 * server left running) aren't the agent working, so they stay out, as on the
 * header's Working pill.
 */
export function useAgentsTabWork(): AgentsTabWork {
  const { data: rail } = useRailSessions();
  const { data: candidates } = useNeedsReviewSessions();
  const { streamingSessionIds, pendingInputSessionIds } = useWorkActivity();
  const { partition } = useInactivity();
  const { data: workspaces } = useWorkspaces({ status: 'active' });

  return useMemo(() => {
    const agents = agentAttentionItems(rail?.mainChats, workspaces, pendingInputSessionIds, streamingSessionIds);
    const active = (rail?.sessions ?? []).filter((s) => s.status === 'active');
    const blocked = sortSessionsHotnessDesc(active.filter((s) => pendingInputSessionIds.has(s.id)));
    const working = sortSessionsHotnessDesc(
      active.filter((s) => streamingSessionIds.has(s.id) && !pendingInputSessionIds.has(s.id)),
    );
    // In the server's order (newest activity first), which the rail's Unread keeps too.
    const waiting = (candidates ?? []).filter(
      (s) => !pendingInputSessionIds.has(s.id) && !streamingSessionIds.has(s.id),
    );
    const { active: unread, inactive: unreadInactive } = partition(waiting);

    const pending = new Set(rail?.pendingSessionIds ?? []);
    const reviews = rail?.resultReviewAttention ?? [];
    const reviewsWaiting = reviews.filter((r) => pending.has(r.sessionId) || r.status === 'failed');
    const reviewsWorking = reviews.filter(
      (r) => !pending.has(r.sessionId) && (r.status === 'queued' || r.status === 'running'),
    );

    const agentsBlocked = agents.filter((a) => a.activity === 'waiting').length;
    const reviewsBlocked = reviewsWaiting.filter((r) => pending.has(r.sessionId)).length;
    return {
      agents,
      blocked,
      unread,
      unreadInactive,
      working,
      reviewsWaiting,
      reviewsWorking,
      counts: {
        blocked: agentsBlocked + blocked.length + reviewsBlocked,
        unread: agents.length + blocked.length + unread.length + reviewsWaiting.length,
        working: working.length + reviewsWorking.length,
      },
    };
  }, [rail, candidates, workspaces, streamingSessionIds, pendingInputSessionIds, partition]);
}
