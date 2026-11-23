# Ri UI system

Ri uses one component system in light and dark. Product surfaces import drawing
from `src/components/system/`. Components own fill, border, radius, height,
padding, type, shadows and interaction states. Call sites own layout: alignment,
gaps, widths, margins, positioning, overflow and responsive visibility.

## Foundations

`src/styles/theme.css` defines the palette, platform fonts, semantic ink/fill
pairs and shadows. `src/app/globals.css` registers the tokens with Tailwind,
imports each component's CSS, and owns the document base and scrollbar rules.
Domain drawing lives beside its owning component.

The canvas holds navigation and the top bar. The pane holds work. Columns meet
the window and each other without floating rounded pane frames. Hairlines divide
structural panes. A container (a card, a Settings panel, an empty state, a list
frame, a field) sits on the pane color, white in light and near black in dark,
with a hairline border. Gray fills belong to controls (secondary buttons,
segmented tracks, chips and badges) and to states (hover, selected, pressed),
so gray marks controls, small labels and states, never a box. Plain task,
note and Stream rows stay transparent. User messages keep their inverted
bubble without an added Card frame. Bare connected forms retain their host
layout.

Neutral colors use a low-chroma gray in both themes. `--t1` through `--t4` mean
title, body, secondary and faint. Semantic tones include attention, warning,
danger, success, working, info, energy, permission mode and task status. Their
ink/fill pairs meet 4.5:1 text contrast. Chart and categorical colors keep their
own meanings. User chat bubbles use an inverted neutral fill.

The platform font is SF on Mac and Segoe on Windows, followed by system-ui and
Inter. Labels use sentence case. Hierarchy comes from type, weight and ink,
not tracked capitals. The appearance script applies the saved theme before
first paint. Desktop local pages use the same theme tokens and font fallback.

## Actions

| Component | Drawing and role |
| --- | --- |
| `Button` | primary, secondary, ghost, destructive or link. Named tone, size, pressed, floating, clipping and reveal states |
| `IconButton` | Button drawing with a required accessible label and optional tooltip/shortcut |
| `ChipButton` | Compact filter, toggle or disclosure, with selected state and semantic tone |
| `ButtonGroup` | plain, toolbar or joined, horizontal or vertical |
| `InlineAction` | Text-sized plain action, prose link, reference chip or compact inline control. Optional bubble, dimmed and code states |
| `MenuAction` | Descriptive list action or installed Radix menu item, selected/disabled state, tone, density, separator and optional reveal/muted state |

| Button size | Height | Type | Horizontal padding | Role |
| --- | --- | --- | --- | --- |
| xs | 24px | 12px | 8px | Inline, row, chip and metadata actions |
| sm | 28px | 12.5px | 11px | Headers, toolbars, filters and composer controls |
| md | 32px | 13px | 13px | Main page action, form footer, setup and empty state |
| touch | 40px | 15px | 16px | Phone and coarse-pointer controls |

Icon buttons are square with no horizontal padding. Chip compact is 28px with
12px type, touch is 40px with 15px type. The phone navigation Create remains a
48px navigation target. Content actions may grow with their text.

Primary identifies one main action, such as Send, Create or Start. Auxiliary
navigation, export and toolbar actions use secondary or ghost. Independent
toggles use pressed state. Destructive actions use the quiet danger variant.
Icon-only siblings in a toolbar or row are ghost at rest. Fill indicates pressed
or open. A lone icon beside a filled field matches that field's fill. Labeled
standalone actions may use secondary. Floating actions own their opaque surface.

