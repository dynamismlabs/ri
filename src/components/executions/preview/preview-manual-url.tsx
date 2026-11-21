'use client';

import { IconButton } from '@/components/system/icon-button';
import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, X, Link as LinkIcon } from 'lucide-react';

import type { PreviewManualUrl } from '@/lib/api/preview';


interface PreviewManualUrlProps {
  /** Current manual URLs on the execution (default-service entry is used). */
  urls: PreviewManualUrl[];
  /** Persist the new list. Pass `[]` to clear. */
  onSave: (urls: PreviewManualUrl[]) => Promise<void> | void;
  isSaving?: boolean;
  label?: string;
  description?: string;
}

/**
 * BYO-tunnel input (§6). The user runs their own tunnel (ngrok, cloudflared,
 * …) and pastes the URL; Ri stores it and the ManualProvider serves it.
 * Single default-service URL for now — the data model carries more for
 * multi-service (§10).
 */
export function PreviewManualUrl({
  urls,
  onSave,
  isSaving,
  label = 'Manual preview URL',
  description = 'Running your own tunnel? Paste its URL and Ri will use it for the preview.',
}: PreviewManualUrlProps) {
  const current = urls.find((u) => (u.service ?? null) === null)?.url ?? '';
  const [draft, setDraft] = useState(current);
  const [pending, setPending] = useState(false);
  const previous = useRef(current);

  useEffect(() => {
    const before = previous.current;
    previous.current = current;
    if (pending) return;
    const id = window.setTimeout(() => setDraft(typed => typed.trim() === before ? current : typed), 0);
    return () => window.clearTimeout(id);
  }, [current, pending]);

  useEffect(() => {
    if (isSaving || !pending) return;
    const id = window.setTimeout(() => setPending(false), 0);
    return () => window.clearTimeout(id);
  }, [isSaving, pending]);

  const save = async (next: string) => {
    const url = next.trim();
    setPending(true);
    const others = urls.filter((u) => (u.service ?? null) !== null);
    const list = url ? [...others, { service: null, url, label: null }] : others;
    try {
      await onSave(list);
    } catch {
      setPending(false);
    }
  };

  const dirty = draft.trim() !== current;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <label className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
        <LinkIcon size={12} className="text-muted-foreground" />
        {label}
      </label>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        {description}
      </p>
      <div className="flex w-full items-stretch gap-1.5">
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); save(draft); }
          }}
          placeholder="https://abc.ngrok.app"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />

          <IconButton
            type="button"
            onClick={() => save(draft)}
            disabled={!dirty || isSaving}
            label="Save URL"
            tooltip="Save URL"
            variant="ghost"
            size="md"
            className="inline-flex items-center justify-center"
          >
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </IconButton>

        {current && (
            <IconButton
              type="button"
              onClick={() => { setDraft(''); save(''); }}
              disabled={isSaving}
              label="Clear URL"
              tooltip="Clear URL"
              variant="ghost"
              size="sm"
              className="inline-flex items-center justify-center"
            >
              <X size={13} />
            </IconButton>
        )}
      </div>
    </div>
  );
}
