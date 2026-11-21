# UI system: Edge Mac

Ri's design. It keeps every screen's layout as it is and standardizes what the
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
- **Four text levels** (`--t1` to `--t4`): title, body, secondary, faint.
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

Edge Mac is Ri's only look (2026-11-20). The design cut is PR #39,
`edge-mac-default`. The component migration is a separate cut,
`edge-mac-components`, based on that design. It merges after the owner keeps the
design, and each stage stops for review before the next one starts.

- `src/styles/theme.css` owns the palette, typography, surfaces, semantic inks and
  fills, and shadows in `:root` and `.dark`. Dark values work on the root or a
  nested dark surface. There is no Classic palette and no `data-look` attribute.
- `src/app/globals.css` registers product tokens in `@theme inline`: `bg-canvas`,
  `bg-pane`, `bg-raised`, `bg-track`, `bg-selected`, `text-t1` to `text-t4`,
  line colors, and semantic ink/fill pairs. Palette literals belong in the token
  definitions. Existing chart and categorical series colors retain their hues.
- Semantic tones have a theme-aware ink and fill with at least 4.5:1 text contrast:
  attention, danger, success, working, info, Light and Deep energy, permission
  modes, and warning. A tone's base token is its ink and `-fill` is its fill.
  Warning uses `warning-ink` and `warning-fill`. These work offline too, without
  Tailwind's palette variables.
- `APPEARANCE_SCRIPT` (`src/lib/client/appearance-script.ts`) still runs before
  first paint, so a browser that chose light mode never paints a dark frame first.
- `src/styles/edge.css` is temporary compatibility drawing for call sites still
  being migrated. Its unconditional `html:root` anchor preserves selector
  specificity against CSS modules. It has no look switch or look scoping. These
  rules stay unlayered so they keep beating the old Tailwind drawing utilities.
  Each migration stage deletes the rules and hooks its components replace. Stage 1
  retires the chip, toolbar, header, review-action, HUD tools, Send, New agent and
  split-button drawing hooks. Action-button hooks remain on later-stage choices,
  menu rows, descriptive Create choices, calendar event groups and question progress.
- Labels are written in sentence case. The compatibility stylesheet neutralizes
  old `uppercase` utilities and cmdk descendant variants until they are removed.

Desktop local pages use the same tokens and shapes. Setup, connection, recovery,
maintenance, starting, loading, the companion window and find bar load the same
`theme.css`. Buttons are capsules, fields are 10px rectangles, and maintenance
sections are 14px raised callouts with no outline. Their platform font comes from
`--font-sans`, with the bundled Inter asset available only as a fallback after
`system-ui`. Their layout, copy, bridges and actions stay as they were. This is
an intentional stage 0 visual change, approved by the UI reviewer. The packaged
workflow saves local-page render checks for each platform as review artifacts. The app's
screen matrix must remain visually unchanged during the token move.

## Components

Product components live in `src/components/system/`, built on installed shadcn
and Radix primitives in `src/components/ui/`. Stage 0 establishes their tokens. Stage 1 implements the Button family. Stage 2
implements SegmentedControl.
The other APIs below are the remaining migration contracts. Missing installed primitives are added through the shadcn
CLI, with its files and dependency changes checked afterward.

Each component owns shape, size, typography, fill, border, shadow, hover,
selection or pressed state, focus-visible, disabled and invalid styling, and touch
size. Variants use named cva props. Call sites may pass layout classes only:
margin, flex or grid placement, width and min/max width, self, order and position.
They do not pass padding, control height, radius, fill, border, shadow, type size
or state drawing. A component's refs, events, ARIA and children must survive a
migration. Native local-page HTML uses its shared plain-CSS adapter.