Window chrome (the top bar and the rail's footer) is one step quieter and
smaller than the work. Its controls use the xs size and rest without a fill.
The fill appears on hover and stays while a control is open or pressed. A
count with a tone (needs you, working) keeps its color, the top bar's icon
group keeps its track, and Create stays primary. A box that holds controls,
like the chat's git bar, is a hairline border on the pane color, so a gray
button never sits on gray. A band across the top or bottom of a frame (who a
chat is working with, a card's action row) is a hairline inside that frame,
never a second card. Chips in the message box stay one text line tall. In a
menu the highlight is the focus mark, with no ring. An embedded field draws no
ring either: the card or menu that holds it shows focus.

The installed Button is the family's single native/Slot implementation.
`ActionPrimitive` shares refs, native events and disabled behavior without
forcing Button drawing onto rich content. Disabled Slot links cannot activate.
`clip` contains a preview, `focus="inside"` keeps focus visible inside it, and
`reveal` owns hover/focus/open/no-hover visibility. Named nav, tag and fold
reveal groups preserve their actual interaction boundaries.

### Space and give-way order

Keep existing one-row toolbars and their fixed actions. In a tight composer,
the mode label gives way before the model name truncates. Touch model chips
show the model name, while the accessible name and popup retain effort, variant
and speed. Add, mode, model, microphone and Send retain 40px phone targets.
Measure the actual row so an absent microphone does not hide mode unnecessarily.

Labels that can truncate keep their accessible name. A chevron capsule above
an entity title identifies its area, or says No area. It remains a control at
rest. Do not turn descriptive choices or rich content into fixed-height buttons.

## Fields and forms

`Field`, `TextArea` and `NativeSelect` own native values, events, refs, labels,
help, errors and disabled/invalid states. `SelectField` supplies the same drawing
to the installed Radix Select, preserving its options, portal and keyboard.

| Field size | Height | Type | Role |
| --- | --- | --- | --- |
| sm | 28px | 13px | A field sharing a row with sm controls |
| md | 32px | 13px | A field on its own row, including beside a passive heading/count |
| touch | 40px | 16px | Phone entry, avoiding focus zoom |

Omitted size is md on desktop and touch on phone. An addon inside a field does
not make that entry a compact toolbar. Deck entry, Plugins search and list
entry rows use the standalone role. Only the reviewed compact control rows
request sm. The source guard follows aliases, size variables and fields passed
in JSX props. TextArea uses rows and optional autoSize, maxRows and vertical
resize, composing refs and editor synchronization.

Purposes are title, code and embedded. Title editing inherits its heading role:
18px form titles, 24px entity titles, 40px document titles on desktop and 16px
on phone. Code uses monospace. Embedded fields integrate an existing search or
composer engine without replacing its roles, ids or value events.

`label`, `description` and `error` generate and associate ids. Existing ids and
described-by references are preserved. Errors set aria-invalid. Keep conditional
messages on a mounted field. `messagePosition` chooses before-label,
before-control or after-control. `errorPosition` can place validation separately.
`orientation="horizontal"`, `labelAction` and counters retain inline form roles.
`className`, `controlClassName` and `labelClassName` accept layout only.

Leading/trailing content makes one compound field with one focus outline.
Parser feedback stays inside it with a polite live announcement. Trailing
controls retain their own Button behavior. A native fieldset disables compound
actions, including under an outer form. Read-only values remain focusable and
copyable. Invalid focus uses danger ink. A field inside a scrolling form keeps
its focus outline inset so it cannot be clipped by the scroller.

Field, FormLabel, ChoiceRow and switch-row titles in one form use the same
13px, weight-500 primary ink. Native file and hidden inputs are transport.
Server-rendered consent checkboxes stay native so consent works before hydration.
Checkbox, Switch and RadioGroup keep their installed semantics.

## Choices and content

`SegmentedControl` uses tabs for different panels, choice for filtering one
list, and radio for one form value. Tabs have associated panels and automatic
arrow-key activation. Choices move focus with arrows and apply with Space or
Enter. Radio choices retain name, FormData and arrow selection. Task Energy,
Task Effort and Deck energy explicitly support clearing on a second press.
Compact tracks are 28px with 24px options, touch tracks 40px with 36px options.
Measured scrolling and edge fades preserve access to overflowing choices.

Pane views, agent tools, Calendar renderings and app log sources use tabs.
Chat lenses, library filters, list lanes, List/Board, file representations,
preview destination, Week/Day and Runs filters use choices. Saved preferences
and visited panel mounting belong to their existing owners. More menus and
Add/Close actions stay outside the tablist.

| Component | Variants and ownership |
| --- | --- |
| `Card` | 14px content frame on the pane color with a hairline border, as element, padding/density, raised (the default frame)/pane/card/track/plain surface, selected, shadow, code, dimmed or dragging state |
| `ChoiceRow` | 8px descriptive option, title/description associations, leading/trailing content, rich children, selection, density and touch minimum |
| `ChoiceGroup`, `ChoiceIndicator` | Installed radio/form keyboard and a decorative selection mark |
| `Callout` | 14px semantic content frame with info/warning/error/success tone |
| `StatusBadge` | Capsule fact with neutral or semantic tone and optional code type |
| `Meta`, `MetaItem` | Wrapping facts, dot separators and semantic ink |

Content type is 13px. Description and metadata are 12px, badges 11px. Choice
and menu rows use soft selection with a 40px coarse-pointer minimum unless
explicitly compact. Compact inline actions use a 24px role with 16px line height
and 4px vertical padding. Whole-card presses retain their native button or link.
`asChild` preserves rich row containers and explicit flex/grid layout. Menu
links forward the actual anchor to Radix, retaining native navigation and dismissal.

## Layers, focus and Escape

Dialog, Sheet, Popover, Menu, AlertDialog, HoverPreview and Tooltip use their
installed Radix engines. Sonner owns toast timing, queues and announcements.
The system owns frame, scrim, type, separators and focus drawing. Engines own
portals, outside dismissal, focus traps, focus return and scroll locks.

Centered dialogs have 20px corners, floating menus/previews 12px, tooltips 10px.
Sheets meet the window without corners. The scrim is 40% black without blur in
both themes. Menus follow trigger width unless a width is supplied. A rail
popover uses its square pane boundary. Automatic sheets keep their installed
640px side breakpoint and 200ms directional presence. Tooltip retains 100ms
exit presence. AlertDialog keeps default/small/wide sizes and section layout.

`DialogContent` and `SheetContent` compose their portal and scrim. Raw
`DialogFrame`, `SheetFrame` and `PopoverFrame` paint an existing positioned
shell without adding a portal or imposing standard width, flex direction or gap.
`placement="custom"` keeps existing geometry. Viewport placement accommodates
Feedback's reduced visual viewport. Search placement and phonePage preserve a
square full-page phone search. Fixed-height chat/document/form/application/
settings/window/search roles live in frame CSS, rather than caller utilities.
Shared padding is none 0, xs 4, compact 6, sm 8, md 12, lg 16 and xl 24px.

`DialogBody` scrolls above a fixed `DialogFooter`. `FormFooterHost` moves only
`FormActions` below a form's scroller. Submit controls retain form ids, native
validation and payloads. Focus order is body then footer. Main actions remain
visible at 360x844 and 390x844. Without a host, actions remain in their standalone
page. Sheet footers retain column layout and full-width actions on desktop and
phone. Dialog sections retain their installed 24px gap.

`OverlaySurface` and `OverlayScrim` paint existing nonmodal/measured engines.
Session previews retain their portal, timers and measured scrolling. App-host
approval retains its protocol and permissions. `MenuSurface` paints editor
suggestions while their renderer, placement, keymaps and lifecycle stay intact.

Each Escape dismisses one layer. A nested menu, popover, sheet, confirmation,
tooltip or editor suggestion consumes the first, then the parent can close.
Tip stays quiet when focus enters a dialog/sheet/popover or returns from a
nested layer. Tab inside can reveal a focused tooltip. Tip belongs between a
menu/popover trigger and its child. It adds information beyond visible text.
Truncating labels use onlyWhenTextHidden. Shortcuts use the shortcut prop.
Icon-only controls still need their own accessible label. DOM title is prohibited.

Schedules uses Dialog's trap, return focus and body lock while preserving list,
detail, Back, scroll containers and builder state. With @ or / suggestions open,
Escape closes only the popup. Without a popup, Escape closes the window even
when ProseMirror prevents the native event. The builder draft survives closing
and reopening the same chat. Custom-root suggestions mount in their nearest
dialog layer and remain clickable and accessible, without a modal-wide opt-out.
Nested sheets do not leave a second scroll lock behind. Imperative confirmation
returns focus to its still-connected opener.

## Strict lint and native boundaries

`eslint.config.mjs` enables `ui-system/native-controls` and
`ui-system/drawing-classes`. There is one allowlist:
`scripts/eslint/ui-system-allowlist.mjs`. Each entry has a stable id, a reason,
a category and its file/owner/attributes. Product entries cap the number of
reviewed native declarations. A new raw button, input, select, textarea or
manual role=dialog outside it is an error, even with a data attribute.

| Category | Retained native role |
| --- | --- |
| primitive | Installed engines and system components implementing native hosts |
| navigation / progress | Phone navigation, draggable chat tabs and question progress |
| visualization | Calendar/event and timeline interaction drawing |
| completion | Task and subtask completion marks |
| drag / tree | Drag handles and file-tree interaction |
| image/color | Image selection, zoom and color controls |
| consent | Server-native OAuth consent |
| transport | File pickers and hidden form values |
| diagnostic / test | Explicit diagnostic screens and isolated native fixtures |

The allowlist is executable documentation of the exact boundaries. It is not a
permission to add another native control elsewhere in an allowed file. Raw
nonmodal recovery and measured-preview dialog roles retain their named reasons.

Drawing utilities on system className are errors, including fill, border,
radius, fixed height, type, shadow, opacity and padding. The rule follows system
import aliases, namespaces, local variables, object properties, cn expressions,
templates, conditional branches and nested JSX. Layout remains available.
Use a named component option for an actual drawing/state need. Installed native
engine primitives remain the implementation boundary. Sentence-case and DOM
title restrictions also apply in diagnostic and primitive files.

`scripts/ui-system-lint.test.ts` runs the actual flat config. It proves an
intended error per rule, clean cases for every allowlisted native role, layout
acceptance and rejection of a surplus declaration. Scratch fixtures validate
the same behavior through the repository CLI and are removed afterward.
