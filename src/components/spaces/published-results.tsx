'use client';

import { Button } from '@/components/system/button';
import { useQuery } from '@tanstack/react-query';
import { Link2, Paperclip } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PublishedResult } from '@/lib/team/published-results';
import { attachmentUrl, bodyWithAttachmentUrls } from '@/lib/attachments/view';
import { trpcClient } from '@/lib/trpc/client';
import { MessageResponse } from '@/components/ai-elements/message';
import { MessageFileChip } from '@/components/chat-ui/artifacts/message-file-chip';
import { parseFileMarkers } from '@/components/chat/editor/parse-file-markers';

function when(iso: string) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Results published to a team task (docs/homes-spec.md §9.5): who shared
 * what, and when. The same list in the team's own app and in My Ri, each
 * reaching the team's files its own way (`fileUrl`).
 */
export function PublishedResultList({
  results,
  fileUrl,
  empty = null,
}: {
  results: PublishedResult[];
  fileUrl: (fileName: string) => string;
  empty?: ReactNode;
}) {
  if (results.length === 0) return <>{empty}</>;
  return (
    <ul className="space-y-3">
      {results.map((result) => (
        <li key={result.id} className="rounded-lg border border-border px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">{result.author?.name ?? 'Someone who left'}</span> published · {when(result.createdAt)}
          </p>
          {result.summary && (
            <div className="mt-1.5 text-[13px]">
              {parseFileMarkers(result.summary, result.attachments).map((segment, index) => segment.kind === 'chip'
                ? <MessageFileChip key={index} variant="block" attachment={segment.attachment} fileUrl={fileUrl} />
                : <MessageResponse key={index} className="text-[13px] [&_li]:text-[13px] [&_p]:text-[13px]">{bodyWithAttachmentUrls(segment.text, fileUrl)}</MessageResponse>)}
            </div>
          )}
          {(result.links.length > 0 || result.attachments.length > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {result.links.map((link) => (
                <Button key={link.url} asChild variant="secondary" size="sm" className="inline-flex max-w-full items-center gap-1"><a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer">
                  <Link2 size={12} aria-hidden />
                  <span className="truncate">{link.label}</span>
                </a></Button>
              ))}
              {result.attachments.map((file) => (
                <Button key={file.fileName} asChild variant="secondary" size="sm" className="inline-flex max-w-full items-center gap-1"><a
                  href={fileUrl(file.fileName)}
                  download={file.originalName}>
                  <Paperclip size={12} aria-hidden />
                  <span className="truncate">{file.originalName}</span>
                  <span className="text-muted-foreground">{size(file.size)}</span>
                </a></Button>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A team task's published results, in the team's own app or its space in My Ri. */
export function TeamPublishedResults({ taskId }: { taskId: string }) {
  const results = useQuery({
    queryKey: ['team', 'published-results', taskId],
    queryFn: () => trpcClient.tasks.publishedResults.query({ taskId }),
  });
  if (!results.data?.length) return null;
  return (
    <section aria-label="Published results" className="space-y-2 border-t border-border pt-4">
      <h2 className="text-xs font-semibold">Published results</h2>
      <PublishedResultList results={results.data} fileUrl={attachmentUrl} />
    </section>
  );
}