| API | Named inputs and state | Drawing and accessibility it owns | Stage |
| --- | --- | --- | --- |
| `Button` | primary, secondary, ghost, destructive, link. xs, sm, md, touch. `icon`, `pressed`, semantic `tone`, `floating`, `focus`, `reveal`, `clip` | Capsule in every state, including Send when disabled. Based on the installed Button. Disabled links cannot activate their child handler | 1, implemented |
| `IconButton` | Required string `label`, tone, pressed state, size. Optional fuller `tooltip`, `shortcut`, `tipSide`, `tipAlign`, `disclosure` | Square Button with an accessible name and `Tip`. `disclosure` adds an owned chevron with enough width for both icons. Uses the label for both by default. Focus outline included | 1, implemented |
| `ChipButton` | neutral, attention, status or mode tone. Status uses a semantic `status` ink, mode uses `PermissionMode`. `label`, optional `iconOnly`, pressed state. Compact or touch, `disclosure` | Toolbar, filter, status and header/action capsules. An attention filter colors its pressed state | 1, implemented |
| `ButtonGroup` | plain, toolbar or joined. Horizontal or vertical | Layout for related actions. Toolbar adds a quiet track and pressed thumb. Joined makes one capsule with a single divider and inset focus for Finder and its menu | 1, implemented |
| `SegmentedControl` | options, value, onChange, tabs or choice mode, compact or touch. Choice supports radio selection and explicit `allowEmpty` | Tabs use tablist, aria-selected and associated panels. Choices use pressed or radio semantics. Keyboard support, measured scrolling and edge fades | 2, implemented |
| `Field`, `TextArea`, `NativeSelect`, `SelectField` | Label, value, description, error, invalid and disabled state. sm, md or touch, with title, code and embedded purposes | Input adapters with 10px corners, owned ids and ARIA, consistent type and one focus treatment. SelectField retains the installed Radix picker | 3, APIs implemented, migration in progress |
| `Card` | Content and layout | Raised 14px content panel | 4 |
| `ChoiceRow` | Title, description and selection | Descriptive 8px row with soft hover and selection | 4 |
| `MenuAction` | Label, action, tone and disabled state | Menu row type, hover and keyboard focus | 4 |
| `Callout`, `StatusBadge` | info, warning, error, success, plus neutral for badges | Semantic ink/fill pairs. 14px content callouts and capsule facts | 4 |
| `Meta`, `MetaItem` | Facts and kind | Plain words, dot separators, semantic ink and wrapping | 4 |
| `Dialog`, `Sheet` | Controlled open state and placement variants | Centered dialogs use 20px corners and a 40% black scrim without blur. Sheets retain their placement. Focus, dismissal, portals and scrolling stay correct | 5 |
| `Popover`, `Menu` | Controlled open state, trigger and content | Floating surfaces over Radix, with keyboard and dismissal behavior | 5 |

### Fields

`Field`, `TextArea` and `NativeSelect` adapt the installed Input and Textarea or
native select. `SelectField` adapts the installed Radix SelectTrigger, preserving
its Root, options, portals and keyboard behavior. This keeps existing rich
pickers intact while giving them the same field drawing.

| Size | Height | Type | Use |
| --- | --- | --- | --- |
| sm | 28px | 13px | Headers, toolbars and filter rows, beside sm buttons |
| md | 32px | 13px | Standalone Settings, dialog and setup forms |
| touch | 40px | 16px | Phone entry, avoiding focus zoom |

An omitted size follows the existing viewport tier: md on a computer and touch
on a phone. A caller choosing a compact row supplies sm on a computer and touch
on a phone, matching its sibling buttons. The control owns its padding.
TextArea uses rows for height, with optional `autoSize`, `maxRows` and vertical
`resize`. It retains native value, selection, form, event and ref behavior.

The three purposes are:

- `title`: editing a title in place. Inline titles follow their heading context
  with a readable minimum. Form titles use 18px, entity titles 24px and document
  titles 40px. Title text areas can grow with the title.
- `code`: commands, paths, model ids and tokens use the platform's monospace font.
- `embedded`: entry within an existing search or composer, including cmdk, with a
  transparent fill and inset focus. The installed engine keeps its own roles,
  ids and root label. `Field asChild` is limited to embedded engines and accepts
  their existing value events on the child. Native fields use Field's label.

