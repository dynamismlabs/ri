import type { Attachment } from '@/db/types';
import type { EntitySegment } from '@/lib/entity-refs/parse-markers';

/**
 * Where a person's files go in their message. Words read as words, so a file
 * is never a large card in the middle of a sentence:
 *
 *   - Pictures and PDFs show once each as thumbnails in a row along the
 *     bottom of the message, in the order the message names them.
 *   - When one sits between words, the position can carry meaning ("these
 *     too? [screenshot]"), so every picture and PDF keeps a text-sized chip
 *     where it was written, one rule for the whole message.
 *   - When they all sit at the start or end (only space or other such files
 *     between them and the edge), the words stand alone above the row. A
 *     chip there would only repeat the thumbnail right below it.
 *
 * Other files have nothing to look at, so they stay a chip wherever they are.
 */
export function showsInStrip(attachment: Pick<Attachment, 'mimeType'>): boolean {
  return attachment.mimeType.startsWith('image/') || attachment.mimeType === 'application/pdf';
}

export function layoutMessageFiles(segments: EntitySegment[], attachments: ReadonlyMap<string, Attachment>): { inline: EntitySegment[]; strip: Attachment[] } {
  const stripFile = (segment: EntitySegment) => {
    if (segment.kind !== 'marker' || segment.marker.kind !== 'file') return null;
    const attachment = attachments.get(segment.marker.fileName);
    return attachment && showsInStrip(attachment) ? attachment : null;
  };
  const strip = [...new Map(segments.flatMap(segment => {
    const attachment = stripFile(segment);
    return attachment ? [[attachment.fileName, attachment] as const] : [];
  })).values()];

  const atEdge = (segment: EntitySegment) => (segment.kind === 'text' && !segment.text.trim()) || !!stripFile(segment);
  let start = 0;
  while (start < segments.length && atEdge(segments[start]!)) start++;
  let end = segments.length;
  while (end > start && atEdge(segments[end - 1]!)) end--;
  const inline = segments.slice(start, end);
  if (inline.some(stripFile)) return { inline: segments, strip };
  // Drop the space a left-out file sat in, so no blank line remains.
  const first = inline[0];
  if (start > 0 && first?.kind === 'text') inline[0] = { kind: 'text', text: first.text.trimStart() };
  const last = inline.at(-1);
  if (end < segments.length && last?.kind === 'text') inline[inline.length - 1] = { kind: 'text', text: last.text.trimEnd() };
  return { inline, strip };
}
