import { expect, it, vi } from "vitest";
import {
  appPartsText,
  registerAppChatComposer,
  requestAppChatDraft,
  requestAppChatMessage,
  serializeAppParts,
  type AppDraftPart,
} from "./app-chat-intent";
it("stages into only the selected composer, once, even if the composer loads later", () => {
  const a = vi.fn(),
    b = vi.fn();
  const offB = registerAppChatComposer("draft-b", b);
  requestAppChatDraft("draft-a", "<b>literal text</b>");
  expect(b).not.toHaveBeenCalled();
  const offA = registerAppChatComposer("draft-a", a);
  expect(a).toHaveBeenCalledExactlyOnceWith("<b>literal text</b>");
  offA();
  const offAgain = registerAppChatComposer("draft-a", a);
  expect(a).toHaveBeenCalledTimes(1);
  requestAppChatDraft("draft-a", "Next question");
  expect(a).toHaveBeenLastCalledWith("Next question");
  offAgain();
  offB();
});
const attachment = { fileName: "01900000-0000-7000-8000-000000000001.png", originalName: "Front view.png", mimeType: "image/png", size: 68, uploadedAt: "2026-10-19T00:00:00.000Z" };
const parts: AppDraftPart[] = [
  { type: "text", text: "Explain the clearance of" },
  { type: "snippet", title: "M6 hex bolt", text: "Selected: M6 hex bolt" },
  { type: "file", attachment },
];
it("serializes app parts as the composer sends chips: titled items as their text, files as markers", () => {
  expect(serializeAppParts(parts)).toEqual({ text: `Explain the clearance of Selected: M6 hex bolt [[file:${attachment.fileName}]]`, attachments: [attachment] });
  expect(appPartsText(parts)).toBe("Explain the clearance of Selected: M6 hex bolt");
});
it("puts an app's message in the draft, never sends it", () => {
  const appendParts = vi.fn(), append = vi.fn();
  const off = registerAppChatComposer("rich", append, { appendParts });
  expect(requestAppChatMessage("rich", { parts })).toBe("drafted");
  expect(appendParts).toHaveBeenCalledExactlyOnceWith(parts);
  expect(append).not.toHaveBeenCalled();
  off();
  // A text-only composer gets the text.
  const offText = registerAppChatComposer("plain", append);
  expect(requestAppChatMessage("plain", { parts })).toBe("drafted");
  expect(append).toHaveBeenCalledExactlyOnceWith("Explain the clearance of Selected: M6 hex bolt");
  offText();
});
it("holds a draft for a chat that is still opening, then puts it there once", () => {
  expect(requestAppChatMessage("opening", { parts })).toBe("queued");
  const appendParts = vi.fn();
  const off = registerAppChatComposer("opening", vi.fn(), { appendParts });
  expect(appendParts).toHaveBeenCalledExactlyOnceWith(parts);
  off();
  const again = vi.fn();
  const offAgain = registerAppChatComposer("opening", vi.fn(), { appendParts: again });
  expect(again).not.toHaveBeenCalled();
  offAgain();
});
it("never lets a local app's draft carry a source marker", () => {
  const append = vi.fn();
  const off = registerAppChatComposer("local", append);
  requestAppChatDraft("local", "Look at [[source:eyJ2IjoxfQ]]");
  expect(append).toHaveBeenCalledExactlyOnceWith("Look at (source:eyJ2IjoxfQ]]");
  off();
});
it("does not put an old abandoned question into a later composer", () => {
  vi.useFakeTimers();
  requestAppChatDraft("expired", "Old question");
  vi.advanceTimersByTime(60001);
  const append = vi.fn(),
    off = registerAppChatComposer("expired", append);
  expect(append).not.toHaveBeenCalled();
  off();
  vi.useRealTimers();
});
it("keeps an app's message for a chat that isn't open through a reload, as the person's own draft, and puts it there once", async () => {
  const saved = new Map<string, string>();
  const localStorage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); }, removeItem: (key: string) => { saved.delete(key); } };
  vi.stubGlobal("window", { localStorage });
  vi.useFakeTimers();
  try {
    vi.resetModules();
    const before = await import("./app-chat-intent");
    // The person is on the app's own screen, and the main chat isn't open.
    expect(before.requestAppChatMessage("main-chat", { parts })).toBe("queued");
    // Long after a minute, and after a reload.
    vi.advanceTimersByTime(60 * 60_000);
    vi.resetModules();
    const after = await import("./app-chat-intent");
    const appendParts = vi.fn();
    const off = after.registerAppChatComposer("main-chat", vi.fn(), { appendParts });
    expect(appendParts).toHaveBeenCalledExactlyOnceWith(parts);
    off();
    const again = vi.fn();
    const offAgain = after.registerAppChatComposer("main-chat", vi.fn(), { appendParts: again });
    expect(again).not.toHaveBeenCalled();
    offAgain();
    expect(saved.size).toBe(0);
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  }
});
