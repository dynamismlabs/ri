/** Before Ri closes or replaces its page, the page saves what it can and answers
 * whether anything would still be lost (src/components/desktop/desktop-chrome.tsx).
 * When something would be, Ri asks the person first. These name why. */
import { isUnloadBlocker, UNLOAD_BLOCKER_MESSAGES, type UnloadBlocker } from '../src/lib/client/unload-blockers';

/** How long a page has to answer before Ri asks anyway. */
export const CLOSE_ANSWER_MS = 15_000;

/** What the page named, `unsaved` from a page that only says no (one from
 * before pages named it), or `no-answer` when none came in time. */
export type CloseHold = UnloadBlocker | 'unsaved' | 'no-answer';

/** A page's answer. Null lets it close. Only a known name is taken from it. */
export function closeHold(reply: { ok?: unknown; waitingFor?: unknown }): CloseHold | null {
  if (reply.ok === true) return null;
  return isUnloadBlocker(reply.waitingFor) ? reply.waitingFor : 'unsaved';
}

const GENERAL = 'Keep Ri open to finish your recording or upload and retry pending saves. Saved document, chat and capture drafts can be recovered. Content that could not be saved on this device may be lost if you continue.';

/** The dialog's detail, led by what the page said is still unsaved. */
export function closeDialogDetail(hold: CloseHold): string {
  return isUnloadBlocker(hold) ? `${UNLOAD_BLOCKER_MESSAGES[hold]} ${GENERAL}` : GENERAL;
}

/** One line for the app's log, so a run stopped at this dialog says why. */
export function closeHoldLog(hold: CloseHold): string {
  const why = hold === 'no-answer' ? `The page did not answer within ${CLOSE_ANSWER_MS / 1000} seconds.`
    : hold === 'unsaved' ? 'The page has unsaved work.'
    : UNLOAD_BLOCKER_MESSAGES[hold];
  return `Asked before closing (${hold}). ${why}`;
}