`label`, `description` and `error` own their markup and associations. Existing
correct ids can be supplied as `id`, `labelId`, `descriptionId` and `errorId`.
Otherwise Field generates them. Existing described-by references are retained.
An error sets aria-invalid and joins the description. Keep message props in JSX
with conditional values, so their control stays mounted as validation changes.
`descriptionPosition="before"` retains instructions that precede a field.
`orientation="horizontal"` keeps inline labels and allows the row to wrap.
`labelClassName` accepts layout only, such as the email form's shared label width.
`labelAction` keeps a labeled action, such as Copy body, alongside the label.
A `counter` supplies `value` and `max`, with optional existing `id` and `unit`.
It is linked as help and stays out of the control's accessible name.

`leading` and `trailing` make one input group with one focus outline. The date
and repeat parsers use `inlineMessage`, keeping their reading or error inside
the group and linked to the control. Parser feedback keeps its polite live
announcement as text becomes valid or invalid. Each trailing action keeps its own Button
behavior. Disabled controls retain native behavior. Read-only values can still
be focused and copied. Field invalid focus uses the danger ink. Other focus uses
the ring token, with no second shadow or border ring.

Call sites pass layout classes only. `className` places the whole field. When a
label or help spans a wider frame, `controlClassName` sets only the control
layout, such as its width. All three class props follow the same layout-only rule. Field owns shape, type,
padding, fill,
border, shadow and states. Width and placement utilities remain available to
callers. Checkbox, radio and switch controls keep their separate semantics.
Hidden and file transport inputs remain unchanged during this stage.

### Segmented controls

`SegmentedControl` takes `mode`, `value`, `onChange`, `options` and a required
`ariaLabel`. Each option supplies its value and sentence case label, with optional
icon, count, plain or badge count style, semantic count tone, status dot, pulse,
hint or disabled state. `dotPosition="trailing"` keeps a status signal after its label, as on the Stream pane tab. Other status dots default to leading. Working chat badges keep their existing green ink and fill.
Compact tracks are 28px with 24px options. Touch tracks are 40px with 36px options.
Call sites pass layout classes and their existing phone or container state.
`grow` takes available space. `stretch` also distributes options across the track.
Its default is equal widths. `distribution="natural"` keeps each label's intrinsic
width before sharing the extra space, so Apps' library filters keep full labels
on a phone.
`iconOnly` folds labels while preserving names and tooltips.

Use `mode="tabs"` for distinct panels. `SegmentedRoot`, `SegmentedList` and
`SegmentedPanel` let a header and its content keep their existing layout.
A root with one existing native container uses `asChild`, preserving that
container and its parent's child selectors. Choices add no layout wrapper unless
one is explicitly requested with root layout classes. This preserves existing
`space-y` margins and grid boundaries.
Radix owns tab associations, automatic arrow activation, Home and End, and
roving focus. Panels unmount by default. `keepMounted` hides an inactive panel
while retaining its state. `preserveLayout` instead keeps its measured box,
transparent and inert, for previews and file trees.

Use `mode="choice"` for filtering, sorting or setting a value on the same content.
Pressed choices use a group and `aria-pressed`. Arrows move focus, and Space or
Enter chooses. `selection="radio"` preserves radio semantics and arrow selection
where a form already uses them. `allowEmpty` explicitly supports a second press
clearing Energy or Effort. An initially unset radio value may be null without
allowing a selected value to clear on a second press.

The component measures its own scrolling element and track. Fades update when
labels, counts or the available width change. Focus and selection reveal an
option by scrolling this track alone, with an inset focus outline. Parent page
and panel scroll containers stay where they were.

Stream keeps its primary view labels whole. Its toolbar measures the available width, folds Review and Triage to named icon actions first, then folds away the secondary History filter if needed.

