/**
 * `read_docs`: Ri's user guide for any chat, from the guide this Ri ships
 * (src/lib/guide/guide.ts). Read-only and public content, so it's the same
 * for every caller, local or remote, and it never says where the files are.
 */

import { z } from 'zod';
import { APP_NAME, APP_SHORT_ID } from '@/constants/app';
import { closeGuideMatches, findGuidePage, GUIDE_URL, loadGuide, searchGuide, summarize } from '@/lib/guide/guide';
import { ActionError, defineAction } from './types';

const read_docs_action = defineAction({
  name: 'read_docs',
  description:
    `Read ${APP_NAME}'s user guide, the pages at ${GUIDE_URL} as they are for this version of ${APP_NAME}. ` +
    'With no params, lists every page in order (id, title, description, url). ' +
    'query searches titles and text and returns the best pages with a snippet each. ' +
    'page returns one page\'s full Markdown by its id, such as "getting-started/install". ' +
    `Use it before answering how ${APP_NAME} works (a feature, a setting, setup or an error), answer from the page, and give its url.`,
  params: {
    page: z.string().min(1).max(300).optional()
      .describe('A page id from the list, such as "concepts/agents". A /docs/ path or ri.app address works too.'),
    query: z.string().min(1).max(200).optional()
      .describe('Words to search for, such as "keyboard shortcuts" or "connect my phone".'),
  },
  handler: (_ctx, { page, query }) => {
    if (page !== undefined && query !== undefined) {
      throw new ActionError('invalid_params', 'Pass page or query, not both.', 'Search with query, then read one result with page.');
    }
    const pages = loadGuide();
    if (!pages || pages.length === 0) {
      throw new ActionError('unsupported', `This copy of ${APP_NAME} has no guide.`, `Read it at ${GUIDE_URL}.`);
    }
    if (page !== undefined) {
      const found = findGuidePage(pages, page);
      if (!found) {
        const close = closeGuideMatches(pages, page);
        throw new ActionError(
          'not_found',
          `No guide page "${page}".${close.length ? ` Close matches: ${close.join(', ')}.` : ''}`,
          `Call read_docs with no params for every page, or with query to search.`,
          { closeMatches: close },
        );
      }
      return { id: found.id, title: found.title, description: found.description, url: found.url, markdown: found.markdown };
    }
    if (query !== undefined) {
      const results = searchGuide(pages, query);
      return {
        query,
        results,
        ...(results.length === 0 ? { hint: 'Nothing matched. Try fewer or other words, or call read_docs with no params for every page.' } : {}),
      };
    }
    return {
      pages: pages.map(summarize),
      hint: `Read a page with page: "<id>", or search with query. \`${APP_SHORT_ID} agent read_docs --page <id>\` does the same from a shell.`,
    };
  },
});

export const docsActions = [read_docs_action];
