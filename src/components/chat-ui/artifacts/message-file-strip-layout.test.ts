import { describe, expect, it } from 'vitest';
import type { Attachment } from '@/db/types';
import { parseEntitySegments } from '@/lib/entity-refs/parse-markers';
import { layoutMessageFiles, showsInStrip } from './message-file-strip-layout';

const file = (fileName: string, mimeType: string): Attachment => ({ fileName, originalName: fileName, mimeType, size: 1, uploadedAt: '2026-11-24T00:00:00.000Z' });
const files = new Map([
  file('a.png', 'image/png'),
  file('b.jpg', 'image/jpeg'),
  file('c.pdf', 'application/pdf'),
  file('notes.txt', 'text/plain'),
].map(f => [f.fileName, f]));

/** The message as it reads: words as they are, a chip as {name}. */
function layout(content: string) {
  const { inline, strip } = layoutMessageFiles(parseEntitySegments(content), files);
  return {
    text: inline.map(segment => segment.kind === 'text' ? segment.text : `{${segment.marker.kind === 'file' ? segment.marker.fileName : segment.raw}}`).join(''),
    strip: strip.map(f => f.fileName),
  };
}

describe('layoutMessageFiles', () => {
  it('keeps a chip where a picture sits between words and shows it in the row too', () => {
    expect(layout('These buttons feel tight [[file:a.png]] These too? [[file:b.jpg]] Or maybe not')).toEqual({
      text: 'These buttons feel tight {a.png} These too? {b.jpg} Or maybe not',
      strip: ['a.png', 'b.jpg'],
    });
  });

  it('shows a picture at the end only in the row, without the space it sat in', () => {
    expect(layout('Fix the padding\n\n[[file:a.png]]')).toEqual({ text: 'Fix the padding', strip: ['a.png'] });
    expect(layout('Compare these [[file:a.png]] [[file:b.jpg]]\n')).toEqual({ text: 'Compare these', strip: ['a.png', 'b.jpg'] });
  });

  it('shows a picture at the start only in the row', () => {
    expect(layout('[[file:a.png]]\nWhat is wrong here?')).toEqual({ text: 'What is wrong here?', strip: ['a.png'] });
  });

  it('leaves no words when a message is only pictures', () => {
    expect(layout('[[file:a.png]] [[file:c.pdf]]')).toEqual({ text: '', strip: ['a.png', 'c.pdf'] });
  });

  it('keeps every chip when one picture sits between words, even one that ends the message', () => {
    // The message that prompted this: the second screenshot ends it, and
    // leaving out only its chip would read as a missing file.
    expect(layout('Hover background doesn\u2019t feel tall enough [[file:a.png]]\n\nThese too? Or maybe they have a little more [[file:b.jpg]]')).toEqual({
      text: 'Hover background doesn\u2019t feel tall enough {a.png}\n\nThese too? Or maybe they have a little more {b.jpg}',
      strip: ['a.png', 'b.jpg'],
    });
  });

  it('shows a file once in the row, at its first mention', () => {
    expect(layout('[[file:b.jpg]] then [[file:a.png]] and [[file:b.jpg]] again')).toEqual({ text: '{b.jpg} then {a.png} and {b.jpg} again', strip: ['b.jpg', 'a.png'] });
    expect(layout('Twice [[file:a.png]] [[file:a.png]]')).toEqual({ text: 'Twice', strip: ['a.png'] });
  });

  it('keeps a file with nothing to look at as a chip wherever it is', () => {
    expect(layout('Read this [[file:notes.txt]]')).toEqual({ text: 'Read this {notes.txt}', strip: [] });
    // It stands between the picture and the edge, so the picture keeps its chip.
    expect(layout('See [[file:a.png]] [[file:notes.txt]]')).toEqual({ text: 'See {a.png} {notes.txt}', strip: ['a.png'] });
    // It doesn't make a picture at the edge keep one.
    expect(layout('Read [[file:notes.txt]] then look [[file:a.png]]')).toEqual({ text: 'Read {notes.txt} then look', strip: ['a.png'] });
  });

  it('leaves a marker for a file the message lacks as written', () => {
    expect(layout('Lost [[file:gone.png]]')).toEqual({ text: 'Lost {gone.png}', strip: [] });
  });

  it('leaves the words alone when nothing is left out', () => {
    expect(layout('  Indented [[file:a.png]] text  ')).toEqual({ text: '  Indented {a.png} text  ', strip: ['a.png'] });
  });
});

describe('showsInStrip', () => {
  it('takes pictures and PDFs, nothing else', () => {
    expect(showsInStrip({ mimeType: 'image/heic' })).toBe(true);
    expect(showsInStrip({ mimeType: 'application/pdf' })).toBe(true);
    expect(showsInStrip({ mimeType: 'video/mp4' })).toBe(false);
    expect(showsInStrip({ mimeType: 'application/octet-stream' })).toBe(false);
  });
});
