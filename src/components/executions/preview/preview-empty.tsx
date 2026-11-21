'use client';

import { Button } from '@/components/system/button';
import { IconButton } from '@/components/system/icon-button';
import { useAgentConfigurationScope } from '@/components/workspaces/agent-placement-controls';
import { useEffect, useRef, useState } from 'react';
import { Play, AlertCircle, Pencil, X, Check, Loader2, Settings as SettingsIcon } from 'lucide-react';



interface PreviewEmptyProps {
  variant:
    | 'no-command'        // workspace.startCommand is empty
    | 'idle'              // command set, never started
    | 'starting'          // process spawning
    | 'running-no-port'   // process up but no port detected
    | 'crashed'           // process exited with non-zero
    | 'stopped';          // process exited cleanly after Stop
  command?: string | null;
  exitCode?: number | null;
  exitSignal?: string | null;
  /** Persist a new command string. When provided, the empty state shows
   *  an inline edit affordance — no need to drop into workspace settings
   *  for a one-liner change. */
  onSaveCommand?: (next: string) => Promise<void> | void;
  /** True while the parent's save mutation is in flight. */
  isSavingCommand?: boolean;
  /** Opens the workspace settings sheet — used by the running-no-port
   *  variant so the user can set a port override (not editable inline). */
  onOpenWorkspaceSettings?: () => void;
  onStart?: () => void;
  isStarting?: boolean;
  /** Context-aware label for the primary action, such as "Start with Beamd". */
  startLabel?: string;
  /** Extra content rendered below the status body (e.g. the BYO-URL input). */
  footer?: React.ReactNode;
}

export function PreviewEmpty(props: PreviewEmptyProps) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background px-6 py-10">
      <div className="flex w-full max-w-md flex-col items-start gap-4">
        {renderBody(props)}
        {props.footer && <div className="w-full border-t border-border pt-4">{props.footer}</div>}
      </div>
    </div>
  );
}

function renderBody(props: PreviewEmptyProps) {
  const { variant, command, exitCode, exitSignal, onStart, isStarting } = props;

  if (variant === 'no-command') {
    return (
      <>
        <Heading>No start command set</Heading>
        <Subtle>
          Configure a command to start your dev server. Anything that prints a
          {' '}<code className="rounded bg-muted px-1.5 py-0.5 text-[12px]">localhost:PORT</code>{' '}
          to stdout works: pnpm dev, flask run, cargo run, python -m http.server, you name it.
        </Subtle>
        {props.onSaveCommand && (
          <CommandEditor
            initialValue=""
            startInEditMode
            placeholder="pnpm dev"
            onSave={props.onSaveCommand}
            isSaving={!!props.isSavingCommand}
          />
        )}
      </>
    );
  }

  if (variant === 'idle' || variant === 'stopped') {
    return (
      <>
        <Heading>
          {variant === 'idle' ? 'Ready to preview' : 'Preview stopped'}
        </Heading>
        {props.onSaveCommand ? (
          <CommandEditor
            initialValue={command ?? ''}
            onSave={props.onSaveCommand}
            isSaving={!!props.isSavingCommand}
          />
        ) : (
          command && <CommandReadonly command={command} />
        )}
        {onStart && (
          <Button
            type="button"
            onClick={onStart}
            disabled={isStarting}
            variant="primary"
            size="md"
            className="flex items-center gap-2"
          >
            <Play size={13} className="fill-current" />
            {isStarting ? 'Starting…' : props.startLabel ?? 'Start preview'}
          </Button>
        )}
      </>
    );
  }

  if (variant === 'starting') {
    return (
      <>
        <Heading>Starting preview…</Heading>
        {command && <CommandReadonly command={command} />}
        <Subtle>
          Watching for a localhost port in the output. This usually takes a few seconds.
        </Subtle>
      </>
    );
  }

  if (variant === 'running-no-port') {
    return (
      <>
        <Heading>Process started, no port detected</Heading>
        <Subtle>
          Your command is running but didn&apos;t print a recognizable
          {' '}<code className="rounded bg-muted px-1.5 py-0.5 text-[12px]">localhost:PORT</code>{' '}
          line. Set the port manually in the agent&apos;s setup, then stop and start the preview again.
        </Subtle>
        {command && <CommandReadonly command={command} />}
        {props.onOpenWorkspaceSettings && (
          <Button
            type="button"
            onClick={props.onOpenWorkspaceSettings}
            variant="secondary"
            size="sm"
            className="flex items-center gap-2"
          >
            <SettingsIcon size={13} />
            Open agent setup
          </Button>
        )}
      </>
    );
  }

  // crashed
  return (
    <>
      <Heading>
        <span className="flex items-center gap-2">
          <AlertCircle size={15} className="text-red-400" />
          Preview crashed
        </span>
      </Heading>
      <Subtle>
        The dev server exited
        {typeof exitCode === 'number' ? ` with code ${exitCode}` : ''}
        {exitSignal ? ` (${exitSignal})` : ''}
        . Check the logs below for details, edit the command if needed, then restart.
      </Subtle>
      {props.onSaveCommand ? (
        <CommandEditor
          initialValue={command ?? ''}
          onSave={props.onSaveCommand}
          isSaving={!!props.isSavingCommand}
        />
      ) : (
        command && <CommandReadonly command={command} />
      )}
      {onStart && (
        <Button
          type="button"
          onClick={onStart}
          disabled={isStarting}
          variant="primary"
          size="md"
          className="flex items-center gap-2"
        >
          <Play size={13} className="fill-current" />
          {isStarting ? 'Starting…' : props.startLabel ?? 'Restart'}
        </Button>
      )}
    </>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15px] font-semibold text-foreground">{children}</h3>;
}

