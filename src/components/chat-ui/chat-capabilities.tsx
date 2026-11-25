'use client';

import { createContext, useContext } from 'react';

/** Contextual interactions around the common transcript, independent of its data transport. */
export const ChatCapabilities = createContext<{
  deliveryReceipts: boolean;
  prepareResults: boolean;
  coordination?: boolean;
  /** Messages sent while the chat works wait in its queue (docs/message-queue.md). A team's shared chat queues turns itself. */
  messageQueue?: boolean;
}>({ deliveryReceipts: true, prepareResults: true });
export const useChatCapabilities = () => useContext(ChatCapabilities);
