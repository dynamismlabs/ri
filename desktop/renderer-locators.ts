import type { Page } from 'playwright-core';

/** The visible note title, including the retained editor under a modal's aria-hidden. */
export function noteTitleField(page: Page) {
  return page.getByRole('textbox', { name: 'Note title', exact: true, includeHidden: true })
    .filter({ visible: true });
}

/** The current installation's channel, distinguished from other Test actions. */
export function desktopChannelTestButton(page: Page) {
  return page.locator('[data-slot="card"]', {
    has: page.getByText(/^This desktop app(?: · \d+ events)?$/),
  })
    .getByRole('button', { name: 'Test', exact: true });
}
