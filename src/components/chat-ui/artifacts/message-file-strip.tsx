'use client';

import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Attachment } from '@/db/types';
import { cn } from '@/lib/utils';
import { attachmentUrl } from '@/lib/attachments/view';
import { attachmentPdfUrl } from '@/lib/sessions/reply-pdf';
import { ImagePreviewCard } from './image-preview-card';
import { PdfPreviewCard } from './pdf-preview-card';

type Strip = {
  /** Whether `fileName` has a thumbnail in this message's row. */
  has: (fileName: string) => boolean;
  /** Open the file through its thumbnail, so Previous and Next see it once. */
  open: (fileName: string) => void;
  /** Mark the thumbnail whose chip is under the pointer or focused, or none. */
  point: (fileName: string | null) => void;
};

const StripContext = createContext<Strip | null>(null);

/** The row a chip belongs to, when its message has one. */
export function useMessageFileStrip(): Strip | null {
  return useContext(StripContext);
}

/**
 * A message's words (`children`) and, below them, its pictures and PDFs as a
 * row of thumbnails (`files`, from `layoutMessageFiles`). A chip in the words
 * opens its file through the thumbnail and marks it on hover, so the two read
 * as one file.
 */
export function MessageFileStrip({ files, children }: { files: Attachment[]; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const [pointed, setPointed] = useState<string | null>(null);
  const names = files.map(file => file.fileName).join('\n');
  const strip = useMemo<Strip>(() => {
    const inRow = new Set(names.split('\n'));
    return {
      has: fileName => inRow.has(fileName),
      open: fileName => row.current?.querySelector<HTMLElement>(`[data-strip-file="${CSS.escape(fileName)}"] [data-artifact-card]`)?.click(),
      point: setPointed,
    };
  }, [names]);
  return (
    <StripContext.Provider value={strip}>
      {children}
      {files.length > 0 && (
        <div ref={row} className="flex flex-wrap gap-1.5 not-first:mt-2" aria-label="Attached files">
          {files.map(file => (
            // The marks go around the tile in the message's own text color,
            // which always stands out from the message, whatever the picture:
            // a light ring on hover or while its chip is pointed at, a solid
            // one while its file is open beside the chat.
            <span key={file.fileName} data-strip-file={file.fileName}
              className={cn('inline-flex rounded-[14px] transition-shadow hover:ring-2 hover:ring-current/30 has-[[aria-current=true]]:ring-2 has-[[aria-current=true]]:ring-current', pointed === file.fileName && 'ring-2 ring-current/30')}>
              <StripTile file={file} />
            </span>
          ))}
        </div>
      )}
    </StripContext.Provider>
  );
}

function StripTile({ file }: { file: Attachment }) {
  const name = file.originalName || file.fileName;
  const url = attachmentUrl(file.fileName);
  return file.mimeType === 'application/pdf'
    ? <PdfPreviewCard tile src={attachmentPdfUrl(url, name)} name={name} source={name} />
    : <ImagePreviewCard tile src={url} name={name} />;
}
