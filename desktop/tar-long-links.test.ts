import { describe, expect, it } from 'vitest';
import * as tar from 'tar';

// tar 7.5.22 applied a pending GNU long-link (K) or PAX linkpath to a header,
// then overwrote it with the header's own linkname field. sqfs2tar writes a
// symlink target of 100 characters or more as a K record followed by a header
// with an empty linkname, so the strict parser rejected every long symlink in
// the Linux AppImage with "linkpath required" (patches/tar@7.5.22.patch).

const TARGET = `../../node_modules/.pnpm/@agentex+agent@0.0.53_patch_hash=${'a'.repeat(64)}/node_modules/@agentex/agent`;

function header(name: string, type: string, size: number, linkname = ''): Buffer {
  const block = Buffer.alloc(512);
  block.write(name, 0, 100, 'utf8');
  block.write('0000777\0', 100, 8, 'ascii');
  block.write('0000000\0', 108, 8, 'ascii');
  block.write('0000000\0', 116, 8, 'ascii');
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  block.write(`${Math.floor(Date.UTC(2026, 10, 20) / 1000).toString(8).padStart(11, '0')}\0`, 136, 12, 'ascii');
  block.write(type, 156, 1, 'ascii');
  block.write(linkname, 157, 100, 'utf8');
  block.write('ustar\0', 257, 6, 'ascii');
  block.write('00', 263, 2, 'ascii');
  block.fill(' ', 148, 156);
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return block;
}

function body(text: string): Buffer {
  const bytes = Buffer.from(text, 'utf8');
  return Buffer.concat([bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512)]);
}

function pax(records: Record<string, string>): string {
  return Object.entries(records).map(([key, value]) => {
    const line = ` ${key}=${value}\n`;
    let length = line.length + 1;
    while (`${length}${line}`.length !== length) length = `${length}${line}`.length;
    return `${length}${line}`;
  }).join('');
}

async function read(archive: Buffer) {
  const entries: { path: string; type: string; linkpath: string }[] = [];
  const parser = new tar.Parser({ strict: true, onReadEntry(entry) { entries.push({ path: entry.path, type: entry.type, linkpath: entry.linkpath ?? '' }); entry.resume(); } });
  await new Promise<void>((resolve, reject) => {
    parser.on('error', reject);
    parser.on('end', resolve);
    parser.end(archive);
  });
  return entries;
}

const end = Buffer.alloc(1024);

describe('tar long symlink targets', () => {
  it('reads a GNU long-link record the way sqfs2tar writes it', async () => {
    const archive = Buffer.concat([
      header('gnu/target0', 'K', Buffer.byteLength(TARGET)),
      body(TARGET),
      header('resources/server/.next-desktop/node_modules/@agentex/agent-fec709fe6accb757', '2', 0, ''),
      end,
    ]);
    expect(await read(archive)).toEqual([
      { path: 'resources/server/.next-desktop/node_modules/@agentex/agent-fec709fe6accb757', type: 'SymbolicLink', linkpath: TARGET },
    ]);
  });

  it('reads a PAX linkpath over the truncated header field', async () => {
    const records = pax({ linkpath: TARGET });
    const archive = Buffer.concat([
      header('PaxHeader/agent', 'x', Buffer.byteLength(records)),
      body(records),
      header('server/node_modules/@agentex/agent', '2', 0, TARGET.slice(0, 100)),
      end,
    ]);
    expect((await read(archive))[0].linkpath).toBe(TARGET);
  });

  it('still reads a short target from the header itself', async () => {
    const archive = Buffer.concat([header('server/bin/ri', '2', 0, '../lib/ri.mjs'), end]);
    expect((await read(archive))[0].linkpath).toBe('../lib/ri.mjs');
  });

  it("doesn't carry a long target over to the next entry", async () => {
    const archive = Buffer.concat([
      header('gnu/target0', 'K', Buffer.byteLength(TARGET)),
      body(TARGET),
      header('server/node_modules/a', '2', 0, ''),
      header('server/node_modules/b', '2', 0, 'short'),
      end,
    ]);
    expect((await read(archive)).map((entry) => entry.linkpath)).toEqual([TARGET, 'short']);
  });
});
