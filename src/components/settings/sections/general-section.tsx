'use client';
import { Card } from '@/components/system/card';
import { ChoiceRow } from '@/components/system/choice-row';

import { NativeSelect } from '@/components/system/native-select';
import { Field } from '@/components/system/field';

import { Button } from '@/components/system/button';
import { DefaultCoordinationSetting } from '@/components/chat-ui/coordination/controls';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { closeSettings } from '@/components/settings/settings-store';
import { DesktopControls } from '../desktop-controls';
import { ApiTransportSettings } from './api-transport';
import { ResultPilotSettings } from '@/components/results/result-pilot-settings';
import { WorkResultGuidanceField } from './work-result-guidance-field';
import { Switch } from '@/components/ui/switch';
import { ThemeSettings } from './theme-settings';
import { useUserState, useUpdateUserState } from '@/hooks/use-user-state';
import { useMorningDeck, useUpdateMorningDeck } from '@/hooks/use-morning-deck';
import { useStreamAutonomy, useSetStreamAutonomy } from '@/hooks/use-stream';
import type { StreamAutomationMode } from '@/lib/api/stream';
import {
  useEditorPreference,
  EDITOR_CHOICE_LABELS,
  EDITOR_CHOICES,
  type EditorChoice,
} from '@/lib/client/editor-preference';
import { useTranscriptDensity, type TranscriptDensity } from '@/lib/client/transcript-density';
import { useDeviceLabelMode, type DeviceLabelMode } from '@/lib/client/device-label-mode';
import { useEntityViewMode, type EntityViewMode } from '@/lib/client/entity-view-mode';
import { useAgentViewMode, type AgentViewMode } from '@/lib/client/agent-view-mode';
import { useAgentChatPlace, type AgentChatPlace } from '@/lib/client/agent-chat-place';
import { useRailStyle, type RailStyle } from '@/lib/client/rail-style';
import { ChatStatusLinesSetting } from '../chat-status-lines-setting';
import { useInactivity, useSetInactiveAfterDays } from '@/hooks/use-inactivity';
import { DEFAULT_INACTIVE_AFTER_DAYS, formatInactiveAfter, INACTIVE_AFTER_PRESETS } from '@/lib/sessions/inactive';

const DEFAULT_START = '09:00';
const DEFAULT_END = '18:00';

/** The single capture-triage control (no per-disposition toggle wall). */
const AUTOMATION_MODES: Array<{ id: StreamAutomationMode; label: string; description: string }> = [
  {
    id: 'handle_obvious',
    label: 'Let it handle the obvious',
    description: 'Applies what you have delegated, suggests the rest. The digest shows everything.',
  },
  {
    id: 'review_everything',
    label: 'Review everything',
    description: 'Triage still runs, but every outcome waits for your call.',
  },
  {
    id: 'manual_only',
    label: 'Manual only',
    description: 'No automatic triage. It runs only when you tap Triage.',
  },
];

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function allTimezones(): string[] {
  try {
    // Intl.supportedValuesOf is available in modern browsers + Node 18+.
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    const zones = fn ? fn('timeZone') : [];
    if (zones.length) return zones;
  } catch {
    // fall through to the minimal list
  }
  return ['UTC', browserTimezone()];
}

/**
 * General preferences: theme, timezone, working hours (the deck's planning
 * window), and display/editor preferences. Theme lives in dashboard context;
 * timezone + working hours persist to user_state; chat density + editor are
 * per-browser (localStorage).
 */
