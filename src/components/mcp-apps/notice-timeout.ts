'use client';
import { useEffect, useRef } from 'react';

/** How long an app view's notice stays before it clears itself. */
export const NOTICE_MS = 12_000;

/**
 * Clears a notice after `ms`, but never out from under the keyboard. While
 * focus is inside it (on its Dismiss button), it stays, and it clears as focus
 * moves on. Removing the focused element would drop focus to the page's body
 * and lose the person's place. Put the returned ref on the notice.
 */
export function useNoticeTimeout<T extends HTMLElement>(notice: string | null, clear: () => void, ms = NOTICE_MS) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!notice || !element) return;
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      if (!element.contains(document.activeElement)) clear();
    }, ms);
    const left = (event: FocusEvent) => {
      if (expired && !element.contains(event.relatedTarget as Node | null)) clear();
    };
    element.addEventListener('focusout', left);
    return () => { clearTimeout(timer); element.removeEventListener('focusout', left); };
  }, [notice, clear, ms]);
  return ref;
}
