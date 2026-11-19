import { APP_NAME } from '@/constants/app';

/**
 * What every chat is told about Ri's guide: the app's and each agent's main
 * chat in their brief's rules (src/lib/orchestrator/harness-surface.ts), a
 * chat in an agent in its session instructions (src/lib/executor/session-spec.ts).
 */
export const GUIDE_INSTRUCTION =
  `**Look up how ${APP_NAME} works.** Before answering a question about ${APP_NAME} itself ` +
  '(a feature, a setting, setup or an error), call `read_docs` (`query` to search, `page` to read), ' +
  'answer from that page and give its url.';
