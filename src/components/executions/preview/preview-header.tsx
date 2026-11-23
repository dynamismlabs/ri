'use client';
import { StatusBadge } from '@/components/system/status-badge';
import { InlineAction } from '@/components/system/inline-action';

import { Button } from '@/components/system/button';
import { IconButton } from '@/components/system/icon-button';
import { useState } from 'react';
import { Play, Square, RotateCw, ExternalLink, ChevronDown, ChevronUp, Monitor, Globe } from 'lucide-react';
import { Tip } from '@/components/ui/tip';

interface PreviewHeaderProps {
  /** The absolute URL the iframe is loading (loopback or remote), or null. */
  url: string | null;
  /** local (loopback, same machine) vs remote (active provider URL). */
  mode: 'local' | 'remote';
  /** Label for the remote provider (e.g. "Beam") — shown in remote mode. */
  providerLabel: string;
  /** Whether the iframe is currently showing content. */
  isLive: boolean;
  /** True while a Start mutation is in flight. */
  isStarting?: boolean;
  /** True when the server is up / coming up (so Start flips to Stop). */
  isStarted?: boolean;
  /** Disable the Start button (e.g. setup script still installing deps). */
  disableStart?: boolean;
  /** Tooltip explaining why Start is disabled. */
  disableStartReason?: string;
  /** Whether the logs strip is visible. */
  logsOpen?: boolean;
  /** "Open on another device" control — rendered when a preview is live. */
  shareControl?: React.ReactNode;
  /**
   * Process controls. Omit them for an interface-only header: the workbench's
   * Preview tab leaves Start / Stop / Logs to the Run tab.
   */
  onStart?: () => void;
  onStop?: () => void;
  onRefresh: () => void;
  onToggleLogs?: () => void;
}

export function PreviewHeader({
  url,
  mode,
  providerLabel,
  isLive,
  isStarting,
  isStarted,
  disableStart,
  disableStartReason,
  logsOpen,
  shareControl,
  onStart,
  onStop,
  onRefresh,
  onToggleLogs,
}: PreviewHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <div className="flex h-9 items-center gap-1.5 border-b border-border bg-background px-2">
      {!onStart || !onStop ? null : isStarted || isStarting ? (
        <Button
          type="button"
          onClick={onStop}
          disabled={isStarting}
          variant="secondary"
          size="sm"
          className="flex items-center gap-1.5"
        >
          <Square size={12} className="fill-current" />
          Stop
        </Button>
      ) : (
        <Tip label={disableStart ? disableStartReason ?? 'Start unavailable' : undefined}>
          <Button
            type="button"
            onClick={onStart}
            disabled={isStarting || disableStart}
            variant="secondary"
            size="sm"
            className="flex items-center gap-1.5"
          >
            <Play size={12} className="fill-current" />
            Start
          </Button>
        </Tip>
      )}

        <IconButton
          type="button"
          onClick={onRefresh}
          disabled={!isLive}
          label="Reload"
          tooltip="Reload"
          variant="ghost"
          size="sm"
          className="flex items-center justify-center"
        >
          <RotateCw size={13} />
        </IconButton>

      {/* Reachability chip — local loopback vs the active remote provider. */}
      {isLive && (
        <Tip
          label={
            mode === 'local'
              ? 'Local: loopback to the dev server on this machine.'
              : `Remote: reached via ${providerLabel}.`
          }
        >
          <StatusBadge appearance="plain" tone={mode === 'local' ? 'info' : 'success'} className="flex items-center gap-1">
            {mode === 'local' ? <Monitor size={10} /> : <Globe size={10} />}
            {mode === 'local' ? 'Local' : providerLabel}
          </StatusBadge>
        </Tip>
      )}

      {/* URL strip — read-only, click to copy. */}
      <Tip label={copied ? 'Copied!' : url ? 'Click to copy URL' : 'No URL yet'}>
        <InlineAction code
          type="button"
          onClick={handleCopy}
          disabled={!url}
          className="mx-1 flex flex-1 items-center truncate text-left"
        >
          {copied ? 'Copied URL' : url ?? '-'}
        </InlineAction>
      </Tip>

        <IconButton asChild label="Open in new tab" tooltip="Open in new tab" variant="ghost" size="sm" className="flex items-center justify-center"><a href={url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!url}
          onClick={(e) => { if (!url) e.preventDefault(); }}>
          <ExternalLink size={13} />
        </a></IconButton>

      {shareControl}

      {onToggleLogs && (
        <Button
          type="button"
          onClick={onToggleLogs}
          variant="secondary"
          size="sm"
          className="flex items-center gap-1"
        >
          {logsOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          Logs
        </Button>
      )}
    </div>
  );
}