export function GeneralSection() {
  const { data: userState } = useUserState();
  const update = useUpdateUserState();

  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);
  // The saved working hours fill the fields when they load or change. Set
  // while rendering, so the fields never paint the defaults over saved hours.
  const [workdayFrom, setWorkdayFrom] = useState<{ start: string | null; end: string | null } | null>(null);
  if (userState && (userState.workdayStart !== workdayFrom?.start || userState.workdayEnd !== workdayFrom?.end)) {
    setWorkdayFrom({ start: userState.workdayStart, end: userState.workdayEnd });
    setStart(userState.workdayStart ?? DEFAULT_START);
    setEnd(userState.workdayEnd ?? DEFAULT_END);
  }

  const browserTz = useMemo(() => browserTimezone(), []);
  const zones = useMemo(() => allTimezones(), []);
  const effectiveTz = userState?.timezone ?? browserTz;
  const usingBrowserDefault = userState?.timezone == null;
  // Guarantee the effective zone is selectable even if it's not in the list.
  const zoneOptions = useMemo(
    () => (zones.includes(effectiveTz) ? zones : [effectiveTz, ...zones]),
    [zones, effectiveTz],
  );

  const { data: morning } = useMorningDeck();
  const updateMorning = useUpdateMorningDeck();
  const { data: autonomyState } = useStreamAutonomy();
  const setAutonomy = useSetStreamAutonomy();
  const [morningTime, setMorningTime] = useState('04:00');
  // Same for the morning deck's time.
  const [morningTimeFrom, setMorningTimeFrom] = useState<string | null>(null);
  if (morning && morning.time !== morningTimeFrom) {
    setMorningTimeFrom(morning.time);
    setMorningTime(morning.time);
  }
  const morningEnabled = morning?.enabled ?? false;

  const { choice, customCommand, setChoice, setCustomCommand } = useEditorPreference();
  const { density, setDensity } = useTranscriptDensity();
  const { mode: deviceLabelMode, setMode: setDeviceLabelMode } = useDeviceLabelMode();
  const { mode: entityViewMode, setMode: setEntityViewMode } = useEntityViewMode();
  const { mode: agentViewMode, setMode: setAgentViewMode } = useAgentViewMode();
  const { place: agentChatPlace, setPlace: setAgentChatPlace } = useAgentChatPlace();
  const { style: railStyle, setStyle: setRailStyle } = useRailStyle();

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border p-3">
        <h3 className="text-[12px] font-medium">Chat UI gallery</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">Explore interactive chat interfaces and see where each comes from.</p>
        <Link href="/gallery" onClick={closeSettings} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Open gallery</Link>
      </section>
      <DesktopControls />
      <ApiTransportSettings />
      <DefaultCoordinationSetting />
      <ResultPilotSettings />
      <WorkResultGuidanceField />
      <ThemeSettings />

      {/* Timezone */}
      <section className="space-y-2">
        <h3 className="text-[12px] font-medium text-foreground">Timezone</h3>
        <p className="text-[11px] text-muted-foreground/85">
          Used with your working hours to plan the day in your local time.
        </p>
        <Card padding="md" className="flex flex-wrap items-center gap-2">
          <NativeSelect
            value={effectiveTz}
            onChange={(e) => update.mutate({ timezone: e.target.value })}
            className="min-w-0 flex-1"
            aria-label={'Timezone'}
          >
            {zoneOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, ' ')}
              </option>
            ))}
          </NativeSelect>
          {usingBrowserDefault ? (
            <span className="text-[11px] text-muted-foreground/60">Browser default</span>
          ) : (
            <Button
              type="button"
              onClick={() => update.mutate({ timezone: null })}
              variant="ghost"
              size="sm"
            >
              Reset to browser ({browserTz.replace(/_/g, ' ')})
            </Button>
          )}
        </Card>
      </section>

      {/* Working hours */}
      <section className="space-y-2">
        <h3 className="text-[12px] font-medium text-foreground">Working hours</h3>
        <p className="text-[11px] text-muted-foreground/85">
          The window your deck plans around, used to size the day and pace proactive work.
        </p>
        <Card padding="md" className="flex items-center gap-3">
          <TimeField label="Start" value={start} onChange={(v) => { setStart(v); update.mutate({ workdayStart: v }); }} />
          <span className="mt-4 text-muted-foreground">-</span>
          <TimeField label="End" value={end} onChange={(v) => { setEnd(v); update.mutate({ workdayEnd: v }); }} />
        </Card>
      </section>

      {/* Daily deck refresh */}
      <section className="space-y-2">
        <h3 className="text-[12px] font-medium text-foreground">Daily deck refresh</h3>
        <p className="text-[11px] text-muted-foreground/85">
          Prepares tomorrow&apos;s deck overnight so it&apos;s ready before you open the app. Your deck is
          always generated the first time you open it each day regardless.
        </p>
        <Card padding="md" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">Refresh each morning</span>
            <Switch
              checked={morningEnabled}
              onCheckedChange={(next) => updateMorning.mutate({ enabled: next })}
              aria-label="Refresh the deck each morning"
            />
          </div>
          {morningEnabled && (
            <TimeField
              label="Refresh at"
              value={morningTime}
              onChange={(v) => { setMorningTime(v); updateMorning.mutate({ time: v }); }}
            />
          )}
        </Card>
      </section>

      {/* Which device an execution names (presentation trial) */}
      <section className="space-y-2">
        <h3 className="text-[12px] font-medium text-foreground">Where work runs</h3>
        <Card padding="md" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">Show which device runs a chat</span>
            <NativeSelect
              value={deviceLabelMode}
              onChange={(e) => setDeviceLabelMode(e.target.value as DeviceLabelMode)}
              className="w-auto"
              aria-label={'Show which device runs a chat'}
            >
              <option value="away">Only when it runs elsewhere (trial)</option>
              <option value="always">Always</option>
            </NativeSelect>
          </div>
          <p className="text-[11px] text-muted-foreground/85">
            {deviceLabelMode === 'away'
              ? 'Work runs on the computer that hosts Ri unless you pick another device, so only the exception is labeled. Its device is always in its details, and moving it is in its … menu.'
              : 'Every chat names its device once more than one runs agents, including the computer that hosts Ri.'}
          </p>
        </Card>
      </section>

      {/* Stream triage automation */}
      <section className="space-y-2">
        <h3 className="text-[12px] font-medium text-foreground">Capture triage</h3>
        <p className="text-[11px] text-muted-foreground/85">
          How much the assistant handles on its own when you capture thoughts. It earns more
          autonomy over time by asking, and everything it does can be undone in one tap.
        </p>
        <Card padding="md" className="space-y-1">
          {AUTOMATION_MODES.map((m) => (
            <ChoiceRow aria-pressed={autonomyState?.mode === m.id}
              key={m.id}
              onClick={() => setAutonomy.mutate({ mode: m.id })}
              className={`w-full flex items-start gap-2.5 text-left ${""}`}
            >
              <span
                className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                  autonomyState?.mode === m.id ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              />
              <span className="min-w-0">
                <span className="block text-sm text-foreground">{m.label}</span>
                <span className="block text-[11px] text-muted-foreground/85">{m.description}</span>
              </span>
            </ChoiceRow>
          ))}
        </Card>
      </section>

      {/* Chat density */}
      <section className="space-y-2">
        <h3 className="text-[12px] font-medium text-foreground">Chat density</h3>
        <Card padding="md" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">Transcript</span>
            <NativeSelect
              value={density}
              onChange={(e) => setDensity(e.target.value as TranscriptDensity)}
              className="w-auto"
              aria-label={'Transcript'}
            >
              <option value="condensed">Condensed</option>
              <option value="full">Full feed</option>
            </NativeSelect>
          </div>
          <p className="text-[11px] text-muted-foreground/85">
            {density === 'condensed'
              ? 'Completed turns fold their thinking, tool calls, and results into a summary you can expand. Every message the agent wrote to you stays visible, along with the live turn.'
              : 'Every event renders as its own row.'}
          </p>
        </Card>
      </section>

      {/* Notes and tasks (agent-first trial) */}
      <section className="space-y-2">
        <h3 className="text-[12px] font-medium text-foreground">Notes and tasks</h3>
        <Card padding="md" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">Open with</span>
            <NativeSelect
              value={entityViewMode}
              onChange={(e) => setEntityViewMode(e.target.value as EntityViewMode)}
              className="w-auto"
              aria-label={'Open notes and tasks with'}
            >
              <option value="editor">Editor</option>
              <option value="agent">Agent (trial)</option>
            </NativeSelect>
          </div>
          <p className="text-[11px] text-muted-foreground/85">
            {entityViewMode === 'agent'
              ? 'A note or task opens with the agent: a brief of what is in it, then a conversation to read, add, change, or remove. The editor stays one click away, and every agent edit has a diff and undo. Switch back here at any time.'
              : 'The classic editor with the agent in a side panel.'}
          </p>
        </Card>
      </section>

      {/* Agents (agent view trial) */}
      <section className="space-y-2">
        <h3 className="text-[12px] font-medium text-foreground">Agents</h3>
        <Card padding="md" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">Clicking an agent</span>
            <NativeSelect
              value={agentViewMode}
              onChange={(e) => setAgentViewMode(e.target.value as AgentViewMode)}
              className="w-auto"
              aria-label={'Agent view'}
            >
              <option value="view">Opens the agent view (trial)</option>
              <option value="fold">Folds its list</option>
            </NativeSelect>
          </div>
          <p className="text-[11px] text-muted-foreground/85">
            {agentViewMode === 'view'
              ? "Clicking an agent's name in the rail opens its view: its main chat on the left, its work and tools on the right. The chevron still folds its list. Switch back here at any time."
              : "Clicking an agent's name in the rail folds or unfolds its list of chats."}
          </p>
          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2">
            <span className="text-sm text-foreground">Opening a chat from an agent</span>
            <NativeSelect
              value={agentChatPlace}
              onChange={(e) => setAgentChatPlace(e.target.value as AgentChatPlace)}
              className="w-auto"
              aria-label={'Open chats'}
            >
              <option value="beside">Beside its main chat (trial)</option>
              <option value="full">Full view</option>
            </NativeSelect>
          </div>
          <p className="text-[11px] text-muted-foreground/85">
            {agentChatPlace === 'beside'
              ? "A chat you open from an agent's view (a link in its main chat, a row in its Chats tab) opens on the right as one more tab, so you can read and answer it next to the main chat. Full view is one click away for its files, preview and terminal."
              : "A chat you open from an agent's view leaves the agent for that chat's full view, with its files, preview and terminal."}
          </p>
          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2">
            <span className="text-sm text-foreground">Agents in the rail</span>
            <NativeSelect
              value={railStyle}
              onChange={(e) => setRailStyle(e.target.value as RailStyle)}
              className="w-auto"
              aria-label={'Sidebar style'}
            >
              <option value="agentsOnly">Agents only (trial)</option>
              <option value="agents">Agents first (trial)</option>
              <option value="classic">Classic</option>
            </NativeSelect>
          </div>
          <p className="text-[11px] text-muted-foreground/85">
            {railStyle === 'agentsOnly'
              ? "Your agents with no chats under them. Each shows its own state, and counts at its end say how many of its chats need you (amber) or are working (green). Unread under the pins counts the chats waiting on you and shows them when you rest on it, the chats button on an agent opens its chats beside the rail, and Recent lists every chat from the last week. Mark an agent unread from its menu or its chat to come back to it."
              : railStyle === 'agents'
                ? 'Each agent shows what it last said, bold with a dot when it wants you. Its chats hang under it on one line each, all of them, with the inactive ones behind a Show toggle.'
                : 'One line per agent, with every active chat listed under it on two lines.'}
          </p>
          <ChatStatusLinesSetting />
        </Card>
      </section>

      {/* Inactive chats */}
      <InactiveExecutionsSetting />

      {/* Editor */}
      <section className="space-y-2">
        <h3 className="text-[12px] font-medium text-foreground">Editor</h3>
        <Card padding="md" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">Open files in</span>
            <NativeSelect
              value={choice}
              onChange={(e) => setChoice(e.target.value as EditorChoice)}
              className="w-auto"
              aria-label={'Open files in'}
            >
              {EDITOR_CHOICES.map((key) => (
                <option key={key} value={key}>
                  {EDITOR_CHOICE_LABELS[key]}
                </option>
              ))}
            </NativeSelect>
          </div>
          {choice === 'custom' && (
            <Field
              type="text"
              value={customCommand}
              onChange={(e) => setCustomCommand(e.target.value)}
              placeholder="nvim {file}"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="w-full"
              purpose="code"
              aria-label={'Custom editor command'}
            />
          )}
          <p className="text-[11px] text-muted-foreground/85">
            {choice === 'custom'
              ? 'Runs on the host machine. Placeholders: {file}, {line}, {column}, {dir}.'
              : 'Used when you click “Open in editor” on a file or worktree. This preference is saved on this browser.'}
          </p>
        </Card>
      </section>
    </div>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      controlClassName="w-auto"
      label={label}
      className="flex-col w-auto"
    />
  );
}

