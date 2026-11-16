import { describe, expect, it } from 'vitest';
import { downloadName, fileSizeLabel, MAX_VIEW_DOWNLOAD_BYTES, viewDownload } from './view-download';

const file = (resource: Record<string, unknown>) => [{ type: 'resource', resource }];
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('a file a view hands Ri to save', () => {
  it('takes one text file, named by its URI and typed as the app said', () => {
    // The kit's shape: one embedded resource, named by its URI's last segment.
    const saved = viewDownload(file({ uri: `file:///${encodeURIComponent('Reading list, 2026.csv')}`, mimeType: 'text/csv', text: 'title,author\nKindred,Butler\n' }));
    expect(saved).toMatchObject({ name: 'Reading list, 2026.csv', mimeType: 'text/csv' });
    expect(text(saved.bytes)).toBe('title,author\nKindred,Butler\n');
  });

  it('takes bytes as base64, and refuses damaged base64', () => {
    const saved = viewDownload(file({ uri: 'file:///cover.png', mimeType: 'image/png', blob: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64') }));
    expect([...saved.bytes]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(saved.mimeType).toBe('image/png');
    expect(() => viewDownload(file({ uri: 'file:///x.bin', blob: 'not base64!' }))).toThrow('damaged');
    expect(() => viewDownload(file({ uri: 'file:///x.bin', blob: 'abc' }))).toThrow('damaged');
  });

  it('types a file the app left untyped, or typed with nonsense, by its contents', () => {
    expect(viewDownload(file({ uri: 'file:///notes.txt', text: 'hi' })).mimeType).toBe('text/plain');
    expect(viewDownload(file({ uri: 'file:///data', blob: 'AAAA' })).mimeType).toBe('application/octet-stream');
    expect(viewDownload(file({ uri: 'file:///a.csv', mimeType: 'text/csv; charset=utf-8', text: 'a' })).mimeType).toBe('text/csv');
    expect(viewDownload(file({ uri: 'file:///a.csv', mimeType: '<script>', text: 'a' })).mimeType).toBe('text/plain');
  });

  it('saves only one file the app includes, never a link to one', () => {
    expect(() => viewDownload([])).toThrow('no file');
    expect(() => viewDownload('file:///a.csv')).toThrow('no file');
    expect(() => viewDownload([...file({ uri: 'file:///a.csv', text: 'a' }), ...file({ uri: 'file:///b.csv', text: 'b' })])).toThrow('one file at a time');
    expect(() => viewDownload([{ type: 'resource_link', uri: 'https://example.com/a.csv', name: 'a.csv' }])).toThrow('not a link');
    expect(() => viewDownload([{ type: 'text', text: 'a' }])).toThrow('no file');
    expect(() => viewDownload(file({ uri: 'file:///a.csv' }))).toThrow('no contents');
    expect(() => viewDownload(file({ uri: 'file:///a.csv', text: 'a', blob: 'AAAA' }))).toThrow('no contents');
  });

  it('refuses a file over 12 MiB, as text or as bytes', () => {
    const limit = 16;
    expect(viewDownload(file({ uri: 'file:///a.txt', text: 'x'.repeat(limit) }), limit).bytes.byteLength).toBe(limit);
    expect(() => viewDownload(file({ uri: 'file:///a.txt', text: 'x'.repeat(limit + 1) }), limit)).toThrow('up to');
    // Two-byte characters that fit as UTF-16 but not as UTF-8.
    expect(() => viewDownload(file({ uri: 'file:///a.txt', text: 'é'.repeat(9) }), limit)).toThrow('up to');
    expect(() => viewDownload(file({ uri: 'file:///a.bin', blob: Buffer.alloc(limit + 1).toString('base64') }), limit)).toThrow('up to');
    expect(() => viewDownload(file({ uri: 'file:///a.bin', blob: 'A'.repeat(Math.ceil(MAX_VIEW_DOWNLOAD_BYTES / 3) * 4 + 4) }))).toThrow('up to 12 MiB');
  });
});

describe('the name a file is saved under', () => {
  it('is the last segment of the URI, decoded, whatever the scheme', () => {
    expect(downloadName('file:///exports/books.csv')).toBe('books.csv');
    expect(downloadName(`file:///${encodeURIComponent('Ünïcode 📚.md')}`)).toBe('Ünïcode 📚.md');
    expect(downloadName('https://example.com/a/b/report.pdf?x=1#top')).toBe('report.pdf');
    expect(downloadName('file:///100%.txt')).toBe('100%.txt');
  });

  it('drops path, reserved and control characters, hidden-file dots and direction overrides', () => {
    expect(downloadName(`file:///${encodeURIComponent('../../.ssh/authorized_keys')}`)).toBe('sshauthorized_keys');
    expect(downloadName(`file:///${encodeURIComponent('a:b*c?d"e<f>g|h\\i\u0007j.txt')}`)).toBe('abcdefghij.txt');
    expect(downloadName(`file:///${encodeURIComponent('.bashrc')}`)).toBe('bashrc');
    expect(downloadName(`file:///${encodeURIComponent('invoice‮fdp.exe')}`)).toBe('invoicefdp.exe');
    expect(downloadName(`file:///${encodeURIComponent('report. . .')}`)).toBe('report');
  });

  it('is `download` when nothing of the name is left', () => {
    for (const uri of [undefined, 42, '', 'file:///', `file:///${encodeURIComponent('...')}`, `file:///${encodeURIComponent('/\\:*')}`]) expect(downloadName(uri)).toBe('download');
  });

  it('keeps a short extension when it shortens a long name', () => {
    const long = downloadName(`file:///${'a'.repeat(300)}.csv`);
    expect(long).toHaveLength(120);
    expect(long.endsWith('.csv')).toBe(true);
    expect(Array.from(downloadName(`file:///${encodeURIComponent('📚'.repeat(200))}`))).toHaveLength(120);
  });
});

it('says how large a file is the way people read it', () => {
  expect(fileSizeLabel(1)).toBe('1 byte');
  expect(fileSizeLabel(512)).toBe('512 bytes');
  expect(fileSizeLabel(4300)).toBe('4.2 KB');
  expect(fileSizeLabel(200 * 1024)).toBe('200 KB');
  expect(fileSizeLabel(12 * 1024 * 1024)).toBe('12 MB');
});
