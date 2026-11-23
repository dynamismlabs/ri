# UI system: Edge Mac

Ri's next look. It keeps every screen's layout as it is and standardizes what the
screens are drawn with: colors, type, the frame, and the shared controls. Chosen
on 2026-11-19 after eight rounds of concepts (the review lives in
`personal/ui-review-2026-11/`, git-ignored, and was shared through beamd).

## Why

Ri was assembled by many agents, so the same idea is drawn several ways: buttons
in three radii, tabs as underlines here and pills there, 1,323 border classes at
13 opacities, labels in tracked capitals beside labels in sentence case, warm
grays in light mode. Each piece is fine alone. Together they read as unfinished.
The fix is one small system that every surface draws from, not a redesign.

## The system

- **Gray neutrals.** Hue 264 at a chroma near 0.003, in both themes. No brown.
- **Three surfaces.** The canvas (rail and top bar), the pane (where work is), and
  raised (fills inside a pane). The canvas sits one step off the pane, so the
  frame recedes without a heavy border.
- **The frame meets the window.** Columns run edge to edge and meet at one hairline
  border. No floating rounded panes with gutters between them.
- **Controls stay rounded.** Things you press are capsules. Only the
  frame is square.
- **Four text levels** (`--edge-t1` to `--edge-t4`): title, body, secondary, faint.
  Hierarchy comes from these and from weight, not from boxes.
- **The platform's font.** SF on a Mac, Segoe on Windows, a little tighter than
  Inter, so more fits.
- **Sentence case.** No small tracked capitals for labels.
- **Pane tabs are one segmented control**, the active tab drawn as a lifted thumb.
- **The chat input is white and lifts off the page** with a fine outline and a soft
  shadow. It reads as an input, not a gray box.
- **Your own messages stay inverted** (dark on a light page, light on a dark one), in
  the system's grays, so they stand out from the agent's replies. A quiet gray bubble
  was tried first and the inverted one won (2026-11-19).
- **Menus, popovers and dialogs lift by shadow**, not a border. Centered dialogs
  use 20px corners and a 40% black scrim in both themes, with no backdrop blur.
  A full-page phone search keeps square corners.
- **A secondary button is a quiet fill**, not an outline.

## How it is built

The concepts it came from are kept in `docs/ui-system-concept.html` (open it in a
browser and pick Edge Mac at the top), so the build can be checked
against them.

Edge Mac is Ri's only look (2026-11-20). It shipped as one squash commit, so
reverting that commit brings the previous design back. Classic was not kept behind
a switch: with one owner, a revert is the escape hatch, and a second look costs
upkeep on every change.

- The root layout always renders `data-look="edge"` on `<html>`. The attribute and
  the `html[data-look="edge"]` scoping in `edge.css` stay for now, so the switch
  reverts cleanly. Dropping them is the later cleanup phase.
- `APPEARANCE_SCRIPT` (`src/lib/client/appearance-script.ts`) runs first in the
  head, before first paint, and applies a light theme this browser chose. That
  ended the dark flash light-mode users saw on every load. `next/script`'s
  `beforeInteractive` is too late for this: Next queues it for its runtime, which
  runs after the first frame.
- `src/styles/edge.css` holds everything, scoped to `html[data-look="edge"]`:
  - **Tokens.** The `--edge-*` values, mapped onto the shadcn names (`--background`,
    `--card`, `--muted`, `--border`, `--user-bubble`, `--font-sans` and the rest), so
    every component built on them follows without a change.
  - **Dark tokens apply to nested `.dark` elements too.** The dashboard and focus
    view wrap their content in their own `.dark` div, and `theme.css` redeclares
    the classic dark values there. Without the second selector those values win
    inside the dashboard (the user bubble came out in classic's colors).
  - **Component rules** keyed by `data-slot`: shadcn's own slots (`button`,
    `dropdown-menu-content`, `tabs-list` ...) and the ones Ri adds to its
    hand-built frame (`rail`, `top-hud`, `pane-tabs`, `pane-tab-group`, `pane-tab`,
    `pane-tab-more`, `chat-composer-card`). An attribute selector under
    `html[data-look]` outranks a Tailwind utility, so these rules win without
    `!important`. (`edge.css` is also unlayered, and Tailwind's utilities sit in a
    layer, so the edge rules win either way. Specificity only decides between edge
    rules, which is why the broad ones use `:where()`.)
  - **`.uppercase` is neutralized.** Copy is written in sentence case and the
    classic look adds the `uppercase` class to keep its capitals. Never write a
    label in capitals in the source: the new look can't lower it.

