import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { grantFromChoice, grantSummary, hubConsentOptions } from './grant';

const action = (id: string, mutating = false) => ({ id, description: id, input: z.object({}), mutating });
const toolkits = [
  { id: 'gmail', providerId: 'google', displayName: 'Gmail', actions: [action('gmail.search_messages'), action('gmail.get_message'), action('gmail.send_email', true)] },
  { id: 'google_calendar', providerId: 'google', displayName: 'Google Calendar', actions: [action('google_calendar.list_events'), action('google_calendar.create_event', true)] },
  { id: 'app_reading_log', providerId: 'app_reading_log', displayName: 'Reading Log', actions: [action('app_reading_log.list_books')] },
] as never;
const connections = [
  { id: 'c-home', providerId: 'google', accountId: 'home', email: 'me@example.com', status: 'active' },
  { id: 'c-work', providerId: 'google', accountId: 'work', email: 'me@work.example', status: 'active' },
  { id: 'c-old', providerId: 'google', accountId: 'old', email: 'old@example.com', status: 'needs_reauth' },
  { id: 'c-rl', providerId: 'app_reading_log', accountId: 'place:ri', status: 'active' },
] as never;

describe('the hub consent screen', () => {
  it('offers each live account with its tools, never another app, and ticks what the app asked for', () => {
    const options = hubConsentOptions(toolkits, connections, 'mail.read ri__list_tasks');
    expect(options.accounts.map(a => [a.service, a.account])).toEqual([
      ['Gmail', 'me@example.com'], ['Gmail', 'me@work.example'], ['Google Calendar', 'me@example.com'], ['Google Calendar', 'me@work.example'],
    ]);
    const gmail = options.accounts[0]!;
    expect(gmail.tools.map(t => [t.name, t.requested, t.asks])).toEqual([
      ['gmail__search_messages', true, false], ['gmail__get_message', true, false], ['gmail__send_email', false, true],
    ]);
    // Every write is marked as asking each time, a calendar event (which can invite people) too.
    expect(options.accounts[2]!.tools.map(t => [t.name, t.asks])).toEqual([['google_calendar__list_events', false], ['google_calendar__create_event', true]]);
    expect(options.services.find(s => s.name === 'list_tasks')?.requested).toBe(true);
    expect(options.services.find(s => s.name === 'create_task')).toMatchObject({ requested: false, write: true });
  });

  it('grants only what the screen offered', () => {
    const options = hubConsentOptions(toolkits, connections, null);
    const grant = grantFromChoice(options, {
      tools: { 'c-home': ['gmail__search_messages', 'gmail__forged'], 'c-old': ['gmail__search_messages'], 'c-rl': ['app_reading_log__list_books'], 'c-work': [] },
      services: ['ai_text', 'shell'],
    });
    expect(grant).toEqual({ accounts: [{ connectionId: 'c-home', toolkitId: 'gmail', tools: ['gmail__search_messages'] }], services: ['ai_text'] });
  });

  // People, Job Search and Travel ask for mail and calendar, which one Google account usually backs.
  it('keeps both services of one Google account ticked on re-consent, and names each by its own service', () => {
    const current = { accounts: [
      { connectionId: 'c-home', toolkitId: 'gmail', tools: ['gmail__search_messages', 'gmail__get_message'] },
      { connectionId: 'c-home', toolkitId: 'google_calendar', tools: ['google_calendar__list_events'] },
    ], services: [] };
    const options = hubConsentOptions(toolkits, connections, null, current);
    const ticked = (service: string, account: string) => options.accounts.find(a => a.service === service && a.account === account)!.tools.filter(t => t.requested).map(t => t.name);
    // Calendar on the same connection used to overwrite Gmail, so Gmail came back unticked.
    expect(ticked('Gmail', 'me@example.com')).toEqual(['gmail__search_messages', 'gmail__get_message']);
    expect(ticked('Google Calendar', 'me@example.com')).toEqual(['google_calendar__list_events']);
    expect(ticked('Gmail', 'me@work.example')).toEqual([]);
    // Submitting the screen unchanged grants the same two services, one row each.
    const resubmitted = grantFromChoice(options, { tools: { 'c-home': [...ticked('Gmail', 'me@example.com'), ...ticked('Google Calendar', 'me@example.com')] }, services: [] });
    expect(resubmitted).toEqual(current);
    // The calendar row says Calendar, not the first service found on its connection.
    expect(grantSummary(current, options)).toBe('Gmail (me@example.com), Google Calendar (me@example.com)');
  });
});
