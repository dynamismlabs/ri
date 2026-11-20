# Phase 3 UI audit

This pass preserves the preview switch and the owner's layouts. It adds drawing
hooks, ARIA state and labels, with every visual change scoped to Edge in
`src/styles/edge.css`. No lint ratchet or default-look change is included.

## What changed

- Chats: git summary and actions, permission and model chips, open-chat strip,
  Finder split control, and task/note/deck hover actions. Permission modes keep
  their existing hue with a readable light or dark shade.
- Calendar: Week/Day and Calendar/List/Report segmented controls, navigation and
  toolbar actions. Event blocks keep their content shape and position.
- Settings: one shared boundary for neutral sections, bordered actions and
  fields, plus navigation and descriptive choice rows. Solid action fills and
  their contrasting text survive hover in both themes.
- Schedules: soft rows, state capsules, rectangular fields and capsule actions.
- Hand-built dialogs: shared dialog drawing for the workstream chooser,
  lifecycle guards, Calendar, task board and entity diff. Small actions in the
  launcher, task creation, scratchpad, tools and preview use the same hooks.
- Tiny tracked-capital labels: readable 11px sentence case where no more specific
  slot already sets a size.

## Raw bordered controls still found

The sweep uses the TypeScript JSX tree to find raw `button` and `a` elements
outside `components/ui` whose class expression contains both `border` and
`rounded`, and which have no slot of their own. It does not treat a source hit
as a visual defect: some belong to a shared parent, some hold content, and some
are controls for the next pass. Locations below are relative to `src/components`.

## Follow-up surfaces

| File | Lines | Reason |
| --- | --- | --- |
| `agents/agent-folders.tsx` | 88 | Lower-frequency surface outside the daily-screen pass |
| `apps/app-library.tsx` | 135 | Lower-frequency surface outside the daily-screen pass |
| `apps/library-chat.tsx` | 62 | Lower-frequency surface outside the daily-screen pass |
| `chat-ui/activity/background-tasks-bar.tsx` | 373 | Separate content UI and gallery review |
| `chat-ui/activity/execution-event.tsx` | 713, 1050, 1140, 1226 | Separate content UI and gallery review |
| `chat-ui/approvals/connection-request-card.tsx` | 334, 414 | Separate content UI and gallery review |
| `chat-ui/approvals/integration-approval-card.tsx` | 288, 367 | Separate content UI and gallery review |
| `chat-ui/artifacts/artifact-preview-parts.tsx` | 72 | Separate content UI and gallery review |
| `chat-ui/artifacts/file-chip.tsx` | 68 | Separate content UI and gallery review |
| `chat-ui/artifacts/file-preview-link.tsx` | 27 | Separate content UI and gallery review |
| `chat-ui/artifacts/message-file-chip.tsx` | 109, 157 | Separate content UI and gallery review |
| `chat-ui/coordination/approval-card.tsx` | 19 | Separate content UI and gallery review |
| `chat-ui/gallery/gallery.tsx` | 74 | Separate content UI and gallery review |
| `chat-ui/gallery/preview.tsx` | 158 | Separate content UI and gallery review |
| `chat-ui/model-menu/model-menu-list.tsx` | 51, 59 | Separate content UI and gallery review |
| `chat-ui/questions/question-card.tsx` | 123, 163 | Separate content UI and gallery review |
| `chat/main-chat-intro.tsx` | 118 | Lower-frequency surface outside the daily-screen pass |
| `chat/onboarding/main-chat-onboarding.tsx` | 666 | Lower-frequency surface outside the daily-screen pass |
| `chat/onboarding/onboarding-apps.tsx` | 179 | Lower-frequency surface outside the daily-screen pass |
| `chat/onboarding/onboarding-areas.tsx` | 114 | Lower-frequency surface outside the daily-screen pass |
| `dashboard/panel-layout.tsx` | 110 | Lower-frequency surface outside the daily-screen pass |
| `dashboard/quick-capture-modal.tsx` | 39 | Lower-frequency surface outside the daily-screen pass |
| `deck/check-in-intake.tsx` | 90 | Lower-frequency surface outside the daily-screen pass |
| `entities/entity-brief-card.tsx` | 210, 241 | Lower-frequency surface outside the daily-screen pass |
| `executions/execution-terminal-panel.tsx` | 210 | Lower-frequency surface outside the daily-screen pass |
| `executions/setup-card.tsx` | 260, 310 | Lower-frequency surface outside the daily-screen pass |
| `executions/transfer/transfer-progress.tsx` | 56 | Lower-frequency surface outside the daily-screen pass |
| `feedback/feedback-trigger.tsx` | 36 | Lower-frequency surface outside the daily-screen pass |
| `heartbeat/heartbeat-settings.tsx` | 125 | Lower-frequency surface outside the daily-screen pass |
| `home/team-home.tsx` | 57 | Lower-frequency surface outside the daily-screen pass |
| `mcp-apps/form/form-fields.tsx` | 113, 134, 142, 215, 252 | Separate content UI and gallery review |
| `mobile/mobile-create-sheet.tsx` | 104 | Lower-frequency surface outside the daily-screen pass |
| `onboarding/harness-setup.tsx` | 306 | Lower-frequency surface outside the daily-screen pass |
| `orchestrator/identity-editor.tsx` | 228, 260 | Lower-frequency surface outside the daily-screen pass |
| `spaces/my-work-control.tsx` | 34, 102 | Lower-frequency surface outside the daily-screen pass |
| `spaces/publish-result.tsx` | 42 | Lower-frequency surface outside the daily-screen pass |
| `spaces/published-results.tsx` | 54, 66 | Lower-frequency surface outside the daily-screen pass |
| `spaces/shared-note-body.tsx` | 57 | Lower-frequency surface outside the daily-screen pass |
| `spaces/space-selector.tsx` | 128 | Lower-frequency surface outside the daily-screen pass |
| `spaces/work-with-personal-agent.tsx` | 17 | Lower-frequency surface outside the daily-screen pass |
| `team/shared-body-editor.tsx` | 227 | Lower-frequency surface outside the daily-screen pass |
| `team/team-address-setup.tsx` | 84, 117, 118, 119, 125, 126 | Lower-frequency surface outside the daily-screen pass |
| `team/team-areas.tsx` | 58 | Lower-frequency surface outside the daily-screen pass |
| `team/team-chat.tsx` | 43 | Lower-frequency surface outside the daily-screen pass |
| `team/team-logo.tsx` | 54 | Lower-frequency surface outside the daily-screen pass |
| `team/team-orchestrator-chat.tsx` | 27 | Lower-frequency surface outside the daily-screen pass |
| `team/team-rail-footer.tsx` | 24 | Lower-frequency surface outside the daily-screen pass |
| `team/team-task-agent-action.tsx` | 43 | Lower-frequency surface outside the daily-screen pass |
| `workspaces/workspace-picker.tsx` | 31 | Lower-frequency surface outside the daily-screen pass |

