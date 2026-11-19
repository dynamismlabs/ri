/**
 * A sign-in that returns to Settings says what it connected in `?connected=`.
 * The web callback names the account or server ("Work", "X (Twitter)"). The
 * desktop app's callback only knows the sign-in worked and sends
 * `CONNECTED_RESULT`, so the notice says it once, not "Connected Connected".
 */
export const CONNECTED_RESULT = 'Connected';

export function connectedNotice(connected: string): string {
  return connected === CONNECTED_RESULT ? CONNECTED_RESULT : `Connected ${connected}`;
}