/**
 * When executions go inactive and fold to the bottom of each list
 * (src/lib/sessions/inactive.ts). The rail's fold rows carry the same
 * choice behind their timer button.
 */
function InactiveExecutionsSetting() {
  const { stored } = useInactivity();
  const set = useSetInactiveAfterDays();
  // null stores the default, so it follows a later change of default.
  const value = stored === undefined ? '' : stored === null ? String(DEFAULT_INACTIVE_AFTER_DAYS) : String(stored);
  const options = stored && stored > 0 && !INACTIVE_AFTER_PRESETS.includes(stored)
    ? [...INACTIVE_AFTER_PRESETS, stored].sort((a, b) => a - b)
    : INACTIVE_AFTER_PRESETS;
  const choose = (raw: string) => {
    const days = Number(raw);
    set.mutate(days === DEFAULT_INACTIVE_AFTER_DAYS ? null : days);
  };
  return (
    <section className="space-y-2">
      <h3 className="text-[12px] font-medium text-foreground">Inactive chats</h3>
      <Card padding="md" className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-foreground">Go inactive after</span>
          <NativeSelect
            value={value}
            disabled={stored === undefined}
            onChange={(e) => choose(e.target.value)}
            className="w-auto"
            aria-label={'Go inactive after'}
          >
            {options.map((days) => (
              <option key={days} value={String(days)}>
                {formatInactiveAfter(days)} with no activity
                {days === DEFAULT_INACTIVE_AFTER_DAYS ? ' (default)' : ''}
              </option>
            ))}
            <option value="0">Never</option>
          </NativeSelect>
        </div>
        <p className="text-[11px] text-muted-foreground/85">
          {stored === 0
            ? 'Every chat stays in its list however long it sits.'
            : 'Chats with no activity for this long fold into an "inactive" row at the bottom of each list, where one click shows them. Pinned ones stay put, marked inactive. Nothing is archived, and new activity brings one back.'}
        </p>
      </Card>
    </section>
  );
}