## Already covered by shared rules

| File | Lines | Reason |
| --- | --- | --- |
| `ai-elements/entity-reference.tsx` | 159, 213, 280, 352 | Existing shared parent or soft-card rule |
| `board/agent-activity-board.tsx` | 92 | Existing shared parent or soft-card rule |
| `dashboard/top-hud.tsx` | 107 | Existing shared parent or soft-card rule |
| `executions/open-worktree-button.tsx` | 267, 291 | Existing shared parent or soft-card rule |
| `settings/beamd-connect.tsx` | 137, 147, 170, 179, 200, 272 | Shared Settings boundary or segmented/row slot |
| `settings/default-selection-editor.tsx` | 103, 128 | Shared Settings boundary or segmented/row slot |
| `settings/harness-connection-ui.tsx` | 209 | Shared Settings boundary or segmented/row slot |
| `settings/model-list.tsx` | 78 | Shared Settings boundary or segmented/row slot |
| `settings/preview-settings-panel.tsx` | 92 | Shared Settings boundary or segmented/row slot |
| `settings/sections/browser-section.tsx` | 249 | Shared Settings boundary or segmented/row slot |
| `settings/sections/integrations/parts.tsx` | 106 | Shared Settings boundary or segmented/row slot |
| `settings/sections/notifications-section.tsx` | 435, 466, 585 | Shared Settings boundary or segmented/row slot |
| `settings/sections/remote-preview-section.tsx` | 36 | Shared Settings boundary or segmented/row slot |
| `settings/sections/voice-section.tsx` | 190, 213 | Shared Settings boundary or segmented/row slot |
| `settings/settings-nav.tsx` | 65 | Shared Settings boundary or segmented/row slot |
| `workspaces/rail-footer.tsx` | 105, 115 | Existing shared parent or soft-card rule |
| `workspaces/rail-list.tsx` | 186 | Existing shared parent or soft-card rule |

## Deliberately kept as content or a specialized affordance

| File | Lines | Reason |
| --- | --- | --- |
| `agents/agent-setup.tsx` | 286, 305 | Completion or selection affordance, content tile, image picker or menu row. Keep its content shape |
| `calendar/day-list.tsx` | 83, 137, 165 | Completion or selection affordance, content tile, image picker or menu row. Keep its content shape |
| `calendar/day-view.tsx` | 148, 190 | Completion or selection affordance, content tile, image picker or menu row. Keep its content shape |
| `calendar/week-grid.tsx` | 133, 194, 234 | Completion or selection affordance, content tile, image picker or menu row. Keep its content shape |
| `calendar/week-view.tsx` | 109, 124 | Completion or selection affordance, content tile, image picker or menu row. Keep its content shape |
| `chat-ui/messages/voice-sent-badge.tsx` | 54 | Completion or selection affordance, content tile, image picker or menu row. Keep its content shape |
| `dashboard/area-create-modal.tsx` | 170, 199 | Completion or selection affordance, content tile, image picker or menu row. Keep its content shape |
| `dashboard/area-slideout.tsx` | 429 | Completion or selection affordance, content tile, image picker or menu row. Keep its content shape |
| `deck/plan-routines.tsx` | 32 | Completion or selection affordance, content tile, image picker or menu row. Keep its content shape |
| `tasks/subtask-section.tsx` | 131 | Completion or selection affordance, content tile, image picker or menu row. Keep its content shape |
| `tasks/task-recurrence-picker.tsx` | 137 | Completion or selection affordance, content tile, image picker or menu row. Keep its content shape |
| `tasks/task-row.tsx` | 219 | Completion or selection affordance, content tile, image picker or menu row. Keep its content shape |
| `workspaces/launcher/launch-controls.tsx` | 240 | Completion or selection affordance, content tile, image picker or menu row. Keep its content shape |

## Remaining decisions

The chat UI gallery and lower-frequency surfaces above still need a dedicated
visual review. Shared Title Case copy needs a coordinated source, test and guide
pass. Any lint ratchet, default change or removal of the preview switch stays
with the owner after review.