Adding to it: give the element a `data-slot` that names what it is, then style that
slot in `edge.css`. Don't branch on the look in TypeScript.

### Shared slots

These carry the system across screens. Use them before inventing a new one.

| Slot | What it is | State it reads |
| --- | --- | --- |
| `segmented` | A switch with one track and a raised thumb (pane tabs, Agents and Recent, Light and Deep, list lanes, the chat lenses on an agent's page and the phone, the file viewer's modes, where files open, conflict choices, diff layout) | `aria-pressed`, `aria-selected` or `aria-checked` on each option. `data-size="touch"` keeps the phone's height and the options' own flex. `data-size="responsive"` uses the same 36px option height below 768px, with compact desktop options. `data-scroll` lets an unmeasured filter track scroll in place |
| `chip-button`, class `toolbar-button` | A capsule control in a toolbar or filter row, and the deck's status chips. `toolbarButtonClass` adds the class | `aria-pressed`, `data-on`, `toolbar-button-active`, `data-tone="attention"` or `"status"` (keeps its own color), `data-urgency` (Generate New Deck), `data-mode` (the permission chip) |
| `meta`, `meta-item` | The line of facts under a title: plain words with dots between them, no boxes | `data-kind` (status, area, energy, effort, deadline...), `data-energy` and `data-task-status` select theme-aware inks, `data-urgency="late"` or `"today"` |
| `area-select`, `task-badges`, `task-badge` | Components that join a `meta` line as they are | |
| `deadline-band`, `deadline-head`, `deadline-row`, `deadline-when` | The deck's deadlines: a colored date on a plain row | `data-urgency` (late, today, soon) |
| `review-bar`, `review-bar-title`, `review-action` | The review bar above the chat input, drawn like a second, smaller input | `data-state`, `data-tone`, `data-active` |
| `task-chip`, `task-chip-label` | The task a chat works on, in its header | `data-status` |
| `send-button` | The composer's Send control, the same capsule when enabled, sending or disabled. Its component keeps each state's fill | `disabled` |
| `hud-tools`, `hud-view-button` | The top bar's page tools in one capsule, and Close chat or Open latest chat | `aria-pressed`, `data-variant="close"` |
| `rail-foot`, `new-agent` | The rail's footer rows and its New agent button | |
| `entity-kind`, `entity-kind-label` | "Task · Money" or "Note · Tidewater Coffee" above a task or note title | |
| `properties` | The label and value grid on a task (Status, Deadline, Energy, Effort...) | |
| `header-action` | Continue with agent and Complete at the top of a task | `data-tone="agent"`, `data-state="done"` |
| `task-picker` | The task a note links to, in the note's `meta` line | |
| `callout` | A notice or summary inside a pane (Stream's triage digest): a soft raised panel, no outline | |
| `stream-meta` | The line under a Stream capture | |
| `search-field`, `icon-button` | The phone's search field and the bordered icon buttons beside it | |
| `action-button` | Small hand-built actions. Their size and placement come from the component, their shape and fill from the system | `data-variant="primary"`, `"ghost"` or `"floating"`, `data-tone="status"` or `"warning"`, `aria-pressed`, `aria-selected` or `aria-checked` |
| `status-strip` | A chat header's git summary and next action, in one quiet capsule | |
| `split-button` | Finder and its menu, one capsule with a divider between the two buttons | |
| `chat-tabs`, `chat-tabs-scroll`, `chat-tab` | The chat strip, its existing measured scroller, and each tab with its close control | `data-current="true"`, `aria-current="page"` on its activation button |
| `row-actions` | Hover actions on task, note and deck rows, also revealed by keyboard focus | `:focus-within` |
| `calendar-toolbar`, `calendar-navigation`, `calendar-date`, `calendar-spacer`, `calendar-work-toggle` | Calendar's header and date navigation. Below 768px the controls wrap, the date gets its own line and the close action stays at the top right | `data-kind="close"` on the close icon button |
| `work-chain`, `work-chain-step`, `work-chain-arrow` | Calendar's leverage summary. The phone keeps three flexible columns with wrapping labels and narrower connecting arrows | |
| `tool-tab-bar`, `tool-tab-label` | The agent tools header grows to fit touch options on a phone and shows their text labels. Compact desktop panels keep icon-only tabs | |
| `run-row`, `run-summary` | A run and its summary. Below 768px the summary wraps above the badges and time, which wrap together | |
| `search-footer` | Search navigation hints at 12px. All cmdk group headings use sentence case at 12px, including descendant utility variants | |
| `pairing`, `pairing-mark`, `pairing-decoration` | Pairing's surface, quiet icon tile and suppressed decorative gradients. Content reuses `callout` and the token field reuses `input-group`, with one focus outline around the group | |
| `floating-tools` | The floating tools list and folded strip: 14px content corners with the shared popover shadow | |
| `dialog-content`, `alert-dialog-content`, `dialog-overlay`, `alert-dialog-overlay` | Shared 20px centered dialog corners and an unblurred 40% black scrim. Search panels use these hooks too | `data-kind="search-page"` keeps full-page phone search square. `data-kind="wrapped"` lets an inner painted panel inherit the corners and use just the outer shadow |
| `settings-nav`, `settings-body` | Settings' shared navigation and content boundary. Neutral bordered sections become soft panels, small bordered actions become capsules, descriptive choices stay rows, and fields stay rectangular | `aria-current="page"` on navigation |
| `choice-row` | A descriptive option in a chooser or Settings, with a soft 8px selection fill | `aria-pressed`, `aria-selected` or `aria-checked` |
| `field` | A hand-built text field, textarea or select outside the shared input components | |
| `status-badge` | A small capsule fact, including schedule state and Runs trigger/activity badges | |
| `schedule-row` | A schedule's soft row | |
| `content-card` | A reference, app or thumbnail choice containing a title and supporting content. It stays a soft 14px rectangle even when the whole card opens | `aria-pressed`, `aria-selected` or `aria-checked` |
| `attachment-chip` | An inline file action, drawn as a capsule. Links written as prose keep their underline | `data-tone="bubble"` inherits the inverted message's ink |
| `calendar-event` | An event holds time and meeting details. It keeps its position, colored stripe and 8px content shape | |
| `image-picker` | An image or emoji preview tile, with its placeholder and upload affordance. It keeps a 14px content shape | |
| `completion-control` | A task's completion mark or a routine's checkbox. These retain their circle or checkbox shape and state, with a visible focus outline | |
| `menu-action` | A descriptive menu or list row, with an 8px hover shape. Separators stay on the row | |
| `segmented-option`, `split-button-action`, `settings-nav-item` | Explicit hooks for controls whose parent slot owns their drawing. Use only inside the matching parent | The parent's state contract |
| class `panel-tab` | A tool panel tab outside the segmented control (a file or chat opened beside, More). `panelTabClass` adds it | `panel-tab-on` |

Two broad rules cover hand-built pieces until each moves onto the shared components:
a hand-built `button` or `a` with `bg-primary` is a capsule, and a hand-built
`.border.bg-card` card loses its outline for a soft shadow (Board cards, Schedules rows).

### Focus

The look draws its own fills and shadows, and the components' focus rings are box
shadows too, so every control it restyles gets an explicit `:focus-visible` outline
in `edge.css` (inset inside a segmented track, which may scroll and clip). A new
restyled slot joins that list. `src/styles/edge.browser.test.ts` tabs through the
shared controls in both themes, checks the solid review action's hover contrast, and
checks a narrow lane switch still scrolls where its edge fades look. Phase 3 adds keyboard checks for git actions, split buttons, row actions, Settings fields and choices, Calendar navigation and chat tabs, plus hover contrast and split-button geometry checks in both themes.

Settings' generic bordered-action rules exclude the direct options of a
segmented control. Those tracks fit their options, and the active thumb keeps its
fill on hover. Independent pressed toggles in Settings' button groups use the
soft selected fill. Settings search keeps its own field ring without a second
outline. Other text fields clear their inherited ring when the shared outline is drawn, so focus stays a single treatment.

### Shapes

Anything you press is a capsule: buttons, chips, the options of a segmented
control, tabs. Anything that holds content is a rounded rectangle: text fields
(10px, overriding shadcn's capsule input), the chat input (22px), cards and callouts (14px), menus and popovers (12px),
dialogs. List rows take a small 8px radius for their hover and selection. A button
drawn as a rounded rectangle is a leftover, not a variant.

### The area above a title

A soft capsule with a chevron, at rest as well as on hover ("Task · [Money ⌄]"), so it
reads as a control without hovering. Words alone weren't clear enough (2026-11-20).
With no area it says "No area" in quieter type.

Inside `meta`, status, energy and blocked keep the colors classic gives them:
their rule sets `color: revert-layer`, which hands the color back to the
component's own utility classes.

## Phases

1. **Foundation (done 2026-11-19).** Tokens in both themes, the font, sentence
   case, the frame (rail, top bar), segmented pane tabs, the chat input, the user
   bubble, shadcn buttons, menus, dialogs and tabs. Behind the switch.
2. **Daily screens (done 2026-11-19).** Deadlines without tinted cards (a colored
   date, not a colored box), the review bar, the task chip, rail details (footer,
   New agent, Agents and Recent), the top bar's tools in one capsule, the deck
   filters and list toolbars as segmented controls and capsules, task and deck
   metadata as plain words, every shadcn Button a capsule. Then the task and note
   slideouts (and the full pages that share them): the kind line as plain words,
   date, repeat and priority as capsules, Energy and Effort as segmented controls,
   the header actions as capsules, and note rows' details as plain words. Then
   Stream (its switch, toolbar and digest), the agent page (New chat, the tool
   tabs as a segmented control, task chips), every tool panel's tabs, the
   Agent and Document toggle, the skill editor's toggles, the phone's search
   field, and the two broad rules above.
3. **The visible long tail (done 2026-11-20).** The git summary, permission and
   model chips, chat tabs and row hover actions now follow the system. Tiny
   capital labels get a readable sentence-case size. Finder is one split
   capsule. Calendar's view switches join the segmented control. Settings uses
   shared patterns for navigation, soft sections, bordered actions and fields,
   with descriptive choices as rows. Schedules has shared fields, actions and
   status badges. Hand-built choosers and the frequently used launcher,
   scratchpad, task creation and tools controls gain the shared hooks.
   Classic retains its source layout and utilities.
4. **Complete the control sweep and stop new drift (done 2026-11-20).** Chat
   questions, approvals, account access, files and recovery actions use the same
   hooks. Both library surfaces, onboarding, agent setup, identity choices, team actions,
   expanded provider settings, pairing and consent follow them too. Content
   keeps its shape as described below. The lint ratchet now catches new raw
   bordered controls and capital source labels. The live Apps screen's CSS-module
   cards and switches use the same hooks, with a check against its real stylesheet.
5. **Edge only (2026-11-20).** Every browser gets Edge Mac. The preview switch is
   gone, and one squash commit carries phases 1 to 5, so one revert undoes them.
6. **Default-look audit (done 2026-11-20).** HUD and chat header actions use
   readable capsules, and Send keeps its shape when disabled. Task energy,
   lifecycle status and today's deadline use theme-aware inks with at least
   4.5:1 contrast at 12px. Search headings bypass descendant uppercase variants,
   its hints are readable, and line tabs omit the extra underline. Centered
   dialogs share corners and a scrim. Agent tool tabs and Apps and Runs filters
   gain phone touch sizes. Run badges share `status-badge`, and phone runs and
   the full Calendar keep their text and controls inside the panel. Pairing uses
   quiet opaque panels and fields. Floating tools share 14px content corners.
   The Effort track keeps its existing scrolling behavior. A permanent edge
   fade would obscure the final option and its focus outline.
7. **Live with it.** Revert while it's young if it isn't right: new code adopts the
   hooks and the lint ratchet, so a revert gets harder with time.
8. **Clean up (later).** Move Edge's values into `theme.css` and delete the
   classic tokens, drop the `data-look` attribute and the `html[data-look="edge"]`
   scoping, retire the classic-only checks (the classic halves of the browser
   tests, `uppercase` classes kept only for classic), and replace hand-built
   classes the stylesheet overrides with the shared components. Copy still in
   Title Case in shared constants ("In Progress", "Priority Order", "Schedules and
   Triggers") reaches tests and the guide, so it moves then too.

## Completed raw-control audit

The separate phase 3 inventory is folded into this spec. Every entry is now
covered by an explicit shared hook, including the uncommon chooser, retry,
provider setup and team states. A button containing an image, a document summary
or an event is content as well as a press target:

| Intentionally retained shape | Where and why |
| --- | --- |
| Content cards, 14px | Entity references, Board activity, onboarding apps and service-form thumbnail options contain a title, image or supporting text. They use `content-card` |
| Descriptive rows, 8px | Questions, workstream and model choices, provider choices and source pickers contain descriptions or belong to a list. They use `choice-row` or `menu-action` |
| Calendar events, 8px | Day, Week and List event blocks represent time and meeting details. `calendar-event` preserves their placement and colored stripe. Join and warning actions are capsules |
| Image and emoji previews, 14px | Agent and area setup show the current image inside the picker. `image-picker` keeps the preview and dashed empty-state affordance |
| Completion circles and checkboxes | Task, subtask, area and routine completion marks use `completion-control`. Their state remains recognizable at 14 to 16px |
| Native switch track and thumb | The sent-voice Auto-send switch uses `switch`. Its existing state and track remain intact |

Small actions around those pieces are capsules. File chips inherit the ink of an
inverted bubble. Floating model-list and image actions stay opaque over their
content. Warning actions keep amber in a readable shade in both themes. Focus
outlines sit inside clipped event cells, menu rows, image pickers and segmented
options. `SegmentedTabs` still owns its measured scroller.

## Lint ratchet

`eslint.config.mjs` keeps the tooltip and UI restrictions in one shared selector
array. `no-restricted-syntax` catches:

- A raw `button` or `a` outside `src/components/ui/` with both a `border` and a
  `rounded` utility and no explicit `data-slot`. This includes string literals,
  `cn(...)`, conditional branches and template parts. A `ring-border` class alone
  does not count as a border. Classes supplied only through a variable cannot be
  inspected by this syntax rule.
- JSX text containing at least three capital letters and no lowercase letters.
  Write labels in sentence case and keep `uppercase` for classic. Code and
  protocol names are reviewed as exceptions, rather than rewritten as labels.

The per-file `uiSystemLegacyFiles` list is deliberately small:

| File | Why it remains |
| --- | --- |
| `src/components/settings/sections/api-transport.tsx` | HTTP is a protocol name |
| `src/components/workspaces/worktree-scripts-section.tsx` | PORT and $RI_SOURCE_CHECKOUT_PATH are literal code |
| `src/app/dev/execution-chat/page.tsx` | Synthetic harness diagnostics, outside normal product use |
| `src/app/integrations-test/page.tsx` | Standalone connector diagnostics with their own drawing |

A legacy override restates only the tooltip selectors, so `title` remains
forbidden there. To shrink the list, remove a path, run lint on that file, add
appropriate shared hooks and convert actual labels to sentence case while
preserving classic with `uppercase`. Keep literal protocol and code names
accurate. Do not add broad directory globs to the list.

`scripts/ui-system-lint.test.ts` exercises the actual ESLint config, including
esquery's `:has()` support, class literals inside `cn`, false positives, installed
primitives and the tooltip rule in legacy files. `src/styles/edge.browser.test.ts`
checks the risky drawing rules with real CSS in Chromium. The long-tail checks
fail with the new rules removed.