File headers measure their available width and move trailing file-manager, editor and connected-app actions into the existing More actions menu before those actions clip. Only when Mode, More and Close still cannot fit do mode labels fold into distinct icons, retaining their names, Tips and selected thumb. This uses measured header width, including beside the tree on a phone. Phone mode options are 36px high. Discard moves into the same menu while editing. The inline and menu presentations share launch state. Connected-app approval stays outside the menu so dismissal cannot discard a pending approval.

### Button size and role

Sizes are chosen by role, with no legacy density variants. These control type,
height, square icon size and horizontal padding. All text uses weight 500.

| Size | Height and square icon button | Text | Horizontal padding | Role |
| --- | --- | --- | --- | --- |
| xs | 24px | 12px | 8px | Inline and row actions, hover actions, actions inside chips and cards, dense metadata controls |
| sm | 28px | 12.5px | 11px | Default for headers, toolbars, filters, the HUD, review bar and composer, including Send |
| md | 32px | 13px | 13px | Page main action, dialog footer, empty-state action, onboarding and setup |
| touch | 40px | 15px | 16px | A phone tier the caller already knows, or pointer-coarse controls. Desktop local pages use this for main buttons |

Chip compact is 28px with 12px text, and touch is 40px with 15px text. Icon buttons
use zero horizontal padding and match their size's height. Prose link actions
inherit their surrounding type and line height. The compact
segmented track is 28px with 24px options, and its touch track is 40px with 36px
options.

Normalizing control dimensions, type and padding is an intentional stage 1
visual change. Placement and layout stay. A new wrap or clipped control is a
regression, including in a 340px pane, at 900px desktop width and on the phone.

Primary is reserved for the one main action in a view, such as Send, Create,
Accept & complete or Start. Git toolbar actions, navigation and auxiliary preview
or export actions use secondary or ghost. Selected filters and independent toggles
use `pressed`, rather than changing to primary. Destructive actions have their own
quiet danger variant.
Icon-only buttons among siblings in a header, toolbar or row are ghost at rest.
A resting fill means pressed or open (`aria-pressed`, `aria-expanded`).
A labeled standalone action may be secondary. Main Send actions retain primary,
and standalone floating controls retain their floating surface.
A lone icon action paired with a filled field matches the field's fill.

The Button family owns its cva classes and drawing in
`src/components/system/button.css`. `Button` is the installed primitive's one
implementation, re-exported by the system entry point. Refs, events, children and
ARIA stay intact. `IconButton` takes its label from the caller's existing accessible
name or tooltip. The phone navigation Create control retains its 48px navigation
drawing until that API migrates. Missing names are reviewed by hand from the action, with sentence
case copy. A tooltip that adds context goes in `tooltip`, and a shortcut goes in
`shortcut`. It does not need a surrounding Tip.
Tip does not open when focus first enters a dialog, sheet or popover from outside.
This keeps the first Escape available to dismiss that layer. Tab inside the layer
still opens a focused control's tooltip. Returning from a nested portaled menu
also keeps that control's tooltip quiet.

`clip` contains a preview or an overlay within the capsule. `focus="inside"`
keeps its outline visible inside that clipping. `floating` gives an
action an opaque floating surface. `reveal` owns hover-only actions, including
keyboard focus, an open menu and devices without hover. The named nav, tag and
fold groups preserve the existing reveal boundaries. Domain wrappers pass their
actual state instead of forwarding opacity, size or palette class strings.

`ToolbarSearchButton` and `ToolbarToggle` are thin uses of IconButton and
ChipButton. The class-returning `toolbarButtonClass` helper is removed. Toolbar
menu triggers render ChipButton with Radix `asChild`, preserving one button.
Floating actions own their pointer interaction over a non-interactive edge shield.
Callers keep their existing flex alignment, including `justify-start` where an
action stretches across a row or grid cell.
Domain helpers forward named size props rather than height or type classes.
Plugins uses touch actions on its existing phone tier, keeping all three full
labels. At 360px its existing wrapping moves New skill beside Add MCP server.
It still uses two 40px rows, with no horizontal overflow. The document chat
bubble also uses its existing phone state for a 40px target. The scroll-to-latest
helper owns its floating surface, shadow and pointer interaction.

