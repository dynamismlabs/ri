'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { readDocumentBinding } from '@/lib/home/document-binding';
import { homeStorageIdentity } from '@/lib/home/document-scope';

/**
 * Which chats a list shows (docs/chat-lenses.md). The same chats answer three
 * questions, and one long list can only put one of them first:
 *
 *   - `unread`: what wants you. Waiting on you first, then new replies.
 *   - `working`: what is running right now.
 *   - `agents` / `all`: everything, to go anywhere. The phone's Agents tab
 *     groups it by agent, an agent's Chats tab lists its chats newest first.
 *
 * Each list remembers its own choice per browser, so coming back from a chat,
 * or to the app tomorrow, lands where you left. The phone's Agents tab opens
 * on Unread the first time, since that is what it led with before. An
 * agent's Chats tab opens on All.
 *
 * Read through `useSyncExternalStore` so server render and hydration see the
 * default and the client snapshot takes over without an effect or a mismatch.
 */

export type PhoneChatLens = 'unread' | 'working' | 'agents';
export type AgentChatLens = 'all' | 'unread' | 'working';

export const PHONE_CHAT_LENS_KEY = 'ri.client.phoneChatLens';
export const AGENT_CHAT_LENS_KEY = 'ri.client.agentChatLens';
export const DEFAULT_PHONE_CHAT_LENS: PhoneChatLens = 'unread';
export const DEFAULT_AGENT_CHAT_LENS: AgentChatLens = 'all';

const PHONE_LENSES: readonly PhoneChatLens[] = ['unread', 'working', 'agents'];
const AGENT_LENSES: readonly AgentChatLens[] = ['all', 'unread', 'working'];

export function parsePhoneChatLens(raw: unknown): PhoneChatLens {
  return PHONE_LENSES.find((lens) => lens === raw) ?? DEFAULT_PHONE_CHAT_LENS;
}

export function parseAgentChatLens(raw: unknown): AgentChatLens {
  return AGENT_LENSES.find((lens) => lens === raw) ?? DEFAULT_AGENT_CHAT_LENS;
}

function lensStore<T extends string>(key: string, parse: (raw: unknown) => T, fallback: T) {
  const changeEvent = `ri:${key}-changed`;
  // A team keeps its own choice, as the rail's tab does.
  const storageKey = () => {
    const team = typeof document !== 'undefined' && ['team', 'space'].includes(document.documentElement.dataset.riAuthority ?? '');
    return homeStorageIdentity(key, team ? readDocumentBinding() : null);
  };
  const read = (): T => {
    if (typeof window === 'undefined') return fallback;
    try {
      return parse(window.localStorage.getItem(storageKey()));
    } catch {
      return fallback;
    }
  };
  const subscribe = (onChange: () => void) => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey() || e.key === null) onChange();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(changeEvent, onChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(changeEvent, onChange);
    };
  };
  const set = (next: T) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey(), next);
    } catch {
      /* localStorage can throw in private mode, non-fatal */
    }
    window.dispatchEvent(new Event(changeEvent));
  };
  const serverSnapshot = () => fallback;
  return function useLens(): [T, (next: T) => void] {
    const lens = useSyncExternalStore(subscribe, read, serverSnapshot);
    const setLens = useCallback((next: T) => set(next), []);
    return [lens, setLens];
  };
}

/** The phone's Agents tab: Unread, Working or Agents. */
export const usePhoneChatLens = lensStore(PHONE_CHAT_LENS_KEY, parsePhoneChatLens, DEFAULT_PHONE_CHAT_LENS);

/** An agent's Chats tab: All, Unread or Working. One choice for every agent. */
export const useAgentChatLens = lensStore(AGENT_CHAT_LENS_KEY, parseAgentChatLens, DEFAULT_AGENT_CHAT_LENS);

/**
 * Which agents show their chats in the phone's Agents tab. Every agent starts
 * folded, so the list is one row per agent, each saying what wants you and
 * what's running. The ones you open stay open on this phone, so coming back
 * from a chat finds them as you left them. Apart from the desktop rail's own
 * folds (`workspaces.collapsed`), which say nothing about a phone.
 */
export const PHONE_OPEN_AGENTS_KEY = 'ri.client.phoneOpenAgents';
const OPEN_AGENTS_EVENT = 'ri:phone-open-agents-changed';
const NO_AGENTS: ReadonlySet<string> = new Set();

export function parseOpenAgents(raw: string | null): ReadonlySet<string> {
  if (!raw) return NO_AGENTS;
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? new Set(ids.filter((id): id is string => typeof id === 'string')) : NO_AGENTS;
  } catch {
    return NO_AGENTS;
  }
}

function openAgentsKey() {
  const team = typeof document !== 'undefined' && ['team', 'space'].includes(document.documentElement.dataset.riAuthority ?? '');
  return homeStorageIdentity(PHONE_OPEN_AGENTS_KEY, team ? readDocumentBinding() : null);
}

// One parsed set per stored string, so the snapshot stays the same object
// until the stored value changes.
let lastRaw: string | null = null;
let lastOpen: ReadonlySet<string> = NO_AGENTS;
function readOpenAgents(): ReadonlySet<string> {
  if (typeof window === 'undefined') return NO_AGENTS;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(openAgentsKey());
  } catch {
    return NO_AGENTS;
  }
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastOpen = parseOpenAgents(raw);
  }
  return lastOpen;
}

function subscribeOpenAgents(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === openAgentsKey() || e.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(OPEN_AGENTS_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(OPEN_AGENTS_EVENT, onChange);
  };
}

function toggleOpenAgent(id: string) {
  const next = new Set(readOpenAgents());
  if (next.has(id)) next.delete(id);
  else next.add(id);
  try {
    window.localStorage.setItem(openAgentsKey(), JSON.stringify([...next]));
  } catch {
    /* localStorage can throw in private mode, non-fatal */
  }
  window.dispatchEvent(new Event(OPEN_AGENTS_EVENT));
}

export function usePhoneOpenAgents(): [ReadonlySet<string>, (id: string) => void] {
  const open = useSyncExternalStore(subscribeOpenAgents, readOpenAgents, () => NO_AGENTS);
  return [open, toggleOpenAgent];
}
