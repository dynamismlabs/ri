import type { Attachment } from "@/db/types";

/**
 * What apps put into a chat's composer, kept in this browser until the target
 * composer loads.
 *
 * Connected MCP apps write OpenAI's extended `ui/message`
 * (`requestAppChatMessage`): ordinary text, titled items the person can
 * remove as a unit, and files. `requestAppChatDraft` puts plain text there
 * the same way. Either way it is a draft, and the person sends it
 * (docs/connected-mcp-apps.md, "Messages").
 */
export type AppDraftPart =
  | { type: "text"; text: string }
  | { type: "snippet"; title: string; text: string }
  | { type: "file"; attachment: Attachment };
export interface AppChatMessage {
  parts: AppDraftPart[];
}
/** What happened to a message: put in the draft, or waiting for its composer. */
export type AppChatDelivery = "drafted" | "queued";
export interface AppChatComposerHandlers {
  /** Appends parts to the draft: text, titled items and file chips. */
  appendParts?(parts: AppDraftPart[]): void;
}

/**
 * App text with any source marker (`[[source:…]]`) broken, so the person's
 * send never binds one of their accounts because an app wrote it: only the
 * person chooses sources. Brackets before `source:` become `(`, so two parts
 * side by side can't make one either.
 */
export const withoutSourceMarkers = (text: string) => text.replace(/\[+(?=source:)/g, "(");

type Request = { at: number } & ({ text: string } | { message: AppChatMessage });
type Composer = { append: (text: string) => void } & AppChatComposerHandlers;
const pending = new Map<string, Request[]>();
const composers = new Map<string, Composer>();
/** A plain question waits a minute for a chat that is still opening, then lapses. */
const QUEUE_MS = 60_000;

/**
 * An app's message waiting for its chat's composer is kept in this browser, as the person's own
 * draft is, so a reload before they open that chat doesn't lose it: Ri has told them it's there.
 * At most 10 per chat and 20 chats, the oldest going first.
 */
const STORED_KEY = "ri.app-chat-messages.v1";
const MAX_STORED_CHATS = 20;
type Stored = Record<string, { at: number; message: AppChatMessage }[]>;
function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
function readStored(): Stored {
  try {
    const value = JSON.parse(storage()?.getItem(STORED_KEY) ?? "{}") as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Stored) : {};
  } catch {
    return {};
  }
}
function writeStored(stored: Stored) {
  try {
    const chats = Object.entries(stored).filter(([, messages]) => messages.length);
    const kept = chats.sort(([, a], [, b]) => (b.at(-1)?.at ?? 0) - (a.at(-1)?.at ?? 0)).slice(0, MAX_STORED_CHATS);
    if (kept.length) storage()?.setItem(STORED_KEY, JSON.stringify(Object.fromEntries(kept)));
    else storage()?.removeItem(STORED_KEY);
  } catch {
    // Storage full or off: the message still waits in this tab.
  }
}
/** Keep a message for a chat, and whether it was kept beyond this tab. */
function store(chatId: string, message: AppChatMessage): boolean {
  if (!storage()) return false;
  const stored = readStored();
  stored[chatId] = [...(stored[chatId] ?? []).slice(-9), { at: Date.now(), message }];
  writeStored(stored);
  return readStored()[chatId]?.some((item) => JSON.stringify(item.message) === JSON.stringify(message)) ?? false;
}
/** The messages kept for a chat, taken: each goes into a composer once. */
function takeStored(chatId: string): AppChatMessage[] {
  const stored = readStored();
  const messages = stored[chatId] ?? [];
  if (!messages.length) return [];
  delete stored[chatId];
  writeStored(stored);
  return messages.map((item) => item.message);
}

/** The text of parts, for a composer that takes only text. A titled item is its text. */
export function appPartsText(parts: readonly AppDraftPart[]): string {
  return parts
    .flatMap((part) => (part.type === "file" ? [] : [part.text]))
    .join(" ")
    .trim();
}

/**
 * Parts as one message: titled items become their text and files their
 * `[[file:<name>]]` markers, in order, as the composer serializes chips.
 */
export function serializeAppParts(parts: readonly AppDraftPart[]): { text: string; attachments: Attachment[] } {
  const attachments: Attachment[] = [];
  const pieces = parts.map((part) => {
    if (part.type !== "file") return part.text;
    if (!attachments.some((a) => a.fileName === part.attachment.fileName)) attachments.push(part.attachment);
    return `[[file:${part.attachment.fileName}]]`;
  });
  return { text: pieces.join(" ").trim(), attachments };
}

export function requestAppChatDraft(chatId: string, draft: string) {
  if (draft.length > 2000) throw new Error("The app question is too long.");
  const text = withoutSourceMarkers(draft);
  const composer = composers.get(chatId);
  if (composer) {
    composer.append(text);
    return;
  }
  enqueue(chatId, { text, at: Date.now() });
}

/**
 * Put an app's message in a chat's draft. When the composer hasn't loaded, such as
 * the main chat while the person is on an app's own screen, it waits in this browser
 * until it does, through a reload.
 */
export function requestAppChatMessage(chatId: string, message: AppChatMessage): AppChatDelivery {
  const composer = composers.get(chatId);
  if (!composer) {
    // In this tab only when the browser keeps nothing, with the minute a plain question gets.
    if (!store(chatId, message)) enqueue(chatId, { message, at: Date.now() });
    return "queued";
  }
  return deliver(composer, message);
}

function deliver(composer: Composer, message: AppChatMessage): AppChatDelivery {
  if (composer.appendParts) composer.appendParts(message.parts);
  else {
    const text = appPartsText(message.parts);
    if (text) composer.append(text);
  }
  return "drafted";
}

function enqueue(chatId: string, request: Request) {
  const requests = pending.get(chatId) ?? [];
  pending.set(chatId, [...requests.slice(-9), request]);
}

export function registerAppChatComposer(
  chatId: string,
  append: (text: string) => void,
  handlers: AppChatComposerHandlers = {},
) {
  const composer: Composer = { append, ...handlers };
  composers.set(chatId, composer);
  for (const message of takeStored(chatId)) deliver(composer, message);
  const requests = pending.get(chatId) ?? [];
  pending.delete(chatId);
  for (const request of requests) {
    if (Date.now() - request.at >= QUEUE_MS) continue;
    if ("text" in request) append(request.text);
    else deliver(composer, request.message);
  }
  return () => {
    if (composers.get(chatId) === composer) composers.delete(chatId);
  };
}
