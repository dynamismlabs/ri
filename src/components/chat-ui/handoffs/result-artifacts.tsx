'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ExternalLink, Globe, Loader2, MessageSquare } from 'lucide-react';
import { MessageFileChip } from '@/components/chat-ui/artifacts/message-file-chip';
import { Button } from '@/components/system/button';
import { workResultsApi, type WorkResultFeedbackContext } from '@/lib/api/results';
import { apiErrorText } from '@/lib/api/client';
import { pickReachability, resolvePreviewSrc } from '@/lib/preview/resolve-iframe-src';
import type { WorkResultRecord } from '@/db/types';
import { resultLinkUrl } from './presentation';

export function ResultArtifacts({ result, onFeedback }: { result: WorkResultRecord; onFeedback?: (context: WorkResultFeedbackContext) => void }) {
  const attachments = result.attachments ?? [];
  if (!attachments.length && !result.links.length) return null;
  return (
    <div className="space-y-3">
      {attachments.length > 0 && (
        <div className="flex flex-wrap items-start gap-2" aria-label="Saved files">
          {attachments.map((attachment) => (
            <div key={attachment.fileName} className="min-w-0 max-w-full">
              <MessageFileChip variant="block" attachment={attachment} />
              {onFeedback && (
                <Button
                  onClick={() => onFeedback({ attachmentFileName: attachment.fileName })}
                  variant="ghost"
                  size="xs"
                  className="block"
                >
                  Discuss this file
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {result.links.map((link, index) => link.kind === 'preview' ? (
          <ResultPreview key={`${link.previewTargetId}-${index}`} resultId={result.id} targetId={link.previewTargetId} label={link.label} onFeedback={onFeedback} />
        ) : (
          resultLinkUrl(link.url) ? (
            <Button asChild variant="secondary" size="xs" className="inline-flex items-center gap-1.5"><a key={`${link.url}-${index}`}
              href={resultLinkUrl(link.url)!}
              target="_blank"
              rel="noopener noreferrer">
              <ExternalLink size={12} />{link.label}
            </a></Button>
          ) : <span key={index} className="text-xs text-muted-foreground">{link.label}: unavailable link</span>
        ))}
      </div>
    </div>
  );
}

function ResultPreview({ resultId, targetId, label, onFeedback }: { resultId: string; targetId: string; label: string; onFeedback?: (context: WorkResultFeedbackContext) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [resolved, setResolved] = useState<Awaited<ReturnType<typeof workResultsApi.preview>> | null>(null);
  const state = useQuery({
    queryKey: ['results', resultId, 'preview', targetId],
    queryFn: () => workResultsApi.preview(resultId, targetId),
    enabled: expanded,
    refetchInterval: expanded ? 4_000 : false,
    retry: false,
  });
  const open = useMutation({
    mutationFn: () => workResultsApi.openPreview(resultId, targetId, pickReachability() === 'remote'),
    onSuccess: setResolved,
  });
  const current = resolved ? { ...state.data, ...resolved, serverStatus: state.data?.serverStatus ?? resolved.serverStatus } : state.data ?? null;
  const preview = resolvePreviewSrc(current);
  return (
    <div id={`preview-${targetId}`} className="w-full rounded-lg border text-xs">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <Button
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          variant="ghost"
          size="xs"
          className="flex items-center gap-1.5"
        >
          <Globe size={13} />{label}
        </Button>
        {expanded && <span className="text-muted-foreground">{current?.serverStatus ?? (state.isLoading ? 'Loading' : 'Unavailable')}</span>}
        {onFeedback && <Button
          onClick={() => onFeedback({ previewTargetId: targetId })}
          variant="ghost"
          size="xs"
          className="ml-auto flex items-center gap-1"
        ><MessageSquare size={11} />Discuss preview</Button>}
      </div>
      {expanded && (
        <div className="space-y-2 border-t p-3">
          <p className="text-[11px] text-muted-foreground">Live previews may have changed since this handoff was saved.</p>
          {(state.error || open.error) && <p role="alert" className="text-destructive">{apiErrorText(open.error ?? state.error)}</p>}
          {current?.message && <p className="text-muted-foreground">{current.message}</p>}
          {current?.remoteError && <p className="text-muted-foreground">{current.remoteError.message}</p>}
          {preview.url ? (
            <>
              <a href={preview.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary"><ExternalLink size={12} />Open preview</a>
              <iframe sandbox="allow-scripts allow-forms allow-popups allow-downloads" src={preview.url} title={label} className="h-80 w-full rounded border bg-white" />
            </>
          ) : !state.error && (
            <Button
              onClick={() => open.mutate()}
              disabled={open.isPending || current?.serverStatus === 'starting' || current?.setupStatus === 'running'}
              variant="secondary"
              size="xs"
            >
              {open.isPending && <Loader2 className="animate-spin" />}
              {current?.serverStatus === 'running' ? 'Open on this device' : current?.serverStatus === 'starting' ? 'Starting preview' : 'Start preview'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
