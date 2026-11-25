/**
 * GET /api/sessions/:id/reply-image?path=<as the agent wrote it>
 *
 * The bytes of an image an agent showed in a reply by local path, or opened
 * with a file tool (a Read chip opens it here). What it will serve is decided
 * in `src/lib/sessions/reply-images.ts`: the chat's folder, a path a reply
 * named, or one a file tool call in this chat or its execution named, the
 * file viewer's rule (`named-files.ts`). A team execution keeps to its folder
 * and replies. Served like an uploaded attachment: sandboxed, never sniffed,
 * private to this browser.
 *
 * Auth: bearer token or the session cookie (`src/proxy.ts`), which is what an
 * `<img>` in the transcript sends.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { agentReplyMentions, fileToolCallNamed, getChatSessionWithExecution } from '@/lib/db/queries';
import { executionResourcePolicy } from '@/lib/workspaces/access';
import { findReplyImage } from '@/lib/sessions/reply-images';
import { imageThumbnail, imageVersion } from '@/lib/attachments/image-thumbnail';
import { sessionFileLocation } from '@/lib/sessions/file-location';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const requested = request.nextUrl.searchParams.get('path');
    if (!requested) return Response.json({ error: 'Missing path parameter' }, { status: 400 });

    const session = getChatSessionWithExecution(id);
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });
    // A team Home answers with its policy either way (authority or refusal), a personal one with neither.
    const policy = executionResourcePolicy({ chatId: session.id, operation: 'inspectFiles' });
    const team = !!(policy.authority || policy.refusal);
    const image = await findReplyImage(
      sessionFileLocation(session),
      requested,
      (text) => agentReplyMentions(id, text)
        || (!team && path.isAbsolute(text) && fileToolCallNamed({ sessionId: id, executionId: session.executionId }, path.normalize(text))),
    );
    if (!image.ok) return Response.json({ error: image.error }, { status: image.status });

    const thumbnail = request.nextUrl.searchParams.get('thumbnail') === '1';
    const etag = `"${await imageVersion(image.file, thumbnail)}"`;
    const cacheHeaders = { ETag: etag, 'Cache-Control': 'private, no-cache' };
    if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: cacheHeaders });
    const bytes = thumbnail ? await imageThumbnail(image.file, etag.slice(1, -1)) : await fs.readFile(image.file);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': thumbnail ? 'image/webp' : image.mime,
        'Content-Length': String(bytes.byteLength),
        'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cross-Origin-Resource-Policy': 'same-origin',
        // A screenshot can be retaken under the same name.
        ...cacheHeaders,
      },
    });
  } catch (err) {
    console.error('[GET /api/sessions/:id/reply-image]', err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
