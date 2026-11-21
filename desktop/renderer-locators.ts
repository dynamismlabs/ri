import type { Page } from 'playwright-core';

/** The editable note title, independent of the field's drawing. */
export function noteTitleField(page: Page) {
  return page.getByRole('textbox', { name: 'Note title', exact: true });
}
