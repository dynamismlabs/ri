/** A catalog app being installed or updated, on its page (docs/personal-apps.md "The catalog"). */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppProgress, type ProgressOutcomeJob } from './app-progress';
import { progressRows } from './app-steps';

const words = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&[#\w]+;/g, '').replace(/\s+/g, ' ');

describe('the steps, one row each', () => {
  it('shows the ones done, the one running and the ones to come, then Ri connecting', () => {
    const rows = progressRows({ kind: 'install', state: 'running', steps: [{ step: 'prepare', status: 'passed' }, { step: 'resolve', status: 'started' }] }, 'People', false);
    expect(rows.map((row) => `${row.key}:${row.status}`)).toEqual([
      'prepare:passed', 'resolve:started', 'copy:pending', 'install:pending', 'typecheck:pending', 'test:pending', 'build:pending',
      'rehearse:pending', 'stop:pending', 'snapshot:pending', 'switch:pending', 'connect:pending',
    ]);
    expect(rows[0]).toMatchObject({ label: 'Get its dependencies', doing: 'Getting what People needs to run.' });
    expect(rows.find((row) => row.key === 'test')?.doing).toBe('Running its tests on sample data, never yours.');
  });

  it('never shows a step the kit skipped over as still to come', () => {
    // Its dependencies were already there, so the kit went straight to finding the commit.
    const rows = progressRows({ kind: 'change', state: 'running', steps: [{ step: 'resolve', status: 'passed' }, { step: 'copy', status: 'started' }] }, 'People', true);
    expect(rows.map((row) => row.key)).not.toContain('prepare');
    expect(rows.at(-1)?.key).toBe('switch');
  });

  it('waits on the person once the app runs and Ri isn\'t allowed in it yet', () => {
    const steps = [{ step: 'switch', status: 'passed' as const }];
    expect(progressRows({ kind: 'install', state: 'done', steps }, 'People', false).at(-1)).toMatchObject({ key: 'connect', status: 'waiting', doing: 'People asks what Ri may do in it.' });
    expect(progressRows({ kind: 'install', state: 'done', steps }, 'People', true).at(-1)).toMatchObject({ key: 'connect', status: 'passed' });
  });

  it('ends at the step that failed, with what it printed', () => {
    const rows = progressRows({ kind: 'install', state: 'failed', steps: [{ step: 'test', status: 'failed', detail: 'FAIL tests/app.test.ts' }] }, 'People', false);
    expect(rows).toEqual([expect.objectContaining({ key: 'test', status: 'failed', detail: 'FAIL tests/app.test.ts' })]);
  });
});

describe('the page', () => {
  const job = (over: Partial<ProgressOutcomeJob>): ProgressOutcomeJob => ({ kind: 'install', state: 'running', steps: [], ...over });
  const render = (props: Partial<Parameters<typeof AppProgress>[0]>) => words(renderToStaticMarkup(
    <AppProgress name="People" version="v0.1.5" job={null} installed connected={false} computer="AI Mac Mini" {...props} />,
  ));

  it('says what\'s happening while it installs, and that it keeps going', () => {
    const text = render({ job: job({ steps: [{ step: 'prepare', status: 'started' }] }), installed: false });
    expect(text).toContain('Installing People v0.1.5');
    expect(text).toContain('Get its dependencies');
    expect(text).toContain('It keeps going if you leave this page.');
    expect(text).not.toMatch(/—|;/);
  });

  it('says where it runs once it\'s ready, or that it waits for the person to allow Ri', () => {
    expect(render({ job: job({ state: 'done', steps: [{ step: 'switch', status: 'passed' }] }), connected: true }))
      .toContain('People v0.1.5 is running on AI Mac Mini, and Ri can use it.');
    const waiting = render({ job: job({ state: 'done', steps: [{ step: 'switch', status: 'passed' }] }) });
    expect(waiting).toContain('People is installed');
    expect(waiting).toContain('People is running on AI Mac Mini. Allow Ri in it to finish connecting.');
  });

  it('says an update that failed changed nothing, with the kit\'s reason and its log', () => {
    const text = render({ job: job({ kind: 'change', state: 'failed', steps: [{ step: 'test', status: 'failed' }], result: { outcome: 'checks_failed', message: 'Tests failed.', log: '/data/releases/change.log' } }), connected: true });
    expect(text).toContain('People wasn’t updated');
    expect(text).toContain('Nothing changed: the People you had is still running. Tests failed.');
    expect(text).toContain('/data/releases/change.log');
  });

  it('says where it stands when there\'s no install or update to show', () => {
    expect(render({ connected: true })).toContain('People is ready');
    expect(render({ installed: false })).toContain('People isn’t installed yet.');
  });
});
