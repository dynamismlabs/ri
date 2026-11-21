import type { Page } from 'playwright-core';

/** The visible note title, including the retained editor under a modal's aria-hidden. */
export function noteTitleField(page: Page) {
  return page.getByRole('textbox', { name: 'Note title', exact: true, includeHidden: true })
    .filter({ visible: true });
}