function Subtle({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-muted-foreground">{children}</p>;
}

/**
 * Read-only command block — used in transient states (starting, running-
 * no-port) where editing the command in place would be confusing.
 */
function CommandReadonly({ command }: { command: string }) {
  return (
    <pre className="w-full overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-[12px] text-foreground">
      {command}
    </pre>
  );
}

interface CommandEditorProps {
  initialValue: string;
  /** Start expanded into edit mode on first render. Used by the
   *  no-command empty state — the user has no command to read so we
   *  jump straight to the form. */
  startInEditMode?: boolean;
  placeholder?: string;
  onSave: (next: string) => Promise<void> | void;
  isSaving: boolean;
}

/**
 * Compact inline command editor. Display mode shows the command in a
 * pre block with a small pencil affordance; edit mode swaps to a text
 * input with Save / Cancel. Save triggers the parent mutation; while
 * pending the form disables itself with a spinner. On success the
 * parent's status query refreshes and we drop back into display mode
 * (controlled by `isSaving` flipping to false).
 *
 * Keyboard: Enter saves, Escape cancels. The textarea is single-line
 * so Enter doesn't insert a newline.
 */
export function CommandEditor({
  initialValue, startInEditMode, placeholder, onSave, isSaving,
}: CommandEditorProps) {
  const { canConfigure } = useAgentConfigurationScope();
  const [editing, setEditing] = useState(!!startInEditMode);
  const [draft, setDraft] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input when entering edit mode.
  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing]);

  const handleSave = async () => {
    const next = draft.trim();
    // Empty input is only valid for the no-command bootstrap case;
    // otherwise treat empty as cancel to avoid accidental clearing.
    if (!next && !startInEditMode) {
      setEditing(false);
      setDraft(initialValue);
      return;
    }
    if (next === initialValue.trim()) {
      // No-op — just collapse.
      setEditing(false);
      return;
    }
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      // Leave the form open so the user can retry / edit / cancel.
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft(initialValue);
  };

  if (!editing || !canConfigure) {
    return (
      <div className="group relative w-full">
        <pre className="w-full overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 pr-9 font-mono text-[12px] text-foreground">
          {initialValue || <span className="text-muted-foreground/60">{canConfigure ? '(no command set)' : 'An owner can add the start command in agent settings.'}</span>}
        </pre>
        {canConfigure &&
          <IconButton
            type="button"
            onClick={() => {
              setDraft(initialValue);
              setEditing(true);
            }}
            label="Edit command"
            tooltip="Edit command"
            variant="secondary"
            size="sm"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center"
          >
            <Pencil size={12} />
          </IconButton>
        }
      </div>
    );
  }

  return (
    <div className="flex w-full items-stretch gap-1.5">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
          }
        }}
        placeholder={placeholder}
        disabled={isSaving}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
      />

        <IconButton
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          label="Save"
          tooltip="Save"
          shortcut="Enter"
          variant="primary"
          size="md"
          className="inline-flex items-center justify-center"
        >
          {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
        </IconButton>


        <IconButton
          type="button"
          onClick={handleCancel}
          disabled={isSaving}
          label="Cancel"
          tooltip="Cancel"
          shortcut="Esc"
          variant="secondary"
          size="sm"
          className="inline-flex items-center justify-center"
        >
          <X size={13} />
        </IconButton>

    </div>
  );
}
