import { describe, expect, it } from 'vitest';
import { AppPromptError, MAX_APP_PROMPTS, MAX_PROMPT_RESULT_BYTES, menuPrompts, promptArguments, promptBlocks } from './app-prompts';

const app = { serverId: 'srv-people', toolkitId: 'app_people', name: 'People', slug: 'job_search' };

describe('app prompts in the / menu', () => {
  it('lists valid prompts once, in the app\'s order, named by app and prompt, with their arguments', () => {
    const listed = menuPrompts([
      { name: 'prepare-for-a-meeting', title: ' Prepare for a meeting ', description: 'Get ready.', arguments: [
        { name: 'person', description: 'Who you are meeting.', required: true },
        { name: 'note' },
        { name: '' },
      ] },
      { name: 'prepare-for-a-meeting' },
      { name: '' },
      { name: 'bad\u0007name' },
      { name: 'weekly review' },
    ], app);
    expect(listed).toEqual([
      { serverId: 'srv-people', toolkitId: 'app_people', app: 'People', command: 'job-search:prepare-for-a-meeting', name: 'prepare-for-a-meeting', title: 'Prepare for a meeting', description: 'Get ready.',
        arguments: [{ name: 'person', description: 'Who you are meeting.', required: true }, { name: 'note', required: false }] },
      { serverId: 'srv-people', toolkitId: 'app_people', app: 'People', command: 'job-search:weekly-review', name: 'weekly review', arguments: [] },
    ]);
    expect(menuPrompts(Array.from({ length: 80 }, (_, i) => ({ name: `p${i}` })), app)).toHaveLength(MAX_APP_PROMPTS);
  });

  it('sends only declared arguments, trimmed, and asks for a missing required one by its label', () => {
    const prompt = { name: 'remember', title: 'Remember something', arguments: [
      { name: 'person', title: 'Person', required: true }, { name: 'note', required: false },
    ] };
    expect(promptArguments(prompt, { person: ' Ada ', note: '  ', extra: 'x' })).toEqual({ person: 'Ada' });
    expect(() => promptArguments(prompt, { note: 'moved' })).toThrow(new AppPromptError('invalid', 'Remember something needs Person.'));
    expect(() => promptArguments(prompt, { person: 'x'.repeat(5_000) })).toThrow('Person is too long.');
    expect(() => promptArguments({ name: 'pick', arguments: [{ name: 'sourceAccount', required: true }] })).toThrow('pick needs Source account.');
  });

  it('puts the app\'s messages in the draft as an app message lands, naming what it can\'t', () => {
    expect(promptBlocks({ messages: [
      { role: 'user', content: { type: 'text', text: 'Prepare me for my meeting with Ada.' } },
      { role: 'user', content: { type: 'resource', resource: { uri: 'people://ada', mimeType: 'text/plain', text: 'Ada Lovelace' } } },
      { role: 'assistant', content: { type: 'text', text: 'Here is what I know.' } },
      { role: 'user', content: { type: 'audio', data: 'AAAA', mimeType: 'audio/wav' } },
      { role: 'user', content: { type: 'video', data: 'AAAA' } },
    ] })).toEqual([
      { type: 'text', text: 'Prepare me for my meeting with Ada.' },
      { type: 'text', text: '\n\n' },
      { type: 'resource', resource: { uri: 'people://ada', mimeType: 'text/plain', text: 'Ada Lovelace' } },
      { type: 'text', text: '\n\n' },
      { type: 'text', text: 'Here is what I know.', _meta: { 'openai/title': 'Assistant turn' } },
      { type: 'text', text: '\n\n' },
      { type: 'resource', resource: { uri: 'audio', mimeType: 'audio/wav', blob: 'AAAA' } },
      { type: 'text', text: '\n\n' },
      { type: 'text', text: '[The app included video that Ri can’t put in a draft]' },
    ]);
    expect(() => promptBlocks({ messages: [{ role: 'user', content: { type: 'text', text: 'x'.repeat(MAX_PROMPT_RESULT_BYTES) } }] })).toThrow('larger than Ri puts in a draft');
  });
});