The composer keeps its controls on one row. At touch size, the model chip shows
only the model name. Its accessible name and popup retain effort, variant and
speed. When the row is tight, the mode label gives way before the model name
truncates. Mode keeps its accessible name and Tip. Add, mode, model, microphone
and Send remain at least 40px targets at 360px and 390px. The row measures its
actual contents so a missing microphone does not hide mode text unnecessarily.

The stage 1 AST codemod and review ledger live under
`/tmp/ri-ui-codemods/stage1` and `/tmp/ri-ui-components/stage1`. The codemod preserves
refs, events, ARIA and content. The manual audit records labels, conditional tones,
non-main solid actions, inline content, drag handles, menu rows and later-stage
choices. Codemod scripts are kept outside the repository. Component browser checks
cover each variant and semantic tone in both themes, including hover contrast,
pressed and disabled states, focus, touch size, refs and disabled links.

Stage 1 leaves content links and descriptive choices for their content APIs.
Runs, trigger history, check-ins, review summaries, warning handoffs and connector
choices retain their natural height and hierarchy. The phone Create sheet keeps
its two-line choices and vertical icon tiles. These are not fixed-height action
buttons. Completion marks, drag handles and interactive timeline drawings also
retain their existing structure until their own migration. The final native
inventory has 324 button declarations, down from 1,097, with a per-declaration
decision in the review ledger. This includes diagnostic and fixture surfaces.

Until a family migrates, its existing shared hooks below remain the drawing
contract. Do not add a parallel hand-built variant.

### Segmented migration decisions

Core pane tabs, Agents and Recent, agent tools, narrow Chat and Tools or Skill
panes, entity views, skill panels, addition details, pairing addresses, Calendar renderings and app
log sources use tabs with associated panels. Previously hand-built tablists now
have Radix keyboard behavior and one tab stop. Visited preview and chat panels
retain their existing mounting and measured layout.

Chat lenses and the Apps library filters use choice semantics because they
filter one list. They previously used tabs, which announced separate panels and
changed the filter on arrow movement. Arrows now move focus, with Space or Enter
applying the filter. Stream, list lanes, List and Board, file representation,
preview destination and theme, Runs and other filters preserve pressed choices.
Calendar's Show switch changes from pressed buttons to tabs because Calendar,
List and Report each render the whole range as a separate panel. Week and Day
remain a choice. The saved preference keys and setters are unchanged. Calendar's
Refresh action is a ghost icon beside its siblings, using the existing timestamp
tooltip and the shared 28px size.
Settings effort and speed, app permissions and launch isolation preserve radio
semantics and gain radio keyboard behavior. Task Energy and Effort, and Deck
energy, explicitly allow clearing on the second press.

The `segmented`, `segmented-option`, `pane-tab-group`, `pane-tab`, `pane-tab-more`, shadcn tab and
`tool-tab-bar` or `tool-tab-label` compatibility rules are retired. The system
owns their drawing, focus and scrolling. The pane header's frame remains a layout
boundary. Rich file and chat tabs beside a primary track retain their current
content containers until the content migration. Add and Close use IconButton xs,
and Close includes the chat name. All, Add and Close own their inset focus and
ink, with no chat-strip action overrides. More menus use the Button family outside the
tablist. The file header keeps its mode track at its original width beside fixed
actions. The surrounding one-row toolbar keeps its existing layout. A folded menu
chip uses `disclosure` to keep room for its chevron.

The original 54 native declarations were reviewed individually. Task creation's
Energy and Effort dropdown rows and Stream's history menu are MenuAction work in
stage 4. They are not segmented options. These intentional exceptions have named
entries for the file-specific stage 6 lint allowlist:

