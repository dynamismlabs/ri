import { describe, it, expect } from 'vitest';
import {
  actionLabel,
  approvalNote,
  formatWhen,
  subjectFromRecord,
  subjectLookupActionId,
  summarizeCall,
  toolNameFor,
} from './approval-describe';

describe('actionLabel / toolNameFor', () => {
  it('humanizes the method of an action id', () => {
    expect(actionLabel('google_calendar.delete_event')).toBe('Delete event');
    expect(actionLabel('gmail.send_email')).toBe('Send email');
    expect(actionLabel('mcp.linear.createIssue')).toBe('Create issue');
    expect(actionLabel('mcp.my_server.post-update')).toBe('Post update');
  });

  it('matches the MCP tool name the agent called', () => {
    expect(toolNameFor('google_calendar.delete_event')).toBe('google_calendar__delete_event');
    expect(toolNameFor('mcp.linear.createIssue')).toBe('mcp__linear__createIssue');
  });
});

describe('formatWhen', () => {
  it('formats date-times and all-day dates in host time, and leaves other text alone', () => {
    const dt = '2026-09-30T13:00:00Z';
    expect(formatWhen(dt)).toBe(
      new Date(dt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    );
    expect(formatWhen('2026-09-30')).toBe('Wed, Sep 30');
    expect(formatWhen('next week')).toBe('next week');
  });
});

describe('summarizeCall', () => {
  it('leads with the looked-up subject for an id-only delete', () => {
    const { summary, details } = summarizeCall(
      { calendarId: 'primary', eventId: 'evt_123' },
      'Team standup · Wed, Sep 30, 9:00 AM',
    );
    expect(summary).toBe('Team standup · Wed, Sep 30, 9:00 AM');
    expect(details).toEqual([
      { label: 'Calendar id', value: 'primary' },
      { label: 'Event id', value: 'evt_123' },
    ]);
  });

  it('falls back to the id when nothing names the target', () => {
    expect(summarizeCall({ calendarId: 'primary', eventId: 'evt_123' }).summary).toBe('Event id evt_123');
    expect(summarizeCall({ eventId: 'evt_123' }).summary).toBe('Event id evt_123');
  });

  it('names the recipient and subject of a send', () => {
    const { summary, details } = summarizeCall({
      to: ['ana@example.com', 'bo@example.com'],
      subject: 'Quarterly numbers',
      body: 'Hi both,\n\nAttached are the numbers.',
      account: 'me@example.com',
    });
    expect(summary).toBe('To ana@example.com, bo@example.com · Quarterly numbers');
    // Salient fields first, and the account routing field is never an argument.
    expect(details.map((d) => d.label)).toEqual(['To', 'Subject', 'Body']);
    // The body is what the person approves sending, so it keeps its own line breaks.
    expect(details[2]!.value).toBe('Hi both,\n\nAttached are the numbers.');
  });

  it('never cuts who a message reaches, and shows the whole body for the card to expand', () => {
    const to = Array.from({ length: 30 }, (_, i) => `person${i}@example.com`);
    const body = `Numbers below.\n\n${'Row of figures. '.repeat(100)}`;
    const { summary, details } = summarizeCall({
      to, cc: 'lead@example.com, cfo@example.com', bcc: [{ email: 'archive@example.com', name: 'Archive' }],
      subject: 'Quarterly numbers', body,
    });
    // The line names as many as fit and counts the rest, copies too, and never cuts an address.
    expect(summary).toMatch(/^To person0@example\.com, person1@example\.com, person2@example\.com.* and \d+ more · Quarterly numbers$/);
    expect(summary).not.toMatch(/person\d+@exa(?!mple\.com)/);
    const shown = Number(/and (\d+) more/.exec(summary)![1]);
    expect(shown).toBe(30 - summary.split('To ')[1]!.split(' and ')[0]!.split(', ').length + 3);
    const field = (label: string) => details.find((d) => d.label === label)?.value;
    expect(field('To')).toBe(to.join(', '));
    expect(field('Cc')).toBe('lead@example.com, cfo@example.com');
    expect(field('Bcc')).toBe('Archive <archive@example.com>');
    expect(field('Body')).toBe(body);
    expect(details.map((d) => d.label)).toEqual(['To', 'Cc', 'Bcc', 'Subject', 'Body']);
  });

  it('lists an event\'s guests whole, and keeps every argument that decides the effect however many others there are', () => {
    const others = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`option${i}`, `value ${i}`]));
    const { details } = summarizeCall({ ...others, summary: 'Planning', attendees: [{ email: 'a@example.com' }, { email: 'b@example.com', displayName: 'Bo' }], start: '2026-10-01T15:00:00Z' });
    expect(details.slice(0, 3).map((d) => d.label)).toEqual(['Attendees', 'Summary', 'Start']);
    expect(details[0]!.value).toBe('a@example.com, Bo <b@example.com>');
    // Past the deciding ones, other arguments are listed up to eight.
    expect(details).toHaveLength(3 + 8);
  });

  it('quotes the text of a post when there is no title', () => {
    expect(summarizeCall({ channel: '#general', text: 'Ship it' }).summary).toBe('To #general · “Ship it”');
  });

  it('adds the start time of a created event', () => {
    const start = '2026-10-01T15:00:00Z';
    expect(summarizeCall({ summary: 'Dentist', start }).summary).toBe(`Dentist · ${formatWhen(start)}`);
  });

  it('copes with empty and odd input', () => {
    expect(summarizeCall(undefined).summary).toBe('No arguments');
    expect(summarizeCall({ flags: { dryRun: false } }).summary).toBe('Flags: {"dryRun":false}');
    expect(summarizeCall({ items: [{ a: 1 }, { b: 2 }] }).details).toEqual([{ label: 'Items', value: '2 items' }]);
  });

  it('truncates long values', () => {
    const { summary } = summarizeCall({ title: 'x'.repeat(400) });
    expect(summary.length).toBeLessThanOrEqual(160);
    expect(summary.endsWith('…')).toBe(true);
  });
});

