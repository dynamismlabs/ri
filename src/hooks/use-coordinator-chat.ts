import {
  mainChatHistoryKey,
  mainChatKey,
  useMainChat,
  useMainChatHistory,
  useNewMainChat,
  useResumeMainChat,
  type MainChatHistoryEntry,
} from './use-main-chat';

/**
 * The app's main chat: the interactive coordinator chat (harness modes).
 * A thin binding of `use-main-chat.ts` to scope `null`, which an agent's
 * main chat shares with its workspace id.
 */

export const COORDINATOR_CHAT_KEY = mainChatKey(null);
export const COORDINATOR_CHAT_HISTORY_KEY = mainChatHistoryKey(null);

export type CoordinatorChatHistoryEntry = MainChatHistoryEntry;

/** The current coordinator chat. GET creates one if none exists. */
export function useCoordinatorChat(enabled = true) {
  return useMainChat(null, enabled);
}

/** Start a fresh coordinator chat (optionally on another provider/model). */
export function useNewCoordinatorChat() {
  return useNewMainChat(null);
}

/** Past and current coordinator chats, newest activity first. */
export function useCoordinatorChatHistory(enabled: boolean) {
  return useMainChatHistory(null, enabled);
}

/** Resume a past coordinator chat as the current one. */
export function useResumeCoordinatorChat() {
  return useResumeMainChat(null);
}
