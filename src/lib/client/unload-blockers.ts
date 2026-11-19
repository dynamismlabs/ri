/** What can keep a page from being left right now, and how to say it. The page's
 * own leave guards use these, and so does the desktop app, whose close dialog
 * names the one a page reports. Nothing here touches the browser, so the desktop
 * main process can import it. */
export const UNLOAD_BLOCKERS = ['chat', 'document', 'input', 'capture', 'request'] as const;

export type UnloadBlocker = typeof UNLOAD_BLOCKERS[number];

/** The browser's leave dialog can't say why, so the view explains it. */
export const UNLOAD_BLOCKER_MESSAGES: Record<UnloadBlocker, string> = {
  chat: 'A chat draft isn\'t saved yet, usually because a file is still uploading.',
  document: 'Edits to a task, note or area haven\'t reached Ri yet.',
  input: 'Voice input is still recording or transcribing.',
  capture: 'A capture isn\'t saved on this device yet.',
  request: 'Something you typed is still on its way to Ri.',
};

/** A page's answer crosses into the desktop app, so only a known name counts. */
export function isUnloadBlocker(value: unknown): value is UnloadBlocker {
  return typeof value === 'string' && (UNLOAD_BLOCKERS as readonly string[]).includes(value);
}