describe('subjectFromRecord', () => {
  it('names a calendar event by title and time', () => {
    const start = '2026-09-30T13:00:00Z';
    expect(subjectFromRecord({ id: 'e1', summary: 'Team standup', start })).toBe(`Team standup · ${formatWhen(start)}`);
  });

  it('names a message by subject and sender', () => {
    expect(subjectFromRecord({ subject: 'Invoice', from: 'billing@example.com' })).toBe('Invoice · from billing@example.com');
  });

  it('unwraps an ingested MCP tool result', () => {
    const start = '2026-09-30T13:00:00Z';
    const mcp = (text: string, extra: Record<string, unknown> = {}) => ({
      server: 'team_calendar',
      tool: 'get_event',
      isError: false,
      content: [{ type: 'text', text }],
      ...extra,
    });
    expect(subjectFromRecord(mcp(JSON.stringify({ id: 'e1', summary: 'Team standup', start })))).toBe(
      `Team standup · ${formatWhen(start)}`,
    );
    expect(subjectFromRecord(mcp('not json'))).toBeNull();
    expect(subjectFromRecord(mcp(JSON.stringify({ summary: 'x' }), { isError: true }))).toBeNull();
    expect(subjectFromRecord(mcp('ignored', { structuredContent: { title: 'Roadmap' } }))).toBe('Roadmap');
  });

  it('returns null when nothing is nameable', () => {
    expect(subjectFromRecord({ id: 'x' })).toBeNull();
    expect(subjectFromRecord(null)).toBeNull();
    expect(subjectFromRecord(['a'])).toBeNull();
  });
});

describe('subjectLookupActionId', () => {
  const reads = new Set(['google_calendar.get_event', 'google_calendar.list_events', 'calendly.get_event']);

  it('pairs a destructive action with its toolkit’s get read', () => {
    expect(subjectLookupActionId('google_calendar.delete_event', reads)).toBe('google_calendar.get_event');
    expect(subjectLookupActionId('google_calendar.update_event', reads)).toBe('google_calendar.get_event');
    expect(subjectLookupActionId('calendly.cancel_event', reads)).toBe('calendly.get_event');
  });

  it('never pairs a send or a toolkit without the read', () => {
    expect(subjectLookupActionId('gmail.send_email', reads)).toBeNull();
    expect(subjectLookupActionId('outlook_calendar.delete_event', reads)).toBeNull();
    expect(subjectLookupActionId('nodot', reads)).toBeNull();
  });
});

describe('approvalNote', () => {
  const calls = [
    { toolName: 'google_calendar__delete_event', account: 'me@example.com', preview: { calendarId: 'primary', eventId: 'a' } },
    { toolName: 'google_calendar__delete_event', account: 'me@example.com', preview: { calendarId: 'primary', eventId: 'b' } },
  ];

  it('tells the agent to retry exactly the approved calls, listing their arguments', () => {
    const note = approvalNote('approve', calls, 5);
    expect(note).toMatch(/^\[Connector approval, from the app on the user's behalf\]/);
    expect(note).toContain('The user approved 2 pending google_calendar__delete_event calls (account me@example.com).');
    expect(note).toContain('Retry exactly those calls now with the same arguments.');
    expect(note).toContain('for the next 5 minutes');
    expect(note).toContain('- {"calendarId":"primary","eventId":"a"}');
    expect(note).toContain('- {"calendarId":"primary","eventId":"b"}');
  });

  it('reads naturally for a single call', () => {
    const note = approvalNote('approve', calls.slice(0, 1), 5);
    expect(note).toContain('The user approved your pending google_calendar__delete_event call');
    expect(note).toContain('Retry that exact call now');
  });

  it('says the action no longer asks when always allowed', () => {
    expect(approvalNote('always', calls, 5)).toContain(
      'The user set google_calendar__delete_event to run without asking from now on and approved 2 pending',
    );
  });

  it('tells the agent to stand down on denial', () => {
    const note = approvalNote('deny', calls, 5);
    expect(note).toContain('The user denied 2 pending google_calendar__delete_event calls');
    expect(note).toContain('Do not retry them.');
  });

  it('groups by tool and caps a long list', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ toolName: 'gmail__send_email', account: null, preview: { i } }));
    const note = approvalNote('approve', [...many, calls[0]!], 5);
    expect(note).toContain('The user approved 30 pending gmail__send_email calls. Retry');
    expect(note).toContain('- …and 5 more');
    expect(note).toContain('The user approved your pending google_calendar__delete_event call (account me@example.com).');
  });
});
