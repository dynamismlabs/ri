'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { hasActiveInput } from '@/lib/client/active-input';
import { flushCaptureDrafts } from '@/lib/client/capture-draft';
import { UNLOAD_BLOCKER_MESSAGES, viewerUnloadBlocker, type UnloadBlocker } from '@/lib/client/version-reload';
import { flushChatDrafts } from '@/lib/client/chat-drafts';
import { documentSaves } from '@/lib/client/document-saves';
import { countUnsavedMutations } from '@/lib/query/mutation-meta';

import { installHistoryNavigation } from '@/lib/client/history-navigation';
import '@/lib/client/desktop';
import { DesktopNavButtons } from './desktop-nav-buttons';

/** Saves what it can before the desktop app closes or replaces this page, and
 * names the first thing that still isn't saved (null once nothing is). */
async function closeBlocker(unsavedRequests: () => number): Promise<UnloadBlocker | null> {
  try { await documentSaves.flushAll(); } catch { return 'document'; }
  try { await flushCaptureDrafts(); } catch { return 'capture'; }
  try { flushChatDrafts(); } catch { return 'chat'; }
  const deadline = Date.now() + 10_000;
  while (unsavedRequests() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  if (unsavedRequests()) return 'request';
  return documentSaves.has() ? 'document' : null;
}

/** Navigation and save handshakes belong to every viewer document, including
 * team spaces. Personal service controls mount separately in the layout. */
export function DesktopChrome() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (window.riDesktop) document.documentElement.dataset.riDesktop = window.riDesktop.platform;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const blocker = viewerUnloadBlocker(() => countUnsavedMutations(queryClient));
      if (!blocker) return;
      void documentSaves.flushAll().catch(() => {});
      // Shown once the person stays. The leave prompt itself can't say why.
      toast.warning(UNLOAD_BLOCKER_MESSAGES[blocker], { id: 'unload-guard', description: 'That is why this page asked before leaving.' });
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    // Window close now hides the live desktop renderer. Flush pending document
    // edits without freezing it or interrupting recordings/background work.
    // Failed writes keep their existing synchronous durable drafts for retry.
    const visibility = () => {
      if (window.riDesktop && document.visibilityState === 'hidden') void documentSaves.flushAll().catch(() => {});
    };
    document.addEventListener('visibilitychange', visibility);
    // A hidden microphone loses its visible recording controls. Keep this
    // window open until voice capture/transcription is finished or cancelled.
    const background = window.riDesktop?.onPrepareBackground?.(() => !hasActiveInput());
    const unsubscribe = window.riDesktop?.onPrepareClose?.(async () => {
      if (hasActiveInput()) return 'input';
      document.body.inert = true;
      try {
        const blocker = await closeBlocker(() => countUnsavedMutations(queryClient));
        if (blocker) document.body.inert = false;
        return blocker ?? true;
      } catch (error) { document.body.inert = false; throw error; }
    });
    const resume = window.riDesktop?.onResume?.(() => { document.body.inert = false; });
    return () => { resume?.(); background?.(); document.body.inert = false; window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('visibilitychange', visibility); unsubscribe?.(); };
  }, [queryClient]);
  // Back and Forward from the keyboard and a mouse's side buttons, which a
  // browser handles itself and this window doesn't. Left alone where the
  // keys mean something else (`navigationKeyBlocked`).
  useEffect(() => {
    const desktop = window.riDesktop;
    if (!desktop) return;
    return installHistoryNavigation(desktop.platform);
  }, []);
  // Pages without the dashboard's title bar get this one: a drag strip that
  // still carries Back and Forward, so a full-page note is never a dead end.
  return <div className="desktop-drag-fallback"><DesktopNavButtons /></div>;
}