| Allowlist entry | File | Reason |
| --- | --- | --- |
| `phone-tab-bar-navigation` | `src/components/mobile/mobile-tab-bar.tsx` | Navigation drawing, including the approved 48px Create |
| `question-progress-visualization` | `src/components/chat-ui/questions/question-card.tsx` | Visualization marks that also navigate between questions |
| `draggable-chat-navigation` | `src/components/executions/execution-chat-tabs.tsx`, chat label only | Browser-style chat navigation preserves drag, rename and measured scrolling |

Identity choices and connection-method rows contain descriptions, so they stay
with ChoiceRow in stage 4. They are not tracks.

These names must be carried into the strict stage 6 allowlist. They do not grant
blanket exceptions to the files, and they do not use bare lint disables.

### Shared slots

Use the implemented system components first. These hooks carry families that have not migrated yet. Reuse them before inventing another compatibility rule.

| Slot | What it is | State it reads |
| --- | --- | --- |
| `meta`, `meta-item` | The line of facts under a title: plain words with dots between them, no boxes | `data-kind` (status, area, energy, effort, deadline...), `data-energy` and `data-task-status` select theme-aware inks, `data-urgency="late"` or `"today"` |
| `area-select`, `task-badges`, `task-badge` | Components that join a `meta` line as they are | |
| `deadline-band`, `deadline-head`, `deadline-row`, `deadline-when` | The deck's deadlines: a colored date on a plain row | `data-urgency` (late, today, soon) |
| `review-bar`, `review-bar-title` | The review bar above the chat input, drawn like a second, smaller input | `data-state`, `data-tone`, `data-active` |
| `task-chip`, `task-chip-label` | The task a chat works on, in its header | `data-status` |
| `rail-foot` | The rail's footer rows | |
| `entity-kind`, `entity-kind-label` | "Task · Money" or "Note · Tidewater Coffee" above a task or note title | |
| `properties` | The label and value grid on a task (Status, Deadline, Energy, Effort...) | |
| `task-picker` | The task a note links to, in the note's `meta` line | |
| `callout` | A notice or summary inside a pane (Stream's triage digest): a soft raised panel, no outline | |
| `stream-meta` | The line under a Stream capture | |
| `search-field` | The phone's search field | |
| `action-button` | Small hand-built actions. Their size and placement come from the component, their shape and fill from the system | `data-variant="primary"`, `"ghost"` or `"floating"`, `data-tone="status"` or `"warning"`, `aria-pressed`, `aria-selected` or `aria-checked` |
| `status-strip` | A chat header's git summary and next action, in one quiet capsule | |
| `chat-tabs`, `chat-tabs-scroll`, `chat-tab` | The chat strip, its existing measured scroller, and each tab with its close control | `data-current="true"`, `aria-current="page"` on its activation button |
| `row-actions` | Hover actions on task, note and deck rows, also revealed by keyboard focus | `:focus-within` |
| `calendar-toolbar`, `calendar-navigation`, `calendar-date`, `calendar-spacer`, `calendar-work-toggle` | Calendar's header and date navigation. Below 768px the controls wrap, the date gets its own line and the close action stays at the top right | `data-kind="close"` on the close icon button |
| `work-chain`, `work-chain-step`, `work-chain-arrow` | Calendar's leverage summary. The phone keeps three flexible columns with wrapping labels and narrower connecting arrows | |
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
| `settings-nav-item` | Settings navigation items whose parent owns their drawing | The parent's state contract |
| class `panel-tab` | A tool panel tab outside the segmented control (a file or chat opened beside). `panelTabClass` adds it | `panel-tab-on` |

Two broad rules cover hand-built pieces until each moves onto the shared components:
a hand-built `button` or `a` with `bg-primary` is a capsule, and a hand-built
`.border.bg-card` card loses its outline for a soft shadow (Board cards, Schedules rows).

### Focus

System components own their focus outline in their own stylesheet. Compatibility
hooks still drawn by `edge.css` join its explicit `:focus-visible` list, because
the shared fills and shadows replace inherited box-shadow focus rings. Focus
sits inside a scrolling track so its outline stays visible. `src/styles/edge.browser.test.ts` tabs through the
shared controls in both themes, checks the solid review action's hover contrast, and
checks a narrow lane switch still scrolls where its edge fades look. Phase 3 adds keyboard checks for git actions, split buttons, row actions, Settings fields and choices, Calendar navigation and chat tabs, plus hover contrast and split-button geometry checks in both themes.

Settings' generic bordered-action rules apply only to the remaining native
controls. System options own their drawing, fit their track and retain the
active thumb on hover. Independent pressed toggles in Settings' button groups use the
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

Inside `meta`, status and energy use the shared theme-aware inks. Other colored
facts can retain a component-owned utility through `revert-layer` until Meta
becomes their drawing owner.

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
   The audit kept Effort's existing scrolling behavior. Stage 2 replaces it with
   measured fades that clear at either edge and keep the focused option visible.
7. **Live with it.** Revert while it's young if it isn't right: new code adopts the
   hooks and the lint ratchet, so a revert gets harder with time.
8. **Component migration (separate cut).** Stage 0 moves the one palette into
   `theme.css`, registers the product utilities, removes look scoping and the
   obsolete Classic checks, and brings native local pages onto the same drawing.
   The remaining stages replace hand-built call sites with the APIs above.

## Component migration stages

0. **Tokens and native local pages (implemented).** Shared palette and semantic pairs, registered
   utilities, no look attribute, native controls on the same system. Verify the
   app matrix by pixel diff and render local-page builders in both themes.
1. **Button family (implemented).** Mechanical AST codemod outside the repository, followed by
   manual review of dynamic classes, asChild, drag handles and content rows.
2. **Segmented controls (implemented).** Shared tabs and choices replace every
   track. Panels, nullable values, keyboard navigation, measured scrolling and
   named navigation exceptions follow the decisions above. Retired drawing and
   focus hooks are deleted as their callers migrate.
3. **Fields.** Input, textarea and native select adapters.
4. **Content and feedback.** Cards, descriptive rows, menu actions, callouts,
   badges and metadata.
5. **Overlays.** Dialogs, sheets, popovers and menus, by hand.
6. **Remove scaffolding and lock drift.** Delete redundant compatibility rules and
   hooks. Lint forbids raw interactive elements outside ui/system, drawing
   classes on product components and palette colors outside tone definitions,
   with explicit brand and visualization exceptions. The file-specific legacy
   list is frozen and must only shrink. Keep the tooltip selectors in the same
   shared restriction array.

Commit and push after each stage, then stop for the UI reviewer before continuing.
Each stage includes browser state checks, typecheck, zero lint errors, nearby
tests, updated API documentation and the light/dark desktop/phone visual matrix.

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
options. `SegmentedControl` owns its measured scroller and edge fades.

## Lint ratchet

`eslint.config.mjs` keeps the tooltip and UI restrictions in one shared selector
array. `no-restricted-syntax` catches:

- A raw `button` or `a` outside `src/components/ui/` with both a `border` and a
  `rounded` utility and no explicit `data-slot`. This includes string literals,
  `cn(...)`, conditional branches and template parts. A `ring-border` class alone
  does not count as a border. Classes supplied only through a variable cannot be
  inspected by this syntax rule.
- JSX text containing at least three capital letters and no lowercase letters.
  Write labels in sentence case and remove obsolete `uppercase` utilities when
  migrating their component. Code and
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
appropriate shared hooks and convert actual labels to sentence case, removing obsolete `uppercase` utilities. Keep literal protocol and code names
accurate. Do not add broad directory globs to the list.

`scripts/ui-system-lint.test.ts` exercises the actual ESLint config, including
esquery's `:has()` support, class literals inside `cn`, false positives, installed
primitives and the tooltip rule in legacy files. `src/styles/edge.browser.test.ts`
checks the risky drawing rules with real CSS in Chromium. The long-tail checks
fail with the new rules removed.
