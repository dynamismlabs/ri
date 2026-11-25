import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getChatSessionWithExecution, listChatSessions, listArtifactMessages } from '@/lib/db/queries';
import { messageArtifactPaths, type ArtifactCursor, type ArtifactMessage } from './artifact-messages';
import type { FilePreviewSource } from '@/lib/files/preview-types';

/**
 * How much one request reads. A page fills with files, not messages: the
 * index holds every agent reply, and most share nothing (in a real Home's
 * longest chat, 6 of its newest 2,000 replies and messages carried files),
 * so a page of 50 messages was often empty. A request reads messages in
 * batches until it has `pageItems` files or has read `scanLimit` messages,
 * whichever comes first, so a long history takes a few requests and none
 * reads it all at once. 2,000 messages is about 1 MB of text and a few
 * milliseconds.
 */
export const ARTIFACT_PAGE = { pageItems: 50, batch: 200, scanLimit: 2000 };

/**
 * Files shared in a chat, newest first: attachments on messages and paths an
 * agent's replies point at. `chatOnly` keeps to the chat `sessionId` names;
 * otherwise every chat on its execution that `visible` lets through.
 */
export function listExecutionArtifacts(
  sessionId: string,
  before?: ArtifactCursor,
  visible: (chat: { id: string }) => boolean = () => true,
  { chatOnly = false, ...limits }: { chatOnly?: boolean } & Partial<typeof ARTIFACT_PAGE> = {},
) {
  const { pageItems, batch, scanLimit } = { ...ARTIFACT_PAGE, ...limits };
  const current = getChatSessionWithExecution(sessionId);
  const chats = (current?.executionId && !chatOnly ? listChatSessions({ executionId: current.executionId }) : current ? [current] : []).filter(visible);
  const labels = new Map(chats.map(chat => [chat.id, chat.label ?? 'Untitled chat']));
  const folder = current?.location?.folder ?? current?.worktreePath;

  const items: ReturnType<typeof messageItems>[number][] = [];
  let cursor = before;
  let scanned = 0;
  let more = chats.length > 0;
  while (more && items.length < pageItems && scanned < scanLimit) {
    // Each chat gets its own ordered index walk. An IN over all chats would
    // make SQLite sort their entire histories before applying LIMIT.
    const candidates = chats.flatMap(chat => listArtifactMessages(chat.id, cursor, batch + 1));
    candidates.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const messages = candidates.slice(0, batch);
    for (const message of messages) items.push(...messageItems(message, labels.get(message.sessionId)!, folder));
    scanned += messages.length;
    more = candidates.length > batch;
    const last = messages.at(-1);
    if (last) cursor = { createdAt: last.createdAt, id: last.id };
  }
  return { items, nextCursor: more && cursor ? cursor : null };
}

function messageItems(message: ArtifactMessage, chatLabel: string, folder: string | null | undefined) {
  const provenance = { sessionId: message.sessionId, chatLabel, eventId: message.id, createdAt: message.createdAt };
  const attached = (message.attachments ?? []).map(file => ({
    ...provenance, key: `attachment:${file.fileName}`, name: file.originalName || file.fileName,
    source: { kind: 'attachment', fileName: file.fileName, ...(/^(audio|video)\//.test(file.mimeType) ? { media: file.mimeType.startsWith('audio/') ? 'audio' : 'video' } : {}) } as FilePreviewSource,
    mimeType: file.mimeType as string | null,
  }));
  const shared = message.source === 'agent' ? messageArtifactPaths(message.content ?? '').map(target => {
    let normalized = target;
    try { if (target.startsWith('file://')) normalized = fileURLToPath(target); } catch { /* Keep the original reference for its error view. */ }
    const identity = folder && !normalized.startsWith('~/') ? path.resolve(/* turbopackIgnore: true */ folder, normalized) : path.normalize(normalized);
    return { ...provenance, key: `path:${identity}`, name: normalized.split('/').at(-1) || normalized,
      source: { kind: 'session', sessionId: message.sessionId, path: target } as FilePreviewSource, mimeType: null as string | null };
  }) : [];
  return [...shared, ...attached];
}
