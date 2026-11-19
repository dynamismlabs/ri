/**
 * The app kit's install and safe-change steps (docs/personal-apps.md "Building and changing apps"),
 * named for the person, with what each is doing in plain words.
 */
import { APP_NAME } from '@/constants/app';

export type StepStatus = 'started' | 'passed' | 'failed' | 'skipped';

export const STEP_LABELS: Record<string, string> = {
  create: 'Create', prepare: 'Get its dependencies', resolve: 'Find the commit', copy: 'Copy it out', install: 'Install', typecheck: 'Typecheck', test: 'Test',
  build: 'Build', rehearse: 'Try it on a copy of your data', stop: 'Stop the app', snapshot: 'Snapshot your data', switch: 'Switch over', rollback: 'Roll back',
  uninstall: 'Uninstall',
};

const STEP_DOING: Record<string, (name: string) => string> = {
  create: () => 'Making it from the app kit.',
  prepare: (name) => `Getting what ${name} needs to run.`,
  resolve: () => 'Finding the exact version to install.',
  copy: () => 'Making a clean copy of that version to check and run.',
  install: () => 'Installing its packages in that copy.',
  typecheck: () => 'Checking its code.',
  test: () => 'Running its tests on sample data, never yours.',
  build: () => 'Building it.',
  rehearse: () => 'Starting it on a copy of your data to make sure it works.',
  stop: (name) => `Stopping the ${name} that was running.`,
  snapshot: () => 'Saving a snapshot of your data first.',
  switch: () => 'Starting the new version.',
  rollback: () => 'Putting the previous version back.',
  uninstall: () => 'Removing its background service.',
};

/** The steps the kit runs to install or switch an app, in order. Ones a run doesn't need it skips or leaves out. */
const PLAN = ['prepare', 'resolve', 'copy', 'install', 'typecheck', 'test', 'build', 'rehearse', 'stop', 'snapshot', 'switch'];

export const stepLabel = (step: string) => STEP_LABELS[step] ?? step;

export interface ProgressRow {
  key: string;
  label: string;
  /** What it does, in plain words. */
  doing: string;
  /** `pending` is still to come. `waiting` is waiting on the person. */
  status: StepStatus | 'pending' | 'waiting';
  detail?: string;
}

export interface ProgressJob {
  kind: string;
  state: 'running' | 'done' | 'failed';
  steps: { step: string; status: StepStatus; detail?: string }[];
}

/**
 * Every step of an install or an update, one row each: the ones the kit reported, then, while it
 * runs, the ones still to come. An install ends with Ri connecting, which waits on the person once
 * the app runs, until they allow Ri in it.
 */
export function progressRows(job: ProgressJob, appName: string, connected: boolean): ProgressRow[] {
  const reported = new Set(job.steps.map((step) => step.step));
  const reached = Math.max(-1, ...job.steps.map((step) => PLAN.indexOf(step.step)));
  const rows: ProgressRow[] = job.steps.map((step) => ({
    key: step.step, label: stepLabel(step.step), doing: (STEP_DOING[step.step] ?? (() => ''))(appName), status: step.status,
    ...(step.detail && step.status === 'failed' ? { detail: step.detail } : {}),
  }));
  if (job.state === 'running') {
    for (const step of PLAN.slice(reached + 1)) if (!reported.has(step)) rows.push({ key: step, label: stepLabel(step), doing: STEP_DOING[step]!(appName), status: 'pending' });
  }
  if (job.kind === 'install' && job.state !== 'failed') {
    rows.push({
      key: 'connect', label: `Connect to ${APP_NAME}`, doing: connected ? `${APP_NAME} can use ${appName}.` : `${appName} asks what ${APP_NAME} may do in it.`,
      status: job.state === 'running' ? 'pending' : connected ? 'passed' : 'waiting',
    });
  }
  return rows;
}
