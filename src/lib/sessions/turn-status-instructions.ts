import { chatStatusLinesEnabled } from '@/lib/db/queries';
import { handoffCliCommand } from '@/lib/work-results/instructions';

/**
 * The status line rule (docs/chat-status-lines.md), for an execution's
 * chats while status lines are on. The agent writes the line itself, since
 * it knows what it did and what it needs: no second model reads its turn.
 * Rides each message to the chat, with the handoff rule, so a resumed or
 * long-running chat follows the current setting.
 */
export function turnStatusInstructions(session: { executionId: string | null; surfaceKind: string | null }, cliCommand = handoffCliCommand()): string {
  if (!session.executionId || session.surfaceKind === 'result_review') return '';
  if (!chatStatusLinesEnabled()) return '';
  return [
    '# Status line',
    'When you are ready to end the turn, call set_chat_status before writing your final reply. Give one short line saying where this chat stands, so the person can tell from their chat lists without opening it. Write your final reply after your tool calls so it is the last thing in the turn.',
    'When you need something from them, set needs_you and start the line with what they need to do, verb first ("Pick A or B for the pricing table", "Test the preview on your phone"). Set effort to how much of their time it takes (quick: a click or a short reply, minutes: a few minutes to read or try something, block: a real decision or a long test) and say what it unblocks. Before you stop for them, make their part as small as you can: recommend an option, and prepare any test (a link, a short checklist, the one command to run).',
    'When you need nothing, leave needs_you false and say what you did or where things stand ("Merged the login fix, nothing needed").',
    `Use the set_chat_status MCP tool when attached, or run ${cliCommand} agent set_chat_status --input '<JSON object>'.`,
  ].join('\n\n');
}
