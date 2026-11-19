import { parseHTML } from 'linkedom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CaptureDraftSession } from '@/lib/client/capture-storage';

const storage = vi.hoisted(() => ({ create: vi.fn(), recoverable: vi.fn(), restore: vi.fn() }));
vi.mock('@/lib/client/capture-storage', () => ({ captureStorage: storage }));
const { useCaptureDraft } = await import('./use-capture-draft');

type Draft = ReturnType<typeof useCaptureDraft>;
let root: Root;
let draft: Draft;

function fakeSession(id: string) {
  return { id, save: vi.fn(async () => {}), discard: vi.fn(async () => {}), release: vi.fn() } satisfies CaptureDraftSession;
}
function later<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function Probe({ onRender }: { onRender(value: Draft): void }) { onRender(useCaptureDraft(true)); return null; }
const probe = () => createElement(Probe, { onRender: value => { draft = value; } });
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

beforeEach(async () => {
  const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  storage.create.mockReset(); storage.recoverable.mockReset(); storage.restore.mockReset();
  storage.recoverable.mockResolvedValue([{ id: 'saved', text: 'Saved before the reload', updatedAt: 1, imageCount: 0, submission: 'editing' }]);
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it('keeps a draft restored before the first reservation arrives, and discards that draft', async () => {
  const firstReservation = later<CaptureDraftSession>();
  const reserved = fakeSession('reserved');
  const restored = fakeSession('saved');
  storage.create.mockReturnValueOnce(firstReservation.promise).mockResolvedValue(fakeSession('next'));
  storage.restore.mockResolvedValue({ session: restored, draft: { text: 'Saved before the reload', usedVoice: false, files: [], submission: 'editing' }, missingFiles: [] });
  await act(async () => root.render(probe()));
  await settle();
  await act(async () => draft.restore('saved'));
  expect(draft.value.text).toBe('Saved before the reload');

  await act(async () => firstReservation.resolve(reserved));
  await settle();
  expect(reserved.release).toHaveBeenCalled();
  expect(restored.release).not.toHaveBeenCalled();

  await act(async () => { await draft.discard(); });
  expect(restored.discard).toHaveBeenCalled();
  expect(reserved.discard).not.toHaveBeenCalled();
});

it('keeps one session when the first reservation lands while Discard reserves another', async () => {
  const firstReservation = later<CaptureDraftSession>();
  const afterDiscard = later<CaptureDraftSession>();
  const reserved = fakeSession('reserved');
  const restored = fakeSession('saved');
  const replacement = fakeSession('replacement');
  storage.create.mockReturnValueOnce(firstReservation.promise).mockReturnValueOnce(afterDiscard.promise);
  storage.restore.mockResolvedValue({ session: restored, draft: { text: 'Discard me', usedVoice: false, files: [], submission: 'editing' }, missingFiles: [] });
  await act(async () => root.render(probe()));
  await settle();
  await act(async () => draft.restore('saved'));
  let discarded!: Promise<boolean>;
  await act(async () => { discarded = draft.discard(); });
  await act(async () => firstReservation.resolve(reserved));
  await settle();
  await act(async () => { afterDiscard.resolve(replacement); await discarded; });

  expect(restored.discard).toHaveBeenCalled();
  expect(reserved.release).toHaveBeenCalled();
  expect(replacement.release).not.toHaveBeenCalled();
  await act(async () => draft.edit({ text: 'Typed next' }));
  expect(replacement.save).toHaveBeenCalled();
  expect(reserved.save).not.toHaveBeenCalled();
});
