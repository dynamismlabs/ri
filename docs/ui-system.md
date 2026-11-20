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
- **Controls stay rounded.** Things you press are capsules or 10px rounds. Only the
  frame is square.
- **Four text levels** (`--edge-t1` to `--edge-t4`): title, body, secondary, faint.
  Hierarchy comes from these and from weight, not from boxes.
- **The platform's font.** SF on a Mac, Segoe on Windows, a little tighter than
  Inter, so more fits.
- **Sentence case.** No small tracked capitals for labels.
- **Pane tabs are one segmented control**, the active tab drawn as a lifted thumb.
- **The chat input is white and lifts off the page** with a fine outline and a soft
  shadow. It reads as an input, not a gray box.
- **Your own messages sit in a quiet gray bubble**, not an inverted one.
- **Menus, popovers and dialogs lift by shadow**, not a border.
- **A secondary button is a quiet fill**, not an outline.

## How it is built

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
    inside the dashboard (the user bubble turned white).
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
| `segmented` | A switch with one track and a raised thumb (pane tabs, Agents and Recent, Light and Deep, list lanes) | `aria-pressed` or `aria-selected` on each option |
| `chip-button`, class `toolbar-button` | A capsule control in a toolbar or filter row. `toolbarButtonClass` adds the class | `aria-pressed`, `data-on`, `toolbar-button-active`, `data-tone="attention"`, `data-urgency` (Generate New Deck) |
| `meta`, `meta-item` | The line of facts under a title: plain words with dots between them, no boxes | `data-kind` (status, area, energy, effort, deadline...), `data-urgency="late"` or `"today"` |
| `area-select`, `task-badges`, `task-badge` | Components that join a `meta` line as they are | |
| `deadline-band`, `deadline-head`, `deadline-row`, `deadline-when` | The deck's deadlines: a colored date on a plain row | `data-urgency` (late, today, soon) |
| `review-bar`, `review-bar-title`, `review-action` | The review bar above the chat input, drawn like a second, smaller input | `data-state`, `data-tone`, `data-active` |
| `task-chip`, `task-chip-label` | The task a chat works on, in its header | `data-status` |
| `hud-tools`, `hud-view-button` | The top bar's page tools in one capsule, and Close chat or Open latest chat | `aria-pressed`, `data-variant="close"` |
| `rail-foot`, `new-agent` | The rail's footer rows and its New agent button | |

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
   metadata as plain words, every shadcn Button a capsule.
3. **The long tail, then the switch goes.** Codemods for border opacities, radii and
   hand-built buttons onto the shared components, a lint rule that stops new ones,
   the chat UI gallery checked in both looks. Left from phase 2 on purpose: the
   bordered cards on the Board and in Settings, the git status box in a chat's
   header, the composer's mode chip, and copy still in Title Case in shared
   constants ("In Progress", "Priority Order", "Schedules and Triggers"), which
   reaches tests and the guide. Then Edge becomes the only look, its
   values move into `theme.css`, and `look.tsx`, the setting and this file's trial
   notes are removed.
