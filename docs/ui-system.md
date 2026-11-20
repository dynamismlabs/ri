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
- **Menus, popovers and dialogs lift by shadow**, not a border.
- **A secondary button is a quiet fill**, not an outline.

## How it is built

The concepts it came from are kept in `docs/ui-system-concept.html` (open it in a
browser and pick Edge Mac at the top), so the build can be checked
against them.

The look is a trial behind a switch, so classic stays exact until the new one is
complete.

- `src/lib/client/look.tsx` keeps the choice (`classic | edge`) in the browser
  (`ri.client.look`) and marks the document with `data-look="edge"`. It follows
  the same pattern as the theme preference and mounts through `ClientAppearance`.
- Settings, General has **New look (preview)** beside Dark mode.
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
| `segmented` | A switch with one track and a raised thumb (pane tabs, Agents and Recent, Light and Deep, list lanes) | `aria-pressed`, `aria-selected` or `aria-checked` on each option |
| `chip-button`, class `toolbar-button` | A capsule control in a toolbar or filter row, and the deck's status chips. `toolbarButtonClass` adds the class | `aria-pressed`, `data-on`, `toolbar-button-active`, `data-tone="attention"` or `"status"` (keeps its own color), `data-urgency` (Generate New Deck), `data-mode` (the permission chip) |
| `meta`, `meta-item` | The line of facts under a title: plain words with dots between them, no boxes | `data-kind` (status, area, energy, effort, deadline...), `data-urgency="late"` or `"today"` |
| `area-select`, `task-badges`, `task-badge` | Components that join a `meta` line as they are | |
| `deadline-band`, `deadline-head`, `deadline-row`, `deadline-when` | The deck's deadlines: a colored date on a plain row | `data-urgency` (late, today, soon) |
| `review-bar`, `review-bar-title`, `review-action` | The review bar above the chat input, drawn like a second, smaller input | `data-state`, `data-tone`, `data-active` |
| `task-chip`, `task-chip-label` | The task a chat works on, in its header | `data-status` |
| `hud-tools`, `hud-view-button` | The top bar's page tools in one capsule, and Close chat or Open latest chat | `aria-pressed`, `data-variant="close"` |
| `rail-foot`, `new-agent` | The rail's footer rows and its New agent button | |
| `entity-kind`, `entity-kind-label` | "Task · Money" or "Note · Tidewater Coffee" above a task or note title | |
| `properties` | The label and value grid on a task (Status, Deadline, Energy, Effort...) | |
| `header-action` | Continue with agent and Complete at the top of a task | `data-tone="agent"`, `data-state="done"` |
| `task-picker` | The task a note links to, in the note's `meta` line | |
| `callout` | A notice or summary inside a pane (Stream's triage digest): a soft raised panel, no outline | |
| `stream-meta` | The line under a Stream capture | |
| `search-field`, `icon-button` | The phone's search field and the bordered icon buttons beside it | |
| `action-button` | Small hand-built actions. Their size and placement come from the component, their shape and fill from the system | `data-variant="primary"` or `"ghost"`, `data-tone="status"`, `aria-pressed`, `aria-selected` or `aria-checked` |
| `status-strip` | A chat header's git summary and next action, in one quiet capsule | |
| `split-button` | Finder and its menu, one capsule with a divider between the two buttons | |
| `chat-tabs`, `chat-tabs-scroll`, `chat-tab` | The chat strip, its existing measured scroller, and each tab with its close control | `data-current="true"`, `aria-current="page"` on its activation button |
| `row-actions` | Hover actions on task, note and deck rows, also revealed by keyboard focus | `:focus-within` |
| `calendar-toolbar`, `calendar-navigation` | Calendar's existing header and Previous, Today and Next group. View tracks keep their labels while the date text truncates | |
| `settings-nav`, `settings-body` | Settings' shared navigation and content boundary. Neutral bordered sections become soft panels, small bordered actions become capsules, descriptive choices stay rows, and fields stay rectangular | `aria-current="page"` on navigation |
| `choice-row` | A descriptive option in a chooser or Settings, with a soft 8px selection fill | `aria-pressed`, `aria-selected` or `aria-checked` |
| `field` | A hand-built text field, textarea or select outside the shared input components | |
| `status-badge`, `schedule-row` | A schedule's state and its soft row | |
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
outline.

### Shapes

Anything you press is a capsule: buttons, chips, the options of a segmented
control, tabs. Anything that holds content is a rounded rectangle: text fields
(10px, overriding shadcn's capsule input), the chat input (22px), cards and callouts (14px), menus and popovers (12px),
dialogs. List rows take a small 8px radius for their hover and selection. A button
drawn as a rounded rectangle is a leftover, not a variant.

### The area above a title

It reads as words ("Task · Money") and shows it can be changed on hover: a soft
capsule and a chevron. With no area it says "No area" in the faintest text.

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
   Classic retains its source layout and utilities. See
   `docs/ui-system-phase3-audit.md` for the remaining raw bordered-control sweep.
4. **After the preview review (not started).** Copy still in Title Case in shared
   constants ("In Progress", "Priority Order", "Schedules and Triggers") reaches
   tests and the guide. Review the remaining controls and the chat UI gallery in
   both looks, then consider codemods and a lint rule that stops new drift.
   Making Edge the default, removing the switch and moving values into
   `theme.css` all need the owner's decision. Phase 3 does none of those.
