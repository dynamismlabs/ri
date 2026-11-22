// One allowlist for native owners and reviewed product boundaries. New product controls must use system adapters.
export const uiSystemAllowlist = [
  {
    "id": "installed-primitives",
    "prefix": "src/components/ui/",
    "elements": [
      "button",
      "input",
      "select",
      "textarea",
      "dialog-role"
    ],
    "category": "primitive",
    "reason": "Installed primitives own native hosts and engine semantics."
  },
  {
    "id": "test-fixtures",
    "prefix": "src/test/",
    "elements": [
      "button",
      "input",
      "select",
      "textarea",
      "dialog-role"
    ],
    "category": "test",
    "reason": "Isolated fixtures exercise browser/native behavior."
  },
  {
    "id": "test-tsx",
    "suffix": ".test.tsx",
    "elements": [
      "button",
      "input",
      "select",
      "textarea",
      "dialog-role"
    ],
    "category": "test",
    "reason": "Tests deliberately render minimal native controls."
  },
  {
    "id": "execution-diagnostics",
    "file": "src/app/dev/execution-chat/page.tsx",
    "elements": [
      "button",
      "input",
      "select",
      "textarea",
      "dialog-role"
    ],
    "category": "diagnostic",
    "reason": "Development harness scenarios and reset/inject controls."
  },
  {
    "id": "connector-diagnostics",
    "file": "src/app/integrations-test/page.tsx",
    "elements": [
      "button",
      "input",
      "select",
      "textarea",
      "dialog-role"
    ],
    "category": "diagnostic",
    "reason": "Standalone connector diagnostic controls."
  },
  {
    "id": "native-select-native-host",
    "file": "src/components/system/native-select.tsx",
    "elements": [
      "select"
    ],
    "category": "primitive",
    "reason": "System native-select owns its native host, values and events."
  },
  {
    "id": "segmented-control-native-host",
    "file": "src/components/system/segmented-control.tsx",
    "elements": [
      "button"
    ],
    "category": "primitive",
    "reason": "System segmented-control owns its native host, values and events."
  },
  {
    "id": "hub-consent-HubConsent-input-7",
    "file": "src/app/oauth/authorize/hub-consent.tsx",
    "owner": "HubConsent",
    "elements": [
      "input"
    ],
    "attributes": {
      "type": "hidden"
    },
    "maxMatches": 1,
    "category": "transport",
    "reason": "Native file/hidden form transport, not a product text field."
  },
  {
    "id": "hub-consent-HubConsent-input-8",
    "file": "src/app/oauth/authorize/hub-consent.tsx",
    "owner": "HubConsent",
    "elements": [
      "input"
    ],
    "attributes": {
      "type": "checkbox"
    },
    "maxMatches": 2,
    "category": "consent",
    "reason": "Server-native OAuth consent works before hydration."
  },
  {
    "id": "page-AuthorizePage-input-9",
    "file": "src/app/oauth/authorize/page.tsx",
    "owner": "AuthorizePage",
    "elements": [
      "input"
    ],
    "attributes": {
      "type": "hidden"
    },
    "maxMatches": 1,
    "category": "transport",
    "reason": "Native file/hidden form transport, not a product text field."
  },
  {
    "id": "agent-setup-AgentSetup-input-10",
    "file": "src/components/agents/agent-setup.tsx",
    "owner": "AgentSetup",
    "elements": [
      "input"
    ],
    "attributes": {
      "type": "file"
    },
    "maxMatches": 1,
    "category": "transport",
    "reason": "Native file/hidden form transport, not a product text field."
  },
  {
    "id": "agent-setup-AgentSetup-button-11",
    "file": "src/components/agents/agent-setup.tsx",
    "owner": "AgentSetup",
    "elements": [
      "button"
    ],
    "attributes": {
      "data-slot": "image-picker"
    },
    "maxMatches": 2,
    "category": "image/color",
    "reason": "Image or color swatch keeps the visual preview as its target."
  },
  {
    "id": "split-library-LibraryHeader-input-12",
    "file": "src/components/apps/layout-review/layouts/split-library.tsx",
    "owner": "LibraryHeader",
    "elements": [
      "input"
    ],
    "attributes": {
      "type": "file"
    },
    "maxMatches": 1,
    "category": "transport",
    "reason": "Native file/hidden form transport, not a product text field."
  },
  {
    "id": "auth-recovery-card-AuthRecoveryCard-dialog-role-13",
    "file": "src/components/auth/auth-recovery-card.tsx",
    "owner": "AuthRecoveryCard",
    "elements": [
      "dialog-role"
    ],
    "maxMatches": 1,
    "category": "diagnostic",
    "reason": "Diagnostic/recovery surface retains its existing display engine."
  },
  {
    "id": "all-day-row-AllDayRow-button-14",
    "file": "src/components/calendar/all-day-row.tsx",
    "owner": "AllDayRow",
    "elements": [
      "button"
    ],
    "maxMatches": 1,
    "category": "visualization",
    "reason": "Calendar date, event or proportional time target retains its geometry."
  },
  {
    "id": "day-list-DayList-button-15",
    "file": "src/components/calendar/day-list.tsx",
    "owner": "DayList",
    "elements": [
      "button"
    ],
    "attributes": {
      "data-slot": "calendar-event"
    },
    "maxMatches": 1,
    "category": "visualization",
    "reason": "Calendar date, event or proportional time target retains its geometry."
  },
  {
    "id": "day-list-EventRow-button-16",
    "file": "src/components/calendar/day-list.tsx",
    "owner": "EventRow",
    "elements": [
      "button"
    ],
    "attributes": {
      "data-slot": "calendar-event"
    },
    "maxMatches": 1,
    "category": "visualization",
    "reason": "Calendar date, event or proportional time target retains its geometry."
  },
  {
    "id": "day-shape-strip-DayShapeStrip-button-17",
    "file": "src/components/calendar/day-shape-strip.tsx",
    "owner": "DayShapeStrip",
    "elements": [
      "button"
    ],
    "maxMatches": 1,
    "category": "visualization",
    "reason": "Calendar date, event or proportional time target retains its geometry."
  },
  {
    "id": "day-view-DayView-button-18",
    "file": "src/components/calendar/day-view.tsx",
    "owner": "DayView",
    "elements": [
      "button"
    ],
    "maxMatches": 1,
    "category": "visualization",
    "reason": "Calendar date, event or proportional time target retains its geometry."
  },
  {
    "id": "day-view-EventCard-button-19",
    "file": "src/components/calendar/day-view.tsx",
    "owner": "EventCard",
    "elements": [
      "button"
    ],
    "attributes": {
      "data-slot": "calendar-event"
    },
    "maxMatches": 1,
    "category": "visualization",
    "reason": "Calendar date, event or proportional time target retains its geometry."
  },
  {
    "id": "week-grid-WeekGrid-button-20",
    "file": "src/components/calendar/week-grid.tsx",
    "owner": "WeekGrid",
    "elements": [
      "button"
    ],
    "maxMatches": 2,
    "category": "visualization",
    "reason": "Calendar date, event or proportional time target retains its geometry."
  },
  {
    "id": "week-grid-GridEvent-button-21",
    "file": "src/components/calendar/week-grid.tsx",
    "owner": "GridEvent",
    "elements": [
      "button"
    ],
    "attributes": {
      "data-slot": "calendar-event"
    },
    "maxMatches": 1,
    "category": "visualization",
    "reason": "Calendar date, event or proportional time target retains its geometry."
  },
  {
    "id": "week-view-WeekView-button-22",
    "file": "src/components/calendar/week-view.tsx",
    "owner": "WeekView",
    "elements": [
      "button"
    ],
    "maxMatches": 1,
    "category": "visualization",
    "reason": "Calendar date, event or proportional time target retains its geometry."
  },
  {
    "id": "week-view-WeekView-button-23",
    "file": "src/components/calendar/week-view.tsx",
    "owner": "WeekView",
    "elements": [
      "button"
    ],
    "attributes": {
      "data-slot": "calendar-event"
    },
    "maxMatches": 1,
    "category": "visualization",
    "reason": "Calendar date, event or proportional time target retains its geometry."
  },
  {
    "id": "work-lanes-WorkLaneTrack-button-24",
    "file": "src/components/calendar/work/work-lanes.tsx",
    "owner": "WorkLaneTrack",
    "elements": [
      "button"
    ],
    "maxMatches": 1,
    "category": "visualization",
    "reason": "Calendar date, event or proportional time target retains its geometry."
  },
  {
    "id": "work-ribbon-WorkRibbon-button-25",
    "file": "src/components/calendar/work/work-ribbon.tsx",
    "owner": "WorkRibbon",
    "elements": [
      "button"
    ],
    "maxMatches": 1,
    "category": "visualization",
    "reason": "Calendar date, event or proportional time target retains its geometry."
  },
  {
    "id": "composer-add-menu-ComposerAddMenu-input-26",
    "file": "src/components/chat-ui/add-menu/composer-add-menu.tsx",
    "owner": "ComposerAddMenu",
    "elements": [
      "input"
    ],
    "attributes": {
      "type": "file"
    },
    "maxMatches": 1,
    "category": "transport",
    "reason": "Native file/hidden form transport, not a product text field."
  },
  {
    "id": "question-progress-visualization",
    "file": "src/components/chat-ui/questions/question-card.tsx",
    "owner": "QuestionCard",
    "elements": [
      "button"
    ],
    "maxMatches": 1,
    "category": "progress",
    "reason": "Question progress dots retain their compact position/answer marks."
  },
  {
    "id": "area-create-modal-AreaCreateModal-input-28",
    "file": "src/components/dashboard/area-create-modal.tsx",
    "owner": "AreaCreateModal",
    "elements": [
      "input"
    ],
    "attributes": {
      "type": "file"
    },
    "maxMatches": 1,
    "category": "transport",
    "reason": "Native file/hidden form transport, not a product text field."
  },
  {
    "id": "area-create-modal-AreaCreateModal-button-29",
    "file": "src/components/dashboard/area-create-modal.tsx",
    "owner": "AreaCreateModal",
    "elements": [
      "button"
    ],
    "attributes": {
      "data-slot": "image-picker"
    },
    "maxMatches": 2,
    "category": "image/color",
    "reason": "Image or color swatch keeps the visual preview as its target."
  },
  {
    "id": "area-slideout-AreaSlideout-button-30",
    "file": "src/components/dashboard/area-slideout.tsx",
    "owner": "AreaSlideout",
    "elements": [
      "button"
    ],
    "attributes": {
      "data-slot": "completion-control"
    },
    "maxMatches": 2,
    "category": "completion",
    "reason": "Native task completion circle keeps its compact list geometry."
  },
  {
    "id": "areas-sheet-SortableAreaRow-button-31",
    "file": "src/components/dashboard/areas-sheet.tsx",
    "owner": "SortableAreaRow",
    "elements": [
      "button"
    ],
    "maxMatches": 1,
    "category": "drag",
    "reason": "Drag handle retains dnd-kit attributes/listeners."
  },
  {
    "id": "quick-capture-modal-QuickCaptureModal-input-32",
    "file": "src/components/dashboard/quick-capture-modal.tsx",
    "owner": "QuickCaptureModal",
    "elements": [
      "input"
    ],
    "attributes": {
      "type": "file"
    },
    "maxMatches": 1,
    "category": "transport",
    "reason": "Native file/hidden form transport, not a product text field."
  },
  {
    "id": "plan-routines-PlanRoutines-button-33",
    "file": "src/components/deck/plan-routines.tsx",
    "owner": "PlanRoutines",
    "elements": [
      "button"
    ],
    "attributes": {
      "data-slot": "completion-control"
    },
    "maxMatches": 1,
    "category": "completion",
    "reason": "Native task completion circle keeps its compact list geometry."
  },
  {
    "id": "execution-chat-tabs-ChatTab-button-34",
    "file": "src/components/executions/execution-chat-tabs.tsx",
    "owner": "ChatTab",
    "elements": [
      "button"
    ],
    "maxMatches": 1,
    "category": "drag",
    "reason": "Native draggable chat tab label retains its dnd listeners and nested controls."
  },
  {
    "id": "file-tree-FileTree-input-35",
    "file": "src/components/executions/file-tree/file-tree.tsx",
    "owner": "FileTree",
    "elements": [
      "input"
    ],
    "attributes": {
      "type": "file"
    },
    "maxMatches": 1,
    "category": "transport",
    "reason": "Native file/hidden form transport, not a product text field."
  },
  {
    "id": "tree-entry-row-TreeDirRow-button-36",
    "file": "src/components/executions/file-tree/tree-entry-row.tsx",
    "owner": "TreeDirRow",
    "elements": [
      "button"
    ],
    "maxMatches": 1,
    "category": "tree",
    "reason": "File tree row keeps tree keyboard/selection and nested actions."
  },
  {
    "id": "tree-entry-row-TreeFileRow-button-37",
    "file": "src/components/executions/file-tree/tree-entry-row.tsx",
    "owner": "TreeFileRow",
    "elements": [
      "button"
    ],
    "maxMatches": 1,
    "category": "tree",
    "reason": "File tree row keeps tree keyboard/selection and nested actions."
  },
  {
    "id": "feedback-panel-FeedbackPanel-input-38",
    "file": "src/components/feedback/feedback-panel.tsx",
    "owner": "FeedbackPanel",
    "elements": [
      "input"
    ],
    "attributes": {
      "type": "file"
    },
    "maxMatches": 1,
    "category": "transport",
    "reason": "Native file/hidden form transport, not a product text field."
  },
  {
    "id": "form-fields-AddYourOwn-input-39",
    "file": "src/components/mcp-apps/form/form-fields.tsx",
    "owner": "AddYourOwn",
    "elements": [
      "input"
    ],
    "attributes": {
      "type": "file"
    },
    "maxMatches": 1,
    "category": "transport",
    "reason": "Native file/hidden form transport, not a product text field."
  },
  {
    "id": "phone-tab-bar-navigation",
    "file": "src/components/mobile/mobile-tab-bar.tsx",
    "owner": "HomePhoneBar",
    "elements": [
      "button"
    ],
    "maxMatches": 2,
    "category": "navigation",
    "reason": "Phone navigation and 48px Create retain their navigation geometry."
  },
  {
    "id": "identity-editor-IdentityEditor-input-41",
    "file": "src/components/orchestrator/identity-editor.tsx",
    "owner": "IdentityEditor",
    "elements": [
      "input"
    ],
    "attributes": {
      "type": "file"
    },
    "maxMatches": 1,
    "category": "transport",
    "reason": "Native file/hidden form transport, not a product text field."
  },
  {
    "id": "identity-editor-Swatch-button-42",
    "file": "src/components/orchestrator/identity-editor.tsx",
    "owner": "Swatch",
    "elements": [
      "button"
    ],
    "maxMatches": 1,
    "category": "image/color",
    "reason": "Image or color swatch keeps the visual preview as its target."
  },
  {
    "id": "mcp-tool-display-McpToolDisplay-button-43",
    "file": "src/components/playground/mcp-tool-display.tsx",
    "owner": "McpToolDisplay",
    "elements": [
      "button"
    ],
    "maxMatches": 1,
    "category": "diagnostic",
    "reason": "Diagnostic/recovery surface retains its existing display engine."
  },
  {
    "id": "mcp-tool-display-InnerStepRow-button-44",
    "file": "src/components/playground/mcp-tool-display.tsx",
    "owner": "InnerStepRow",
    "elements": [
      "button"
    ],
    "maxMatches": 1,
    "category": "diagnostic",
    "reason": "Diagnostic/recovery surface retains its existing display engine."
  },
  {
    "id": "skill-files-SkillFiles-input-45",
    "file": "src/components/skills/skill-files.tsx",
    "owner": "SkillFiles",
    "elements": [
      "input"
    ],
    "attributes": {
      "type": "file"
    },
    "maxMatches": 1,
    "category": "transport",
    "reason": "Native file/hidden form transport, not a product text field."
  },
  {
    "id": "publish-result-PublishResultDialog-input-46",
    "file": "src/components/spaces/publish-result.tsx",
    "owner": "PublishResultDialog",
    "elements": [
      "input"
    ],
    "attributes": {
      "type": "file"
    },
    "maxMatches": 1,
    "category": "transport",
    "reason": "Native file/hidden form transport, not a product text field."
  },
  {
    "id": "subtask-section-SubtaskSection-button-47",
    "file": "src/components/tasks/subtask-section.tsx",
    "owner": "SubtaskSection",
    "elements": [
      "button"
    ],
    "attributes": {
      "data-slot": "completion-control"
    },
    "maxMatches": 1,
    "category": "completion",
    "reason": "Native task completion circle keeps its compact list geometry."
  },
  {
    "id": "task-row-TaskRow-button-48",
    "file": "src/components/tasks/task-row.tsx",
    "owner": "TaskRow",
    "elements": [
      "button"
    ],
    "maxMatches": 1,
    "category": "drag",
    "reason": "Drag handle retains dnd-kit attributes/listeners."
  },
  {
    "id": "task-row-TaskRow-button-49",
    "file": "src/components/tasks/task-row.tsx",
    "owner": "TaskRow",
    "elements": [
      "button"
    ],
    "attributes": {
      "data-slot": "completion-control"
    },
    "maxMatches": 1,
    "category": "completion",
    "reason": "Native task completion circle keeps its compact list geometry."
  },
  {
    "id": "team-logo-TeamLogo-input-50",
    "file": "src/components/team/team-logo.tsx",
    "owner": "TeamLogo",
    "elements": [
      "input"
    ],
    "attributes": {
      "type": "file"
    },
    "maxMatches": 1,
    "category": "transport",
    "reason": "Native file/hidden form transport, not a product text field."
  },
  {
    "id": "session-hover-preview-PreviewPortal-dialog-role-51",
    "file": "src/components/workspaces/session-hover-preview.tsx",
    "owner": "PreviewPortal",
    "elements": [
      "dialog-role"
    ],
    "maxMatches": 1,
    "category": "navigation",
    "reason": "Measured nonmodal hover preview retains its portal and hover engine."
  },
  {
    "id": "workspace-create-modal-WorkspaceCreateModal-input-52",
    "file": "src/components/workspaces/workspace-create-modal.tsx",
    "owner": "WorkspaceCreateModal",
    "elements": [
      "input"
    ],
    "attributes": {
      "type": "file"
    },
    "maxMatches": 1,
    "category": "transport",
    "reason": "Native file/hidden form transport, not a product text field."
  }
];
